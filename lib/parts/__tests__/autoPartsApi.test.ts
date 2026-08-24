/**
 * AutoPartsAPI client, locale resolution and normalisation.
 *
 * The security-critical part is `buildProviderUrl`. Everything else can fail
 * and cost a search; that function failing costs an authenticated,
 * key-bearing request pointed at a host of someone else's choosing.
 */
import {
  buildProviderUrl, resolveBaseUrl, idSegment, credentialStatus, hasCredentials,
  listLanguages, resolveLocale, autoPartsApiRequest, __resetAutoPartsCaches,
  PHASE1_LANGUAGE_NAME,
} from '../providers/autopartsapi/client';
import { AutoPartsApiError } from '../providers/autopartsapi/types';
import {
  normalizeAutoPartsArticle, normalizeAutoPartsResponse, normalizePartNumber,
} from '../providers/autopartsapi/normalize';
import type { PartsSearchInput } from '../types';

const BASE = 'https://auto-parts-catalog.apiprofile.com/api';
const CHECKED_AT = '2026-08-24T00:00:00.000Z';
const TACOMA: PartsSearchInput = {
  query: 'front brake pads',
  year: 2019, make: 'Toyota', model: 'Tacoma', currency: 'USD',
};

const realFetch = global.fetch;
const realEnv = { ...process.env };

function mockFetch(impl: (url: string, init: RequestInit) => Partial<Response> & { jsonBody?: unknown }) {
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const r = impl(String(url), init ?? {});
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      text: async () => typeof r.jsonBody === 'string' ? r.jsonBody : JSON.stringify(r.jsonBody ?? {}),
    } as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  __resetAutoPartsCaches();
  process.env = { ...realEnv };
  delete process.env.AUTOPARTS_API_BASE_URL;
  process.env.AUTOPARTS_API_KEY = 'test-key-not-a-real-secret';
});

afterAll(() => {
  global.fetch = realFetch;
  process.env = realEnv;
});

describe('the base URL is fixed, not configurable by anyone passing through', () => {
  it('defaults to the documented provider base', () => {
    expect(resolveBaseUrl()).toBe(BASE);
  });

  it('accepts an https override inside apiprofile.com', () => {
    process.env.AUTOPARTS_API_BASE_URL = 'https://sandbox.apiprofile.com/api';
    expect(resolveBaseUrl()).toBe('https://sandbox.apiprofile.com/api');
  });

  it.each([
    'http://auto-parts-catalog.apiprofile.com/api',   // downgraded scheme
    'https://evil.example.com/api',                   // another host
    'https://apiprofile.com.evil.example.com/api',    // suffix lookalike
    'not a url',
  ])('falls back rather than honouring %s', bad => {
    process.env.AUTOPARTS_API_BASE_URL = bad;
    expect(resolveBaseUrl()).toBe(BASE);
  });
});

describe('URL construction cannot be steered off the provider', () => {
  it('builds a documented path', () => {
    expect(buildProviderUrl('languages/list')).toBe(`${BASE}/languages/list`);
    expect(buildProviderUrl('/languages/list')).toBe(`${BASE}/languages/list`);
  });

  it('builds the documented country pattern from validated ids', () => {
    const url = buildProviderUrl(`countries/get-country/lang-id/${idSegment(4)}/country-filter-id/${idSegment(63)}`);
    expect(url).toBe(`${BASE}/countries/get-country/lang-id/4/country-filter-id/63`);
  });

  it.each([
    'https://evil.example.com/steal',
    'http://evil.example.com',
    '//evil.example.com/x',
    '../../admin',
    'languages/../../../etc/passwd',
    'languages%2f%2e%2e%2fadmin',
    'languages/list?key=leak',
    'languages/list#frag',
    'languages\\list',
    'file:///etc/passwd',
    '',
  ])('refuses %p', bad => {
    // A technician's search text must never decide the upstream host.
    expect(() => buildProviderUrl(bad)).toThrow(AutoPartsApiError);
  });

  it('refuses a non-integer or absurd id', () => {
    expect(() => idSegment(1.5)).toThrow(AutoPartsApiError);
    expect(() => idSegment(-1)).toThrow(AutoPartsApiError);
    expect(() => idSegment(Number.NaN)).toThrow(AutoPartsApiError);
  });
});

