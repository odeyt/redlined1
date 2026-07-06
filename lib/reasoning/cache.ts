/**
 * RedlineD1 — ERE Cache
 * Sprint 6 — Part 11
 *
 * In-memory TTL cache for Evidence & Reasoning Engine outputs.
 * Invalidates by repair case ID for instant freshness when a case is updated.
 */

import { CacheEntry, CACHE_TTL } from './types';

export type CacheBucket = keyof typeof CACHE_TTL;

// ─── Main ─────────────────────────────────────────────────────────────────────

export class ERECache {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  // ── Read ──────────────────────────────────────────────────────────────────

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  set<T>(key: string, value: T, bucket: CacheBucket): void {
    this.store.set(key, {
      key,
      value,
      cachedAt: Date.now(),
      ttlMs: CACHE_TTL[bucket],
    });
  }

  // ── Invalidation ──────────────────────────────────────────────────────────

  /**
   * Remove all cached entries whose key contains the given repair case ID.
   * Called when a repair case is updated so stale reasoning isn't served.
   */
  invalidateByRepairCase(repairCaseId: string): void {
    for (const key of this.store.keys()) {
      if (key.includes(repairCaseId)) {
        this.store.delete(key);
      }
    }
  }

  /** Remove a single entry by exact key. */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Clear all entries (use for testing or shop logout). */
  flush(): void {
    this.store.clear();
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  size(): number {
    return this.store.size;
  }

  /** Returns keys of all non-expired entries (for debugging). */
  activeKeys(): string[] {
    const now = Date.now();
    return Array.from(this.store.entries())
      .filter(([, e]) => now - e.cachedAt <= e.ttlMs)
      .map(([k]) => k);
  }
}
