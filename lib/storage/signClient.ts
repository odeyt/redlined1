/**
 * Client-side signed URLs for shop-assets.
 *
 * Signing happens at RENDER time and never touches stored values. That is a
 * deliberate constraint, not a style preference: InspectionsView writes
 * `items` back with updateInspection(), and PartsView writes `photos` back
 * with updatePart(). If a signed URL reached those fields it would be
 * persisted, and every one of those rows would end up holding a token that
 * stops working within the hour. Stored values stay canonical public URLs;
 * only what the <img> receives is signed.
 *
 * Two things make this cheap enough to do per render:
 *
 *   1. A module-level cache keyed by object path. A vehicle gallery, a parts
 *      list and an inspection all reuse the same signature for the same file.
 *   2. A microtask-batched queue. Fifty <StorageImage> components mounting in
 *      the same tick produce ONE createSignedUrls call, not fifty.
 *
 * Requests are signed as the current user, so the storage RLS policy decides
 * what may be signed — a member gets their own shop's objects and nothing
 * else.
 */
import { supabase } from '@/lib/supabase';
import { SHOP_ASSETS_BUCKET, toStoragePath } from '@/lib/storage/storagePath';

/**
 * How long a signed URL lasts, and when we stop reusing a cached one.
 *
 * An hour comfortably covers a technician working through a vehicle, and the
 * refresh margin means a URL handed out now is still valid for at least five
 * minutes — long enough for the image to load on a slow shop connection.
 */
const TTL_SECONDS = 60 * 60;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type CacheEntry = { url: string; expiresAt: number };

const cache = new Map<string, CacheEntry>();

/** Paths waiting to be signed in the next batch, with their waiters. */
let pending = new Map<string, Array<(url: string | null) => void>>();
let flushScheduled = false;

function fresh(path: string): string | null {
  const hit = cache.get(path);
  if (hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now()) return hit.url;
  return null;
}

async function flush(): Promise<void> {
  const batch = pending;
  pending = new Map();
  flushScheduled = false;

  const paths = [...batch.keys()];
  if (paths.length === 0) return;

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
    }
    // Any path the response omitted entirely still has waiters to release.
    for (const [path, waiters] of batch) {
      if (!cache.has(path)) waiters.forEach(w => w(null));
    }
  } catch {
    // Resolve rather than reject: a caller that cannot sign falls back to the
    // stored URL, which still works while the bucket is public. Throwing here
    // would take out whatever component is rendering.
    for (const waiters of batch.values()) waiters.forEach(w => w(null));
  }
}

/**
 * Signs one stored URL, returning null when it cannot be signed.
 *
 * Null means "use the original" rather than "show nothing" — callers decide,
 * and while the bucket is public the original still resolves.
 */
export function signStoredUrlClient(value: string | null | undefined): Promise<string | null> {
  const path = toStoragePath(value);
  if (!path) return Promise.resolve(null);

  const cached = fresh(path);
  if (cached) return Promise.resolve(cached);

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

/** Test seam. Signed URLs are per-session, so nothing survives a sign-out. */
export function clearSignedUrlCache(): void {
  cache.clear();
  pending = new Map();
  flushScheduled = false;
}