describe('credentials', () => {
  it('reports presence without ever revealing a value', () => {
    expect(credentialStatus()).toBe('PRESENT');
    delete process.env.AUTOPARTS_API_KEY;
    expect(credentialStatus()).toBe('MISSING');
    expect(hasCredentials()).toBe(false);
  });

  it('refuses to call the provider with no key', async () => {
    delete process.env.AUTOPARTS_API_KEY;
    await expect(autoPartsApiRequest('languages/list'))
      .rejects.toMatchObject({ kind: 'no_credentials' });
  });

  it('sends the key in the header and NEVER in the URL', async () => {
    let seenUrl = '';
    let seenHeaders: Record<string, string> = {};
    mockFetch((url, init) => {
      seenUrl = url;
      seenHeaders = (init.headers ?? {}) as Record<string, string>;
      return { jsonBody: { ok: true } };
    });

    await autoPartsApiRequest('languages/list');

    expect(seenHeaders['x-apiprofile-key']).toBe('test-key-not-a-real-secret');
    expect(seenHeaders['Content-Type']).toBe('application/json');
    // A URL ends up in referrers, proxy logs and error messages.
    expect(seenUrl).not.toContain('test-key-not-a-real-secret');
    expect(seenUrl).toBe(`${BASE}/languages/list`);
  });
});

describe('provider errors are classified, not passed through', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'provider_error'],
    [503, 'provider_error'],
    [418, 'bad_request'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    mockFetch(() => ({ ok: false, status }));
    await expect(autoPartsApiRequest('languages/list')).rejects.toMatchObject({ kind });
  });

  it('flags a 200 with a non-JSON body as malformed', async () => {
    mockFetch(() => ({ jsonBody: '<html>gateway</html>' }));
    await expect(autoPartsApiRequest('languages/list'))
      .rejects.toMatchObject({ kind: 'malformed' });
  });

  it('never puts the key into an error message', async () => {
    mockFetch(() => ({ ok: false, status: 401 }));
    try {
      await autoPartsApiRequest('languages/list');
      throw new Error('should have thrown');
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('test-key-not-a-real-secret');
    }
  });
});

describe('free-tier quota protection', () => {
  it('caches reference data instead of re-asking', async () => {
    let calls = 0;
    mockFetch(() => { calls += 1; return { jsonBody: [{ id: 4, name: 'English' }] }; });

    await listLanguages();
    await listLanguages();
    await listLanguages();

    // Every call spends quota. Languages change roughly never.
    expect(calls).toBe(1);
  });

  it('re-fetches once the cache expires', async () => {
    let calls = 0;
    mockFetch(() => { calls += 1; return { jsonBody: [{ id: 4, name: 'English' }] }; });

    await listLanguages(0);
    await listLanguages(25 * 60 * 60_000);
    expect(calls).toBe(2);
  });

  it('collapses identical concurrent requests into one call', async () => {
    let calls = 0;
    mockFetch(() => { calls += 1; return { jsonBody: { ok: true } }; });

    await Promise.all([
      autoPartsApiRequest('languages/list'),
      autoPartsApiRequest('languages/list'),
      autoPartsApiRequest('languages/list'),
    ]);

    // A double-click, or two components mounting, must cost one call.
    expect(calls).toBe(1);
  });
});

describe('locale is resolved, never assumed from an example id', () => {
  it('finds English by name rather than trusting lang-id/4', async () => {
    // The dashboard example showed lang-id/4. Here English is 11, and the
    // resolver must follow the data, not the example.
    mockFetch(() => ({ jsonBody: [
      { id: 4, name: 'Deutsch' },
      { id: 11, name: 'English' },
    ] }));
    await expect(resolveLocale()).resolves.toEqual({ languageId: 11 });
  });

  it('tolerates the envelope shapes the provider might use', async () => {
    mockFetch(() => ({ jsonBody: { data: [{ languageId: 7, language: 'English' }] } }));
    await expect(resolveLocale()).resolves.toEqual({ languageId: 7 });
  });

  it('accepts an ISO code when there is no name', async () => {
    mockFetch(() => ({ jsonBody: { items: [{ id: 2, code: 'en' }] } }));
    await expect(resolveLocale()).resolves.toEqual({ languageId: 2 });
  });

  it('REFUSES rather than defaulting when English is absent', async () => {
    // Falling back to the first row would give a catalogue in an unknown
    // language that looks like it worked.
    mockFetch(() => ({ jsonBody: [{ id: 4, name: 'Deutsch' }] }));
    await expect(resolveLocale()).rejects.toMatchObject({ kind: 'malformed' });
  });

  it('does not set a country filter in Phase 1', async () => {
    mockFetch(() => ({ jsonBody: [{ id: 11, name: 'English' }] }));
    const locale = await resolveLocale();
    // country-filter-id/63 appeared in an example with no statement of what 63
    // is, and a country filter silently narrows which parts exist.
    expect(locale.countryFilterId).toBeUndefined();
  });

  it('names the Phase 1 language explicitly', () => {
    expect(PHASE1_LANGUAGE_NAME).toBe('english');
  });
});

