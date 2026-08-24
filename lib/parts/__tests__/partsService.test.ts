/**
 * One provider failing must never cost the technician the others — and a
 * marketplace outage must never stop an estimate being written.
 *
 * These are availability tests rather than data tests. The worst outcome this
 * feature could produce is not a bad search result; it is a shop that cannot
 * quote a job because eBay is down.
 */
import { clearCache, cacheKey, readCache, writeCache, cacheSize } from '../cache';
import type { NormalizedPartResult, PartsProvider, PartsSearchInput } from '../types';

const INPUT: PartsSearchInput = {
  query: 'front brake pads',
  year: 2019, make: 'Toyota', model: 'Tacoma',
};

function result(over: Partial<NormalizedPartResult> = {}): NormalizedPartResult {
  return {
    provider: 'ebay',
    title: 'Brake Pad Set',
    currency: 'USD',
    itemPrice: 50,
    landedCost: 50,
    fitmentStatus: 'unverified',
    sourceCheckedAt: '2026-08-23T00:00:00.000Z',
    ...over,
  };
}

function fakeProvider(
  id: PartsProvider['id'],
  behaviour: 'ok' | 'throw' | 'slow' | 'empty',
  results: NormalizedPartResult[] = [result({ provider: id })],
): PartsProvider {
  return {
    id,
    name: id,
    enabled: () => true,
    health: () => ({ id, name: id, enabled: true, status: 'ready' }),
    async searchParts() {
      if (behaviour === 'throw') throw new Error('HTTP_500');
      if (behaviour === 'slow') throw new Error('The operation was aborted');
      if (behaviour === 'empty') return [];
      return results;
    },
  };
}

// The registry is server-only and reads real environment variables, so it is
// replaced wholesale. What is under test here is the orchestration.
const registryMock = {
  getEnabledProviders: jest.fn<PartsProvider[], []>(() => []),
  getAllProviderHealth: jest.fn(() => []),
  anyProviderEnabled: jest.fn(() => true),
};
jest.mock('../providerRegistry', () => registryMock);

// A plain import is safe here: jest.mock above is hoisted, so the registry is
// already replaced by the time this module is evaluated.
import { searchAllProviders } from '../partsService';

