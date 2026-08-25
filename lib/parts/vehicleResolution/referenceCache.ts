import 'server-only';

/**
 * Catalogue reference data, held long enough to stop it eating the month.
 *
 * ## TTLs, and why these numbers
 *
 *   manufacturers      7 days   a marque list changes when a marque is born
 *   models            24 hours  new series appear a few times a year
 *   vehicle variants  24 hours  same
 *   vehicle detail    24 hours  technical facts about a built car do not move
 *   OEM applicability  1 hour   the one that is genuinely about parts data,
 *                               and the one worth re-asking
 *
 * The allowance is ~100 calls a month. A manufacturer list fetched once per
 * search would exhaust it in a day of ordinary work, so these are not a
 * performance optimisation — they are what makes the feature usable at all.
 *
 * ## Two tiers: memory, then Postgres (M-PARTS2C.3)
 *
 * This file used to argue for memory ONLY, on the grounds that the provider's
 * terms concern retention and a table of their catalogue is a mirror of it.
 * That reasoning was right about mirrors and wrong about what this is, and
 * the cost of it was measured rather than theorised: on Vercel every
 * deployment and every cold start empties the Map, so resolving one vehicle
 * re-pays three calls. During M-PARTS2C.2 validation a single redeploy
 * mid-run consumed the whole remaining budget. Against a ~100 call month that
 * is the dominant cost, not a rounding error.
 *
 * What makes the second tier a cache rather than a mirror is enforced, not
 * asserted:
 *
 *   - every row carries an expiry, and an expired row is never served
 *   - expired rows are DELETED on encounter, so nothing accumulates
 *   - only reference endpoints may persist. `isPersistable` refuses any path
 *     carrying a free-text segment, so a search term cannot land in a table
 *     however the caller was written
 *
 * Reference lists carry no tenant data and are identical for every shop, so
 * the table has no shop_id and no RLS policy — service_role only.
 *
 * The persisted vehicle MAPPING remains a different thing: it is tenant data,
 * fingerprint-driven rather than TTL-driven.
 */
import { autoPartsApiRequest } from '../providers/autopartsapi/client';
import type {
  EndpointCategory, PartsProviderCallContext, UsageOutcome,
} from '../providers/autopartsapi/telemetry';

export const TTL = {
  manufacturers: 7 * 24 * 60 * 60_000,
  models: 24 * 60 * 60_000,
  vehicleVariants: 24 * 60 * 60_000,
  vehicleDetail: 24 * 60 * 60_000,
  applicability: 60 * 60_000,
} as const;

interface Entry<T> { value: T; expiresAt: number }

const store = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 500;

export function clearReferenceCache(): void { store.clear(); }
export function referenceCacheSize(): number { return store.size; }

/** Where the persistent tier lives. */
const CACHE_TABLE = 'parts_provider_reference_cache';

/**
 * Whether a provider path may be written to the durable tier.
 *
 * Reference paths carry catalogue ids and nothing else. The vehicle-first
 * search path carries the technician's own words —
 * `.../search-param/brake%20pads` — and a search term must never be stored.
 *
 * Written as an ALLOW-list of the reference categories rather than a
 * blocklist of bad paths: a new endpoint added later is then non-persistable
 * until someone decides otherwise, which is the safe direction to fail.
 */
const PERSISTABLE: ReadonlySet<EndpointCategory> = new Set<EndpointCategory>([
  'manufacturers', 'models', 'vehicle_variants', 'vehicle_detail',
]);

