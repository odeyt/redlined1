import 'server-only';

/**
 * Searching every enabled provider at once, and surviving any of them failing.
 *
 * `Promise.allSettled`, not `Promise.all`: one provider timing out must not
 * cost the technician the results from the others. A rejected provider becomes
 * a reported outcome, never a thrown request — the search endpoint returns 200
 * with partial results and an explanation, because "eBay is slow" is not a
 * reason to break estimate creation.
 *
 * Everything a provider says is untrusted, so results are re-checked here
 * (title present, fitment a known value) before ranking. Cheap, and it means a
 * provider bug cannot put an unlabelled card in front of someone.
 */
import { logger } from '@/lib/logger';
import { getEnabledProviders, getAllProviderHealth } from './providerRegistry';
import { cacheKey, readCache, writeCache } from './cache';
import type {
  NormalizedPartResult, PartsSearchInput, PartsSearchResponse, ProviderOutcome,
  FitmentStatus,
} from './types';

const VALID_FITMENT: FitmentStatus[] = ['verified', 'likely', 'unverified', 'incompatible'];

/** A provider error, reduced to something safe to show a technician. */
function describeFailure(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (msg === 'RATE_LIMITED') return 'Rate limited — try again shortly.';
  if (msg === 'UNAUTHORIZED') return 'The provider rejected our credentials.';
  if (/abort/i.test(msg)) return 'Timed out.';
  if (/^HTTP_5/.test(msg)) return 'The provider is temporarily unavailable.';
  if (/^HTTP_/.test(msg)) return 'The provider rejected the request.';
  // Never the raw message: a provider error can echo a URL, and a URL can
  // carry a token.
  return 'Unavailable.';
}

function isUsable(r: NormalizedPartResult): boolean {
  return Boolean(r && typeof r.title === 'string' && r.title.trim())
    && VALID_FITMENT.includes(r.fitmentStatus);
}

export interface SearchOptions {
  /** Skip the cache — used by an explicit "refresh market price". */
  bypassCache?: boolean;
  now?: Date;
}

export async function searchAllProviders(
  input: PartsSearchInput,
  options: SearchOptions = {},
): Promise<PartsSearchResponse> {
  const now = options.now ?? new Date();
  const providers = getEnabledProviders();
  const outcomes: ProviderOutcome[] = [];
  const results: NormalizedPartResult[] = [];

  // No enabled provider is a normal state, not an error. The UI shows why and
  // keeps manual entry available.
  if (!providers.length) {
    return {
      results: [],
      providers: getAllProviderHealth(),
      outcomes: [],
      searchedAt: now.toISOString(),
    };
  }

  const settled = await Promise.allSettled(providers.map(async provider => {
    const key = cacheKey(provider.id, input);

    if (!options.bypassCache) {
      const hit = readCache(key);
      if (hit) {
        return { provider: provider.id, results: hit.results, cached: true };
      }
    }

    const found = await provider.searchParts(input);
    const usable = found.filter(isUsable);
    writeCache(key, usable);
    return { provider: provider.id, results: usable, cached: false };
  }));

  settled.forEach((outcome, i) => {
    const provider = providers[i];
    if (outcome.status === 'fulfilled') {
      results.push(...outcome.value.results);
      outcomes.push({
        provider: provider.id,
        ok: true,
        count: outcome.value.results.length,
        cached: outcome.value.cached,
      });
      return;
    }

    // Logged with an identifier and a shape, never the payload or the query's
    // vehicle details.
    logger.warn('parts.provider.search_failed', {
      provider: provider.id,
      reason: outcome.reason instanceof Error ? outcome.reason.message : 'unknown',
    });
    outcomes.push({
      provider: provider.id,
      ok: false,
      count: 0,
      message: describeFailure(outcome.reason),
    });
  });

  return {
    results,
    providers: getAllProviderHealth(),
    outcomes,
    searchedAt: now.toISOString(),
  };
}