describe('searching several providers at once', () => {
  beforeEach(() => {
    clearCache();
    registryMock.getEnabledProviders.mockReset();
    registryMock.getAllProviderHealth.mockReturnValue([]);
  });

  it('returns results from the providers that worked when one throws', () => {
    registryMock.getEnabledProviders.mockReturnValue([
      fakeProvider('ebay', 'ok'),
      fakeProvider('amazon', 'throw'),
    ]);

    return searchAllProviders(INPUT).then(res => {
      expect(res.results).toHaveLength(1);
      expect(res.results[0].provider).toBe('ebay');

      const failed = res.outcomes.find(o => o.provider === 'amazon')!;
      expect(failed.ok).toBe(false);
      expect(failed.count).toBe(0);
      // Reduced to something safe to show. Not the raw error.
      expect(failed.message).toBe('The provider is temporarily unavailable.');
    });
  });

  it('never rejects, whatever every provider does', async () => {
    registryMock.getEnabledProviders.mockReturnValue([
      fakeProvider('ebay', 'throw'),
      fakeProvider('amazon', 'slow'),
    ]);
    const res = await searchAllProviders(INPUT);
    expect(res.results).toEqual([]);
    expect(res.outcomes.every(o => !o.ok)).toBe(true);
    expect(res.outcomes.find(o => o.provider === 'amazon')!.message).toBe('Timed out.');
  });

  it('with no enabled provider it returns empty, not an error', async () => {
    // The modal still opens and manual entry stays available.
    registryMock.getEnabledProviders.mockReturnValue([]);
    const res = await searchAllProviders(INPUT);
    expect(res.results).toEqual([]);
    expect(res.outcomes).toEqual([]);
    expect(res.searchedAt).toBeTruthy();
  });

  it('translates rate limiting and auth failures into plain language', async () => {
    const rateLimited: PartsProvider = {
      ...fakeProvider('ebay', 'ok'),
      async searchParts() { throw new Error('RATE_LIMITED'); },
    };
    const unauthorized: PartsProvider = {
      ...fakeProvider('amazon', 'ok'),
      async searchParts() { throw new Error('UNAUTHORIZED'); },
    };
    registryMock.getEnabledProviders.mockReturnValue([rateLimited, unauthorized]);

    const res = await searchAllProviders(INPUT);
    expect(res.outcomes.find(o => o.provider === 'ebay')!.message)
      .toBe('Rate limited — try again shortly.');
    expect(res.outcomes.find(o => o.provider === 'amazon')!.message)
      .toBe('The provider rejected our credentials.');
  });

  it('never leaks a raw provider error to the client', async () => {
    const leaky: PartsProvider = {
      ...fakeProvider('ebay', 'ok'),
      async searchParts() {
        // A provider error can carry a URL, and a URL can carry a token.
        throw new Error('failed: https://api.ebay.com/x?token=SECRETVALUE');
      },
    };
    registryMock.getEnabledProviders.mockReturnValue([leaky]);
    const res = await searchAllProviders(INPUT);
    expect(res.outcomes[0].message).toBe('Unavailable.');
    expect(JSON.stringify(res)).not.toContain('SECRETVALUE');
  });

  it('drops a malformed result a provider returned', async () => {
    const bad = [
      result({ title: '' }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result({ fitmentStatus: 'definitely' as any }),
      result({ title: 'Good' }),
    ];
    registryMock.getEnabledProviders.mockReturnValue([fakeProvider('ebay', 'ok', bad)]);
    const res = await searchAllProviders(INPUT);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].title).toBe('Good');
  });

  it('serves a repeat search from cache and says so', async () => {
    let calls = 0;
    const counting: PartsProvider = {
      ...fakeProvider('ebay', 'ok'),
      async searchParts() { calls += 1; return [result()]; },
    };
    registryMock.getEnabledProviders.mockReturnValue([counting]);

    await searchAllProviders(INPUT);
    const second = await searchAllProviders(INPUT);

    expect(calls).toBe(1);
    expect(second.outcomes[0].cached).toBe(true);
    expect(second.results).toHaveLength(1);
  });

  it('an explicit refresh bypasses the cache', async () => {
    let calls = 0;
    const counting: PartsProvider = {
      ...fakeProvider('ebay', 'ok'),
      async searchParts() { calls += 1; return [result()]; },
    };
    registryMock.getEnabledProviders.mockReturnValue([counting]);

    await searchAllProviders(INPUT);
    await searchAllProviders(INPUT, { bypassCache: true });
    expect(calls).toBe(2);
  });
});

describe('the cache key', () => {
  beforeEach(clearCache);

  it('separates the same query for different vehicles', () => {
    // Reusing one vehicle's answer for another would hand it the wrong
    // fitment verdict, which is the one mistake this feature must not make.
    const a = cacheKey('ebay', { query: 'pads', year: 2019, make: 'Toyota', model: 'Tacoma' });
    const b = cacheKey('ebay', { query: 'pads', year: 2019, make: 'Toyota', model: 'Hilux' });
    expect(a).not.toBe(b);
  });

  it('separates currency and country', () => {
    expect(cacheKey('ebay', { query: 'p', currency: 'USD' }))
      .not.toBe(cacheKey('ebay', { query: 'p', currency: 'THB' }));
    expect(cacheKey('ebay', { query: 'p', country: 'US' }))
      .not.toBe(cacheKey('ebay', { query: 'p', country: 'LA' }));
  });

  it('separates providers', () => {
    expect(cacheKey('ebay', { query: 'p' })).not.toBe(cacheKey('amazon', { query: 'p' }));
  });

  it('ignores case and surrounding space', () => {
    expect(cacheKey('ebay', { query: '  Front Brake Pads ' }))
      .toBe(cacheKey('ebay', { query: 'front brake pads' }));
  });

  it('expires', () => {
    const key = cacheKey('ebay', { query: 'p' });
    writeCache(key, [result()], { ttlMs: 1000, now: 0 });
    expect(readCache(key, 500)).not.toBeNull();
    expect(readCache(key, 1500)).toBeNull();
  });

  it('does not grow without bound', () => {
    for (let i = 0; i < 250; i++) {
      writeCache(cacheKey('ebay', { query: 'q' + i }), [result()], { now: i });
    }
    expect(cacheSize()).toBeLessThanOrEqual(200);
  });
});
