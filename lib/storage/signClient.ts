/**
 * Client-side signed URLs for shop-assets, and the lifecycle that keeps them
 * alive for as long as the page is open.
 *
 * Signing happens at RENDER time and never touches stored values. That is a
 * deliberate constraint, not a style preference: InspectionsView writes
 * `items` back with updateInspection(), and PartsView writes `photos` back
 * with updatePart(). If a signed URL reached those fields it would be
 * persisted, and every one of those rows would end up holding a token that
 * stops working within the hour. Stored values stay canonical; only what the
 * <img> receives is signed.
 *
 * Requests are signed as the current user, so the storage RLS policy
 * (can_read_shop_asset) decides what may be signed — a member gets their own
 * shop's objects and nothing else. The service-role key is never in the
 * browser; the authorization boundary is the database, not a route handler.
 *
 * Two things make signing cheap enough to do per render:
 *
 *   1. A module-level cache keyed by object path. A vehicle gallery, a parts
 *      list and an inspection all reuse the same signature for the same file.
 *   2. A microtask-batched queue. Fifty <StorageImage> components mounting in
 *      the same tick produce ONE createSignedUrls call, not fifty.
 *
 * ## Why there is a lifecycle here at all
 *
 * A signature lasts an hour. Every URL on the Vehicles page was minted when
 * the page loaded, and `loading="lazy"` means an off-screen thumbnail does
 * not FETCH its URL until it is scrolled to — which, on a tab a shop leaves
 * open all day, is long after that URL died. The photo was never lost; the
 * link to it was. Images already in the browser cache kept rendering, which
 * is why it looked like photos erasing themselves one at a time.
 *
 * So a signature cannot be a one-shot value handed to a component. It has to
 * be a subscription: the component says which object it is showing, and this
 * module re-signs before expiry, on tab focus, and on demand after a failed
 * load, pushing the new URL to whoever is showing that object. Everything
 * still goes through the same batch, so a refresh of a screen full of
 * thumbnails is one request.
 */
import { supabase } from '@/lib/supabase';
import { SHOP_ASSETS_BUCKET, toStoragePath } from '@/lib/storage/storagePath';

/**
 * How long a signed URL lasts.
 *
 * An hour comfortably covers a technician working through a vehicle. It is
 * NOT the fix for expiry — raising it would only move the cliff — and the
 * lifecycle below is what keeps a long-lived page working.
 */
export const TTL_SECONDS = 60 * 60;

/**
 * How long before expiry a URL is considered due for renewal.
 *
 * Eight minutes: far enough ahead that a slow shop connection finishes the
 * fetch, close enough that a page open for a minute is not re-signing
 * constantly. A URL handed out is therefore always valid for at least this
 * long, which is also what makes it safe to hand one to a lazy <img>.
 */
export const REFRESH_MARGIN_MS = 8 * 60 * 1000;

/** How often the lifecycle looks for URLs coming due. */
export const REFRESH_CHECK_INTERVAL_MS = 60 * 1000;

type CacheEntry = { url: string; expiresAt: number };

const cache = new Map<string, CacheEntry>();

/** Paths waiting to be signed in the next batch, with their waiters. */
let pending = new Map<string, Array<(url: string | null) => void>>();
let flushScheduled = false;

/** Live subscribers, keyed by object path. */
const subscribers = new Map<string, Set<(url: string | null) => void>>();

/**
 * Counts every createSignedUrls call and every path in it.
 *
 * Exported because "does this refresh stay batched" is a correctness property
 * of this module, not a performance nicety — a naive per-image refresh on a
 * fleet page is 550 requests a minute. Tests assert on these.
 */
export const signingStats = { requests: 0, pathsRequested: 0 };

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return !!entry && entry.expiresAt - REFRESH_MARGIN_MS > Date.now();
}

function fresh(path: string): string | null {
  const hit = cache.get(path);
  return isFresh(hit) ? hit.url : null;
}

function notify(path: string, url: string | null): void {
  const subs = subscribers.get(path);
  if (!subs) return;
  for (const cb of [...subs]) cb(url);
}

async function flush(): Promise<void> {
  const batch = pending;
  pending = new Map();
  flushScheduled = false;

  const paths = [...batch.keys()];
  if (paths.length === 0) return;

  signingStats.requests++;
  signingStats.pathsRequested += paths.length;

  try {
    const { data, error } = await supabase.storage
      .from(SHOP_ASSETS_BUCKET)
      .createSignedUrls(paths, TTL_SECONDS);

    if (error || !data) throw error ?? new Error('no data');

    const signedAt = Date.now();
    for (const row of data) {
      const waiters = row.path ? batch.get(row.path) : undefined;
      if (!waiters) continue;
      if (row.error || !row.signedUrl) {
        waiters.forEach(w => w(null));
        continue;
      }
      cache.set(row.path!, { url: row.signedUrl, expiresAt: signedAt + TTL_SECONDS * 1000 });
      waiters.forEach(w => w(row.signedUrl!));
      notify(row.path!, row.signedUrl!);
    }
    // Any path the response omitted entirely still has waiters to release.
    for (const [path, waiters] of batch) {
      if (!cache.has(path)) waiters.forEach(w => w(null));
    }
  } catch {
    // Resolve rather than reject: throwing here would take out whatever
    // component is rendering. A null tells the caller signing failed, and the
    // caller decides what to show.
    for (const waiters of batch.values()) waiters.forEach(w => w(null));
  }
}

