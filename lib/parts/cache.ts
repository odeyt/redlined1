import 'server-only';

/**
 * A short-lived, in-process cache for provider responses.
 *
 * ## Why in-memory and not a table
 *
 * Marketplace listing data is licensed, not ours. eBay's terms limit how long
 * their data may be retained, so mirroring it into Postgres would be a
 * licensing decision dressed up as a performance optimisation. An in-process
 * cache with a short TTL is the conservative reading: it exists to stop a
 * technician retyping the same search three times, not to build a price
 * database.
 *
 * The trade-off is honest — serverless instances are ephemeral and each one
 * keeps its own copy, so the hit rate is modest. That is acceptable for its
 * actual purpose. A shared cache is a later decision that needs the licensing
 * question answered first, and this file is where it would go.
 *
 * ## What is never cached
 *
 * Tokens and credentials. The eBay token has its own lifetime in its own
 * module; it must not end up in a keyed store that anything can enumerate.
 */
import type { NormalizedPartResult, PartsProviderId, PartsSearchInput } from './types';

const DEFAULT_TTL_MS = Number(process.env.PARTS_CACHE_TTL_MS ?? 5 * 60_000);
/** A hard cap so a busy shop cannot grow this without bound. */
const MAX_ENTRIES = 200;

interface Entry {
  results: NormalizedPartResult[];
  storedAt: number;
  expiresAt: number;
}

const store = new Map<string, Entry>();

/**
 * The cache key.
 *
 * Vehicle context is part of it, and that is not optional: the same query for
 * a different vehicle is a different question, and reusing the answer would
 * hand one vehicle another's fitment verdict. Currency and country are in
 * there for the same reason — a price is not portable between them.
 *
 * No shop id: the key is derived entirely from the search terms, and results
 * are public marketplace listings rather than tenant data. Two shops searching
 * the same part for the same vehicle genuinely have the same answer. Nothing
 * shop-specific — cost, markup, sell price — is ever stored here; that is
 * computed after the search and lives on the estimate.
 */
export function cacheKey(provider: PartsProviderId, input: PartsSearchInput): string {
  const vehicle = [input.year, input.make, input.model, input.trim, input.engine]
    .map(v => String(v ?? '').trim().toLowerCase())
    .join('|');
  return [
    provider,
    input.query.trim().toLowerCase(),
    vehicle,
    (input.oemNumber ?? '').trim().toLowerCase(),
    (input.manufacturerPartNumber ?? '').trim().toLowerCase(),
    (input.country ?? '').trim().toLowerCase(),
    (input.currency ?? '').trim().toLowerCase(),
  ].join('::');
}

export interface CacheHit {
  results: NormalizedPartResult[];
  storedAt: number;
}

export function readCache(key: string, now = Date.now()): CacheHit | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    store.delete(key);
    return null;
  }
  return { results: hit.results, storedAt: hit.storedAt };
}

export function writeCache(
  key: string,
  results: NormalizedPartResult[],
  opts: { ttlMs?: number; now?: number } = {},
): void {
  const now = opts.now ?? Date.now();
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  if (ttl <= 0) return;

  // Oldest-first eviction. Crude, and correct for a cache this small.
  if (store.size >= MAX_ENTRIES) {
    const oldest = [...store.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt)[0];
    if (oldest) store.delete(oldest[0]);
  }

  store.set(key, { results, storedAt: now, expiresAt: now + ttl });
}

export function clearCache(): void {
  store.clear();
}

export function cacheSize(): number {
  return store.size;
}
