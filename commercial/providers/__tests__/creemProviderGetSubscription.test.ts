/**
 * commercial/providers/creemProvider.ts getSubscription — the second Creem provider, fixed the same way as
 * lib/payments/providers/creem-provider.ts.
 *
 * What it did before, each pinned below:
 *   - a missing status became 'active'             -> a response nobody could read granted a subscription
 *   - a missing period became Date.now()           -> and the field names were wrong, so it was always now
 *   - any non-2xx returned null                    -> a 401 from a wrong key read as "no such subscription"
 *   - any thrown error returned null               -> a timeout read as "no such subscription" too
 *   - the host was the LIVE one, always            -> CREEM_TEST_MODE was ignored entirely
 *
 * `fetch` is stubbed; nothing reaches Creem. Every id and value is synthetic.
 */
import { creemProvider } from '../creemProvider';
import { RemoteSubscriptionUnusableError } from '../BillingProvider';

const SUB = 'sub_test_commercial_1';
const realFetch = global.fetch;

let answer: () => Promise<Response>;
let seenUrls: string[];

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as unknown as Response);
const code = (status: number) => ({ ok: false, status, json: async () => ({}) } as unknown as Response);

function subscription(over: Record<string, unknown> = {}) {
  return {
    id: SUB,
    status: 'active',
    customer: { id: 'cus_test_1' },
    current_period_start_date: '2026-09-01T00:00:00.000Z',
    current_period_end_date: '2026-10-01T00:00:00.000Z',
    cancel_at_period_end: false,
    ...over,
  };
}

beforeEach(() => {
  process.env.CREEM_API_KEY = 'creem_test_key_for_unit_tests';
  delete process.env.CREEM_BASE_URL;
  delete process.env.CREEM_TEST_MODE;
  seenUrls = [];
  answer = async () => ok(subscription());
  global.fetch = (async (url: unknown) => { seenUrls.push(String(url)); return answer(); }) as unknown as typeof fetch;
});

afterEach(() => { global.fetch = realFetch; });