function enqueue(path: string): Promise<string | null> {
  return new Promise<string | null>(resolve => {
    const waiters = pending.get(path);
    if (waiters) waiters.push(resolve);
    else pending.set(path, [resolve]);

    if (!flushScheduled) {
      flushScheduled = true;
      // Microtask, not a timer: everything mounting in this tick joins the
      // same batch, and the request still leaves before paint.
      queueMicrotask(() => { void flush(); });
    }
  });
}

/**
 * Signs an object path, returning null when it cannot be signed.
 *
 * `force` skips the cache — used by a refresh and by the one retry a failed
 * <img> gets, where the whole point is that the cached value is the problem.
 */
export function signPathClient(path: string, opts: { force?: boolean } = {}): Promise<string | null> {
  if (!path) return Promise.resolve(null);
  if (!opts.force) {
    const cached = fresh(path);
    if (cached) return Promise.resolve(cached);
  } else {
    cache.delete(path);
  }
  return enqueue(path);
}

/**
 * Signs one stored value, returning null when it cannot be signed.
 *
 * Accepts either a canonical object key (`vehicles/<id>/<file>`) or a legacy
 * stored URL, so callers migrating to `storage_path` and callers still on
 * `url` use the same function.
 */
export function signStoredUrlClient(value: string | null | undefined): Promise<string | null> {
  const path = resolveObjectPath(value);
  if (!path) return Promise.resolve(null);
  return signPathClient(path);
}

/**
 * The object key for whatever the caller has.
 *
 * A bare key passes through; a stored shop-assets URL is parsed. Anything
 * else — a blob: preview, a data: URI, a third-party image — returns null,
 * which is what tells the render path to leave that value alone.
 */
export function resolveObjectPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith('/')) {
    // Already a key. Strip a cache-buster if one was appended by hand.
    const bare = value.split('?')[0].split('#')[0];
    return bare || null;
  }
  return toStoragePath(value);
}

/** When the cached signature for a path expires, or 0 if there is none. */
export function signedUrlExpiry(path: string): number {
  return cache.get(path)?.expiresAt ?? 0;
}

/** True when a path has no signature, or one that is within the refresh margin. */
export function isDueForRefresh(path: string): boolean {
  return !isFresh(cache.get(path));
}

/**
 * Re-signs a path now and pushes the result to every subscriber.
 *
 * Batched like everything else, so refreshing a whole page of thumbnails at
 * once is a single request.
 */
export function refreshSignedPath(path: string): Promise<string | null> {
  return signPathClient(path, { force: true });
}

/** Re-signs every subscribed path that is at or near expiry. One batch. */
export function refreshExpiring(): void {
  for (const path of subscribers.keys()) {
    if (isDueForRefresh(path)) void signPathClient(path, { force: true });
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | null = null;
let listenersAttached = false;

function onVisible(): void {
  // A tab restored after hours is the case that produced the bug report.
  // Anything inside the margin is renewed before the browser is asked to
  // fetch it, which for a lazy thumbnail is the moment it scrolls into view.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  refreshExpiring();
}

/**
 * The periodic check, which does nothing while the tab is hidden.
 *
 * Signing a screenful of URLs nobody is looking at is pure cost, and browsers
 * throttle background timers anyway — so a hidden tab is expected to come back
 * with expired URLs, and `onVisible` is what repairs it. Skipping the work
 * here is what makes that the ONLY path back, rather than something that
 * usually happens to have been handled by a timer that may or may not have
 * fired.
 */
function tick(): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  refreshExpiring();
}

function startLifecycle(): void {
  if (typeof window === 'undefined') return;
  if (!listenersAttached) {
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    listenersAttached = true;
  }
  if (timer === null) {
    timer = setInterval(tick, REFRESH_CHECK_INTERVAL_MS);
  }
}

function stopLifecycle(): void {
  if (typeof window === 'undefined') return;
  if (listenersAttached) {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    listenersAttached = false;
  }
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Keeps one object's signature current for as long as the caller is showing
 * it. Returns an unsubscribe.
 *
 * The callback fires only on renewal, never with the initial value — the
 * caller already has that from signPathClient — so a component does not have
 * to guard against a redundant first render.
 */
export function subscribeSignedPath(path: string, cb: (url: string | null) => void): () => void {
  if (!path) return () => {};
  let subs = subscribers.get(path);
  if (!subs) { subs = new Set(); subscribers.set(path, subs); }
  subs.add(cb);
  startLifecycle();

  return () => {
    const live = subscribers.get(path);
    if (!live) return;
    live.delete(cb);
    if (live.size === 0) subscribers.delete(path);
    if (subscribers.size === 0) stopLifecycle();
  };
}

/** Test seam. Signed URLs are per-session, so nothing survives a sign-out. */
export function clearSignedUrlCache(): void {
  cache.clear();
  pending = new Map();
  flushScheduled = false;
  subscribers.clear();
  stopLifecycle();
  signingStats.requests = 0;
  signingStats.pathsRequested = 0;
}