export function isPersistable(category: EndpointCategory, path: string): boolean {
  if (!PERSISTABLE.has(category)) return false;
  // Belt and braces. Even inside an allowed category, a path carrying a
  // free-text segment is refused — the category could be passed wrongly, and
  // this is the last check before a term would be written to a table.
  if (/search-param|%20|\?|#/i.test(path)) return false;
  return true;
}

/**
 * Fetch through the cache.
 *
 * The cache is keyed on the provider PATH, which already encodes every
 * dimension that changes the answer — type, manufacturer, model, language and
 * market filter are all path segments. A key built by hand from a subset of
 * those is how one manufacturer's models get served for another.
 *
 * Coalescing lives in the client, keyed on the same URL, so a concurrent
 * miss does not become two upstream calls.
 */
export async function cachedFetch<T>(
  path: string,
  category: EndpointCategory,
  ttlMs: number,
  opts: {
    shopId?: string;
    now?: number;
    bypass?: boolean;
    /** Who is asking. Required for the same reason the client requires it. */
    callContext?: PartsProviderCallContext;
    /**
     * Told how the lookup was answered.
     *
     * The resolver used to increment its `externalCalls` after every
     * cachedFetch, so a fully-cached resolution reported spending calls it
     * had not spent. Harmless-looking, but that number is the budget figure,
     * and after M-PARTS2C.3 it is the one that shows the durable cache
     * working — a counter that cannot tell a hit from a call makes the
     * milestone invisible in its own accounting.
     */
    onOutcome?: (outcome: UsageOutcome) => void;
  } = {},
): Promise<T> {
  const now = opts.now ?? Date.now();
  const callContext = opts.callContext ?? 'application';

  if (!opts.bypass) {
    const hit = store.get(path);
    if (hit && hit.expiresAt > now) {
      // Recorded as a cache hit so the month's external count stays honest,
      // and so the cache's effectiveness is visible rather than inferred.
      const { recordUsage } = await import('../providers/autopartsapi/telemetry');
      void recordUsage({
        shopId: opts.shopId, category, callContext,
        outcome: 'cache_hit', success: true,
      });
      opts.onOutcome?.('cache_hit');
      return hit.value as T;
    }
  }

  /**
   * Tier two: Postgres. This is the tier that survives a deployment, and the
   * whole reason M-PARTS2C.3 exists.
   *
   * Every failure here is swallowed. A cache that cannot be read is a slow
   * cache; a cache that throws is an outage. The provider call below is
   * always still available.
   */
  if (!opts.bypass && isPersistable(category, path)) {
    const hit = await readPersistent<T>(path, now);
    if (hit !== undefined) {
      // Promote into memory so the next call in this instance is free.
      store.set(path, { value: hit, expiresAt: now + ttlMs });
      const { recordUsage } = await import('../providers/autopartsapi/telemetry');
      void recordUsage({
        shopId: opts.shopId, category, callContext,
        outcome: 'persistent_hit', success: true,
      });
      opts.onOutcome?.('persistent_hit');
      return hit;
    }
  }

  const value = await autoPartsApiRequest<T>(path, undefined, {
    shopId: opts.shopId,
    category,
    callContext,
  });
  opts.onOutcome?.('external');

  if (store.size >= MAX_ENTRIES) {
    const oldest = [...store.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) store.delete(oldest[0]);
  }
  store.set(path, { value, expiresAt: now + ttlMs });

  if (isPersistable(category, path)) {
    await writePersistent(path, category, value, now + ttlMs);
  }
  return value;
}

/**
 * Read the durable tier, refusing anything expired.
 *
 * An expired row is DELETED rather than left, so the table stays a cache: it
 * holds what is currently valid and nothing older. Returns `undefined` for a
 * miss, which is distinct from a cached `null` payload.
 */
async function readPersistent<T>(path: string, now: number): Promise<T | undefined> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const { data } = await getAdminDb()
      .from(CACHE_TABLE)
      .select('payload, expires_at')
      .eq('cache_key', path)
      .maybeSingle();

    if (!data) return undefined;

    const expiresAt = Date.parse((data as { expires_at: string }).expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      // Sweep on encounter. No cron, no accumulation, and no chance of
      // serving a stale catalogue because a sweeper did not run.
      await getAdminDb().from(CACHE_TABLE).delete().eq('cache_key', path);
      return undefined;
    }
    return (data as { payload: T }).payload;
  } catch {
    return undefined;
  }
}

/** Upsert, because two instances may resolve the same vehicle at once. */
/**
 * The provider host a cached payload came from.
 *
 * HOST only — deliberately parsed out rather than storing the base URL, so a
 * path, a query string or anything that could carry a credential cannot ride
 * along into a provenance column. Falls back to the provider name rather than
 * throwing: provenance failing must never fail a write, and a write failing
 * must never fail a search.
 */
function providerHost(): string {
  try {
    const base = process.env.AUTOPARTS_API_BASE_URL
      ?? 'https://auto-parts-catalog.apiprofile.com/api';
    return new URL(base).host;
  } catch {
    return 'autopartsapi';
  }
}

async function writePersistent(
  path: string, category: EndpointCategory, payload: unknown, expiresAtMs: number,
): Promise<void> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    await getAdminDb()
      .from(CACHE_TABLE)
      .upsert({
        cache_key: path,
        category,
        payload,
        expires_at: new Date(expiresAtMs).toISOString(),
        updated_at: new Date().toISOString(),
        /**
         * Provenance, required by the production cache policy: which
         * provider, from which host, fetched when.
         *
         * `fetched_at` is deliberately distinct from `created_at` — a
         * refreshed row keeps its creation time but must report the age of
         * the payload it currently holds, which is the number that decides
         * whether this is a cache or a mirror.
         *
         * Host only. Never a full URL with parameters, and never the API
         * key, which travels in a header and is not part of any key.
         */
        provider: 'autopartsapi',
        fetched_at: new Date().toISOString(),
        source_host: providerHost(),
      }, { onConflict: 'cache_key' });
  } catch {
    // A cache that cannot be written is a cache that misses. Nothing else.
  }
}
