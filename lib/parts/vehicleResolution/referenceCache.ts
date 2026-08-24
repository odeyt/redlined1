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
 * ## In process, not in Postgres
 *
 * Reference lists carry no tenant data and are identical for every shop, but
 * the provider's terms concern RETENTION, and a table of their catalogue is a
 * mirror of it. An in-process cache expires by construction. The honest
 * trade-off is that serverless instances each keep their own copy, so the hit
 * rate is lower than a shared store would give — acceptable, because the
 * thing being prevented is a per-search call, not every duplicate.
 *
 * The persisted vehicle MAPPING is different and lives in Postgres: it is
 * tenant data, it is fingerprint-driven rather than TTL-driven, and it is the
 * thing that must survive a cold start.
 */
import { autoPartsApiRequest } from '../providers/autopartsapi/client';
import type { EndpointCategory } from '../providers/autopartsapi/telemetry';

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
  opts: { shopId?: string; now?: number; bypass?: boolean } = {},
): Promise<T> {
  const now = opts.now ?? Date.now();

  if (!opts.bypass) {
    const hit = store.get(path);
    if (hit && hit.expiresAt > now) {
      // Recorded as a cache hit so the month's external count stays honest.
      const { recordUsage } = await import('../providers/autopartsapi/telemetry');
      void recordUsage({ shopId: opts.shopId, category, cacheHit: true, success: true });
      return hit.value as T;
    }
  }

  const value = await autoPartsApiRequest<T>(path, undefined, {
    shopId: opts.shopId,
    category,
  });

  if (store.size >= MAX_ENTRIES) {
    const oldest = [...store.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) store.delete(oldest[0]);
  }
  store.set(path, { value, expiresAt: now + ttlMs });
  return value;
}