describe('a subscription it can read', () => {
  it('returns the provider state', async () => {
    const sub = await creemProvider.getSubscription(SUB);
    expect(sub?.providerSubscriptionId).toBe(SUB);
    expect(sub?.status).toBe('active');
    expect(sub?.providerCustomerId).toBe('cus_test_1');
  });

  it('reads the period names Creem actually sends', async () => {
    const sub = await creemProvider.getSubscription(SUB);
    expect(sub?.currentPeriodStart?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(sub?.currentPeriodEnd?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('reads a customer id given bare or nested', async () => {
    answer = async () => ok(subscription({ customer: undefined, customer_id: 'cus_bare' }));
    expect((await creemProvider.getSubscription(SUB))?.providerCustomerId).toBe('cus_bare');
  });

  it('reads either spelling of the cancellation date', async () => {
    answer = async () => ok(subscription({ status: 'canceled', canceled_at: '2026-09-10T00:00:00.000Z' }));
    expect((await creemProvider.getSubscription(SUB))?.cancelledAt?.toISOString()).toBe('2026-09-10T00:00:00.000Z');
  });
});

describe('THE ACTIVE DEFAULT: a status it cannot read throws, it does not grant', () => {
  it.each([
    ['no status at all',       { status: undefined }],
    ['an empty status',        { status: '' }],
    ['an unknown status',      { status: 'incomplete' }],
    ['a nonsense status',      { status: 'whatever' }],
  ])('%s throws rather than returning active', async (_label, over) => {
    answer = async () => ok(subscription(over));
    await expect(creemProvider.getSubscription(SUB)).rejects.toBeInstanceOf(RemoteSubscriptionUnusableError);
  });

  it('passes a genuine status through unchanged, including non-active ones', async () => {
    for (const status of ['trialing', 'past_due', 'cancelled', 'canceled', 'expired']) {
      answer = async () => ok(subscription({ status }));
      expect((await creemProvider.getSubscription(SUB))?.status).toBe(status);
    }
  });

  it('normalises case rather than rejecting it', async () => {
    answer = async () => ok(subscription({ status: 'ACTIVE' }));
    expect((await creemProvider.getSubscription(SUB))?.status).toBe('active');
  });
});

describe('THE NOW DEFAULT: an unknown period is null, never the current time', () => {
  it.each([
    ['both fields absent',   { current_period_start_date: undefined, current_period_end_date: undefined }],
    ['an empty string',      { current_period_end_date: '' }],
    ['an unparseable date',  { current_period_end_date: 'not-a-date' }],
    ['a non-date type',      { current_period_end_date: { nested: true } }],
  ])('%s yields null', async (_label, over) => {
    const before = Date.now();
    answer = async () => ok(subscription(over));
    const sub = await creemProvider.getSubscription(SUB);
    expect(sub?.currentPeriodEnd).toBeNull();
    // The specific regression: not "now", and not Invalid Date.
    const t = sub?.currentPeriodEnd?.getTime();
    expect(t === undefined || t < before).toBe(true);
  });

  it('uses the legacy names only when they are genuinely present', async () => {
    answer = async () => ok(subscription({
      current_period_start_date: undefined, current_period_end_date: undefined,
      current_period_end: '2026-08-01T00:00:00.000Z',
    }));
    expect((await creemProvider.getSubscription(SUB))?.currentPeriodEnd?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('null means 404 and nothing else', () => {
  it('404 is null', async () => {
    answer = async () => code(404);
    await expect(creemProvider.getSubscription(SUB)).resolves.toBeNull();
  });

  it.each([401, 403, 429, 500, 503])('%s throws — it is not mistaken for absence', async (status) => {
    answer = async () => code(status);
    await expect(creemProvider.getSubscription(SUB)).rejects.toMatchObject({
      name: 'RemoteSubscriptionUnusableError',
      reason: `the provider answered ${status}`,
    });
  });

  it('a network failure throws rather than reading as "not found"', async () => {
    answer = async () => { throw new Error('ECONNRESET'); };
    await expect(creemProvider.getSubscription(SUB)).rejects.toMatchObject({
      reason: expect.stringContaining('ECONNRESET'),
    });
  });

  it('a timeout throws and says so', async () => {
    answer = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
    await expect(creemProvider.getSubscription(SUB)).rejects.toMatchObject({
      reason: expect.stringContaining('timed out'),
    });
  });

  it('a body that is not JSON, not an object, or carries no id throws', async () => {
    answer = async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad'); } } as unknown as Response);
    await expect(creemProvider.getSubscription(SUB)).rejects.toBeInstanceOf(RemoteSubscriptionUnusableError);

    answer = async () => ok([1, 2]);
    await expect(creemProvider.getSubscription(SUB)).rejects.toBeInstanceOf(RemoteSubscriptionUnusableError);

    answer = async () => ok(subscription({ id: '' }));
    await expect(creemProvider.getSubscription(SUB)).rejects.toBeInstanceOf(RemoteSubscriptionUnusableError);
  });

  it('an empty subscription id is refused before any request', async () => {
    await expect(creemProvider.getSubscription('  ')).rejects.toBeInstanceOf(RemoteSubscriptionUnusableError);
    expect(seenUrls).toHaveLength(0);
  });
});

describe('THE LIVE HOST: test mode is honoured', () => {
  it('uses the test host when CREEM_TEST_MODE is true', async () => {
    process.env.CREEM_TEST_MODE = 'true';
    await creemProvider.getSubscription(SUB);
    expect(seenUrls[0]).toBe(`https://test-api.creem.io/v1/subscriptions/${SUB}`);
  });

  it('tolerates a trailing newline on CREEM_TEST_MODE, which used to send sandbox traffic live', async () => {
    process.env.CREEM_TEST_MODE = 'true\n';
    await creemProvider.getSubscription(SUB);
    expect(seenUrls[0]).toContain('test-api.creem.io');
  });

  it('uses the live host only when test mode is off', async () => {
    process.env.CREEM_TEST_MODE = 'false';
    await creemProvider.getSubscription(SUB);
    expect(seenUrls[0]).toBe(`https://api.creem.io/v1/subscriptions/${SUB}`);
  });

  it('honours an explicit CREEM_BASE_URL override', async () => {
    process.env.CREEM_BASE_URL = 'https://test-api.example/v1';
    await creemProvider.getSubscription(SUB);
    expect(seenUrls[0]).toBe(`https://test-api.example/v1/subscriptions/${SUB}`);
  });

  it('escapes the subscription id in the path', async () => {
    process.env.CREEM_TEST_MODE = 'true';
    await creemProvider.getSubscription('sub/../x');
    expect(seenUrls[0]).toBe('https://test-api.creem.io/v1/subscriptions/sub%2F..%2Fx');
  });
});

describe('the one caller still fails closed', () => {
  // syncSubscriptionFromProvider catches EVERYTHING and returns false, so "returns false" alone would also pass if
  // the provider were never reached. Each case therefore also proves the request was made, and the control case
  // proves the same wiring does write when the answer is readable.
  async function loadCaller() {
    jest.resetModules();
    const updates: unknown[][] = [];
    jest.doMock('@/commercial/subscriptions/subscriptionService', () => ({
      updateSubscriptionStatus: async (...a: unknown[]) => { updates.push(a); return true; },
    }));
    process.env.BILLING_PROVIDER = 'creem';
    const { syncSubscriptionFromProvider } = await import('@/commercial/billing/billingService');
    return { syncSubscriptionFromProvider, updates };
  }

  it('an unusable answer: returns false, writes nothing, and the provider WAS asked', async () => {
    const { syncSubscriptionFromProvider, updates } = await loadCaller();
    answer = async () => ok(subscription({ status: undefined }));   // used to become 'active'

    await expect(syncSubscriptionFromProvider('shop-1', SUB)).resolves.toBe(false);
    expect(seenUrls).toHaveLength(1);
    expect(updates).toHaveLength(0);
  });

  it('a transient failure: returns false and writes nothing, rather than treating it as absence', async () => {
    const { syncSubscriptionFromProvider, updates } = await loadCaller();
    answer = async () => code(503);

    await expect(syncSubscriptionFromProvider('shop-1', SUB)).resolves.toBe(false);
    expect(seenUrls).toHaveLength(1);
    expect(updates).toHaveLength(0);
  });

  it('CONTROL: a readable answer through the same wiring does write, with the real status', async () => {
    const { syncSubscriptionFromProvider, updates } = await loadCaller();
    answer = async () => ok(subscription({ status: 'past_due' }));

    await expect(syncSubscriptionFromProvider('shop-1', SUB)).resolves.toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0][0]).toBe('shop-1');
    expect(updates[0][1]).toBe('past_due');
  });
});