describe('catalogue articles normalise to identity, not to a price', () => {
  const article = {
    id: 9001,
    name: 'Brake Pad Set, disc brake',
    brand: 'Akebono',
    articleNumber: 'ACT976',
    oemNumbers: ['04465-04090', '0446504090'],
    imageUrl: 'https://cdn.apiprofile.com/img/9001.jpg',
  };

  it('carries brand, part number and OEM references', () => {
    const r = normalizeAutoPartsArticle(article, TACOMA, { checkedAt: CHECKED_AT })!;
    expect(r.provider).toBe('catalog');
    expect(r.brand).toBe('Akebono');
    expect(r.manufacturerPartNumber).toBe('ACT976');
    expect(r.oemNumbers).toContain('04465-04090');
  });

  it('claims NO price, and does not report free', () => {
    const r = normalizeAutoPartsArticle(article, TACOMA, { checkedAt: CHECKED_AT })!;
    expect(r.itemPrice).toBeUndefined();
    expect(r.landedCost).toBeUndefined();
    // `unknown`, not a zero that would rank it as the cheapest option.
    expect(r.landedCostCompleteness).toBe('unknown');
  });

  it('can never produce a verified fitment', () => {
    // A cross-reference says "this article is that OEM number". It does not
    // say "this fits the vehicle in bay three".
    const withMpn = normalizeAutoPartsArticle(
      article, { ...TACOMA, manufacturerPartNumber: 'ACT976' }, { checkedAt: CHECKED_AT })!;
    expect(withMpn.fitmentStatus).toBe('likely');

    const plain = normalizeAutoPartsArticle(article, TACOMA, { checkedAt: CHECKED_AT })!;
    expect(plain.fitmentStatus).toBe('unverified');
  });

  it('treats an OEM cross-reference as likely', () => {
    const r = normalizeAutoPartsArticle(
      article, { ...TACOMA, oemNumber: '04465 04090' }, { checkedAt: CHECKED_AT })!;
    expect(r.fitmentStatus).toBe('likely');
    expect(r.fitmentReason).toContain('OEM');
  });

  it('ignores separators and case when matching part numbers', () => {
    expect(normalizePartNumber('04465-04090')).toBe('0446504090');
    expect(normalizePartNumber('act 976')).toBe('ACT976');
  });

  it('drops a row with no usable title', () => {
    expect(normalizeAutoPartsArticle({ id: 1 }, TACOMA, { checkedAt: CHECKED_AT })).toBeNull();
  });

  it('rejects a non-https image', () => {
    const r = normalizeAutoPartsArticle(
      { ...article, imageUrl: 'javascript:alert(1)' }, TACOMA, { checkedAt: CHECKED_AT })!;
    expect(r.imageUrl).toBeUndefined();
  });

  it('handles every envelope shape and rubbish input', () => {
    const opts = { checkedAt: CHECKED_AT };
    expect(normalizeAutoPartsResponse([article], TACOMA, opts)).toHaveLength(1);
    expect(normalizeAutoPartsResponse({ data: [article] }, TACOMA, opts)).toHaveLength(1);
    expect(normalizeAutoPartsResponse({ articles: [article] }, TACOMA, opts)).toHaveLength(1);
    expect(normalizeAutoPartsResponse(null, TACOMA, opts)).toEqual([]);
    expect(normalizeAutoPartsResponse('nonsense', TACOMA, opts)).toEqual([]);
  });
});
