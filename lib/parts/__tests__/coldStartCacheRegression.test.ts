/**
 * The cold-start guarantee, as a permanent regression.
 *
 *   cold process
 *   → memory cache empty
 *   → persistent reference hit
 *   → 0 external AutoPartsAPI calls
 *
 * This is the production cache policy's condition 7, and condition 8's
 * `externalCalls` semantics with it. It was previously demonstrated by a
 * script run by hand against the live database. A demonstration nobody runs
 * is not a guarantee, so it is asserted here on every test run.
 *
 * Both the database and the provider are replaced with fakes, which is the
 * point: if anything reaches the network the provider fake fails the test
 * loudly rather than quietly spending a call.
 */
import { EndpointCategory } from '../providers/autopartsapi/telemetry';

/** Every provider request that escaped. Must stay empty. */
const networkCalls: string[] = [];

/** Rows the fake database holds, keyed by path. */
const durableRows = new Map<string, { payload: unknown; expires_at: string }>();

jest.mock('@/lib/supabaseServer', () => ({
  getAdminDb: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            const row = durableRows.get(currentKey);
            return { data: row ?? null, error: null };
          },
        }),
      }),
      delete: () => ({ eq: async () => ({ error: null }) }),
      upsert: async () => ({ error: null }),
    }),
  }),
}));

jest.mock('../providers/autopartsapi/client', () => ({
  autoPartsApiRequest: async (path: string) => {
    networkCalls.push(path);
    throw new Error(`provider was called for ${path} — the cache should have answered`);
  },
}));

jest.mock('../providers/autopartsapi/telemetry', () => ({
  recordUsage: async () => {},
}));

/** The path the fake database is currently being asked about. */
let currentKey = '';

const MANUFACTURERS = 'manufacturers/list/type-id/1';
const MODELS = 'models/list/type-id/1/manufacturer-id/74/lang-id/4/country-filter-id/63';

async function freshCache() {
  jest.resetModules();
  const mod = await import('../vehicleResolution/referenceCache');
  mod.clearReferenceCache();
  return mod;
}

beforeEach(() => {
  networkCalls.length = 0;
  durableRows.clear();
  const hour = new Date(Date.now() + 3600_000).toISOString();
  durableRows.set(MANUFACTURERS, { payload: [{ manuId: 74, manuName: 'MERCEDES-BENZ' }], expires_at: hour });
  durableRows.set(MODELS, { payload: [{ modelId: 221, modelName: 'S-CLASS (W221, V221)' }], expires_at: hour });
});

describe('a cold process resolves reference data without calling the provider', () => {
  it('answers a manufacturer lookup from the durable tier', async () => {
    const { cachedFetch, referenceCacheSize } = await freshCache();
    expect(referenceCacheSize()).toBe(0);

    currentKey = MANUFACTURERS;
    const outcomes: string[] = [];
    await cachedFetch(MANUFACTURERS, 'manufacturers' as EndpointCategory, 3600_000, {
      onOutcome: o => outcomes.push(o),
    });

    expect(outcomes).toEqual(['persistent_hit']);
    expect(networkCalls).toEqual([]);
  });

  it('answers a model lookup from the durable tier', async () => {
    const { cachedFetch } = await freshCache();
    currentKey = MODELS;
    const outcomes: string[] = [];
    await cachedFetch(MODELS, 'models' as EndpointCategory, 3600_000, {
      onOutcome: o => outcomes.push(o),
    });

    expect(outcomes).toEqual(['persistent_hit']);
    expect(networkCalls).toEqual([]);
  });

  it('counts a persistent hit as ZERO external calls', async () => {
    // Condition 8: externalCalls means actual upstream requests only. This is
    // the exact arithmetic the resolver performs.
    const { cachedFetch } = await freshCache();
    let externalCalls = 0;
    const count = (o: string) => { if (o === 'external') externalCalls += 1; };

    currentKey = MANUFACTURERS;
    await cachedFetch(MANUFACTURERS, 'manufacturers' as EndpointCategory, 3600_000, { onOutcome: count });
    currentKey = MODELS;
    await cachedFetch(MODELS, 'models' as EndpointCategory, 3600_000, { onOutcome: count });

    expect(externalCalls).toBe(0);
    expect(networkCalls).toEqual([]);
  });

  it('counts a memory hit as ZERO external calls too', async () => {
    const { cachedFetch } = await freshCache();
    let externalCalls = 0;
    const count = (o: string) => { if (o === 'external') externalCalls += 1; };

    currentKey = MANUFACTURERS;
    // First read promotes into memory; the second must come from there.
    await cachedFetch(MANUFACTURERS, 'manufacturers' as EndpointCategory, 3600_000, { onOutcome: count });
    const second: string[] = [];
    await cachedFetch(MANUFACTURERS, 'manufacturers' as EndpointCategory, 3600_000, {
      onOutcome: o => { second.push(o); count(o); },
    });

    expect(second).toEqual(['cache_hit']);
    expect(externalCalls).toBe(0);
  });
});

describe('the guarantee holds only while the row is current', () => {
  it('does NOT serve an expired row, and reaches for the provider instead', async () => {
    /**
     * The other half of "cache, not mirror". If this ever passed by serving
     * stale data the cold-start number would still look perfect while the
     * catalogue silently rotted.
     */
    const { cachedFetch } = await freshCache();
    durableRows.set(MANUFACTURERS, {
      payload: [{ manuId: 74, manuName: 'STALE' }],
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });

    currentKey = MANUFACTURERS;
    await expect(
      cachedFetch(MANUFACTURERS, 'manufacturers' as EndpointCategory, 3600_000, {}),
    ).rejects.toThrow('provider was called');

    // Proof it went upstream rather than serving the expired payload.
    expect(networkCalls).toEqual([MANUFACTURERS]);
  });
});
