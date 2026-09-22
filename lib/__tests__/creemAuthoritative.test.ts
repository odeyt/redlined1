/**
 * Option B's provider read, tested without a network: the fetch is injected, so timeouts, retries and the
 * transient/permanent split are deterministic rather than timing-dependent.
 *
 * The parsing tests exist because the obvious implementation — reusing CreemPaymentProvider.getSubscription() —
 * would silently default the plan to 'starter' and read period field names Creem does not send. These pin that
 * this module does neither.
 */
import {
  fetchAuthoritativeSubscription,
  parseAuthoritativeSubscription,
  authoritativeStateEnabled,
} from '../billing/creemAuthoritative';

const SUB = 'sub_test_1';

/** A Creem subscription object, in the shape the provider actually returns. */
function subscription(over: Record<string, unknown> = {}) {
  return {
    id: SUB,
    status: 'active',
    customer: { id: 'cus_test_1' },
    product: 'prod_test_solo',
    metadata: { plan_key: 'solo', plan_id: 'solo' },
    current_period_start_date: '2026-09-01T00:00:00.000Z',
    current_period_end_date: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as unknown as Response);
const http = (status: number) => ({ ok: false, status, json: async () => ({}) } as unknown as Response);

const noSleep = async () => {};
const base = { baseUrl: 'https://test-api.example/v1', apiKey: 'creem_test_key', sleep: noSleep };

beforeEach(() => {
  for (const k of Object.keys(process.env)) if (/^CREEM_.*_PRODUCT_ID$/.test(k)) delete process.env[k];
  delete process.env.BILLING_AUTHORITATIVE_STATE;
});

describe('the flag', () => {
  it('is off unless explicitly set to true', () => {
    expect(authoritativeStateEnabled()).toBe(false);
    process.env.BILLING_AUTHORITATIVE_STATE = 'false';
    expect(authoritativeStateEnabled()).toBe(false);
    process.env.BILLING_AUTHORITATIVE_STATE = 'true';
    expect(authoritativeStateEnabled()).toBe(true);
  });
});

describe('reading the subscription', () => {
  it('returns the provider state on a clean answer', async () => {
    const r = await fetchAuthoritativeSubscription(SUB, { ...base, fetchImpl: async () => ok(subscription()) });
    expect(r.kind).toBe('state');
    if (r.kind !== 'state') return;
    expect(r.state.status).toBe('active');
    expect(r.state.planKey).toBe('solo');
    expect(r.state.subscriptionId).toBe(SUB);
    expect(r.state.providerCustomerId).toBe('cus_test_1');
    expect(r.state.period.end?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('sends the api key and asks for the right subscription', async () => {
    const seen: Array<{ url: string; key: unknown }> = [];
    await fetchAuthoritativeSubscription('sub with space', {
      ...base,
      fetchImpl: async (url: unknown, init: unknown) => {
        const headers = (init as { headers: Record<string, string> }).headers;
        seen.push({ url: String(url), key: headers['x-api-key'] });
        return ok(subscription());
      },
    });
    expect(seen[0].key).toBe('creem_test_key');
    expect(seen[0].url).toBe('https://test-api.example/v1/subscriptions/sub%20with%20space');
  });
});

describe('transient failures — retried, then reported as unavailable', () => {
  it.each([500, 502, 503, 429])('retries a %s and succeeds when the provider recovers', async (code) => {
    let calls = 0;
    const r = await fetchAuthoritativeSubscription(SUB, {
      ...base,
      fetchImpl: async () => { calls++; return calls === 1 ? http(code) : ok(subscription()); },
    });
    expect(calls).toBe(2);
    expect(r.kind).toBe('state');
  });

  it('gives up after the attempt budget and reports unavailable, never a guess', async () => {
    let calls = 0;
    const r = await fetchAuthoritativeSubscription(SUB, {
      ...base, attempts: 3,
      fetchImpl: async () => { calls++; return http(503); },
    });
    expect(calls).toBe(3);
    expect(r.kind).toBe('unavailable');
  });

  it('treats a network failure as transient', async () => {
    let calls = 0;
    const r = await fetchAuthoritativeSubscription(SUB, {
      ...base, attempts: 2,
      fetchImpl: async () => { calls++; throw new Error('ECONNRESET'); },
    });
    expect(calls).toBe(2);
    expect(r.kind).toBe('unavailable');
    if (r.kind === 'unavailable') expect(r.detail).toContain('ECONNRESET');
  });

  it('times out an attempt rather than hanging the webhook, and reports it', async () => {
    // The provider never answers; only the deadline ends the attempt.
    const r = await fetchAuthoritativeSubscription(SUB, {
      ...base, attempts: 2, timeoutMs: 20,
      fetchImpl: (_url: unknown, init: unknown) => new Promise<Response>((_res, rej) => {
        const signal = (init as { signal: AbortSignal }).signal;
        signal.addEventListener('abort', () => {
          const e = new Error('aborted'); e.name = 'AbortError'; rej(e);
        });
      }),
    });
    expect(r.kind).toBe('unavailable');
    if (r.kind === 'unavailable') expect(r.detail).toContain('timed out');
  });

  it('backs off between attempts', async () => {
    const waits: number[] = [];
    await fetchAuthoritativeSubscription(SUB, {
      ...base, attempts: 3, backoffMs: 100,
      sleep: async (ms: number) => { waits.push(ms); },
      fetchImpl: async () => http(500),
    });
    expect(waits).toEqual([100, 200]);
  });
});

describe('permanent failures — never retried, held instead', () => {
  it.each([400, 401, 403, 422])('does not retry a %s', async (code) => {
    let calls = 0;
    const r = await fetchAuthoritativeSubscription(SUB, {
      ...base, fetchImpl: async () => { calls++; return http(code); },
    });
    expect(calls).toBe(1);
    expect(r.kind).toBe('unusable');
  });

  it('treats a 404 as unusable, not unavailable: a retry cannot conjure the subscription', async () => {
    let calls = 0;
    const r = await fetchAuthoritativeSubscription(SUB, {
      ...base, fetchImpl: async () => { calls++; return http(404); },
    });
    expect(calls).toBe(1);
    expect(r.kind).toBe('unusable');
  });

  it('a missing api key is a configuration fault, not a transient one — no request is made', async () => {
    let calls = 0;
    const r = await fetchAuthoritativeSubscription(SUB, {
      ...base, apiKey: '', fetchImpl: async () => { calls++; return ok(subscription()); },
    });
    expect(calls).toBe(0);
    expect(r.kind).toBe('unusable');
  });

  it('a non-JSON body is unusable', async () => {
    const r = await fetchAuthoritativeSubscription(SUB, {
      ...base,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json'); } } as unknown as Response),
    });
    expect(r.kind).toBe('unusable');
  });
});

describe('parsing — nothing is defaulted', () => {
  it('NEVER defaults the plan when metadata is absent (the legacy mapper returns "starter")', () => {
    const r = parseAuthoritativeSubscription(subscription({ metadata: {} }));
    expect(r.kind).toBe('unusable');
    if (r.kind === 'unusable') expect(r.detail).toContain('plan_missing');
  });

  it('reads the period field names Creem actually sends, not the ones the legacy mapper reads', () => {
    const legacyNames = parseAuthoritativeSubscription(subscription({
      current_period_start_date: undefined,
      current_period_end_date: undefined,
      current_period_start: '2026-09-01T00:00:00.000Z',
      current_period_end: '2026-10-01T00:00:00.000Z',
    }));
    expect(legacyNames.kind).toBe('state');
    if (legacyNames.kind !== 'state') return;
    // Unknown stays unknown — never new Date(0), which is what the legacy mapper would have produced.
    expect(legacyNames.state.period.end).toBeNull();
  });

  it('holds a status it does not recognise rather than mapping it to active', () => {
    // 'paused' left this list: it now maps to suspended under the approved rule (see the table below).
    for (const status of ['incomplete', '', 'whatever']) {
      expect(parseAuthoritativeSubscription(subscription({ status })).kind).toBe('unusable');
    }
  });

  it.each([
    ['active', 'active'], ['trialing', 'active'], ['paid', 'active'],
    ['canceled', 'cancelled'], ['cancelled', 'cancelled'], ['expired', 'cancelled'],
    ['past_due', 'past_due'], ['unpaid', 'past_due'],
    ['paused', 'suspended'], ['suspended', 'suspended'],
  ])('narrows provider status %s to %s', (raw, expected) => {
    const r = parseAuthoritativeSubscription(subscription({ status: raw }));
    expect(r.kind).toBe('state');
    if (r.kind === 'state') expect(r.state.status).toBe(expected);
  });

  it('holds when the product Creem bills disagrees with the metadata plan', () => {
    process.env.CREEM_SOLO_MONTHLY_PRODUCT_ID = 'prod_test_solo';
    process.env.CREEM_BUSINESS_MONTHLY_PRODUCT_ID = 'prod_test_biz';
    const r = parseAuthoritativeSubscription(subscription({ product: 'prod_test_biz' }));
    expect(r.kind).toBe('unusable');
    if (r.kind === 'unusable') expect(r.detail).toContain('plan_conflict');
  });

  it('holds a response that is not an object, or carries no id', () => {
    expect(parseAuthoritativeSubscription(null).kind).toBe('unusable');
    expect(parseAuthoritativeSubscription([1, 2]).kind).toBe('unusable');
    expect(parseAuthoritativeSubscription(subscription({ id: '' })).kind).toBe('unusable');
  });
});
