/**
 * CreemPaymentProvider.getSubscription(), which is NOT dead code: app/api/webhooks/creem/route.ts calls it on
 * subscription.created / updated / renewed / canceled / expired / past_due and feeds the result to
 * syncSubscriptionFromProvider, which writes profiles.plan — the value planGate reads for entitlement.
 *
 * It used to default the plan to 'starter' and, because it read field names Creem does not send, store every
 * period as 1970-01-01. These pin that neither can happen again: an unreadable subscription throws
 * CreemSubscriptionUnusableError, and an unknown date stays null.
 *
 * `fetch` is stubbed. Nothing here reaches Creem, and every id and product is synthetic.
 */
import { CreemPaymentProvider, CreemSubscriptionUnusableError } from '../payments/providers/creem-provider';

const SUB = 'sub_test_getsub_1';
const realFetch = global.fetch;

let answer: () => Promise<Response>;
let calls: number;

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as unknown as Response);
const code = (status: number) => ({ ok: false, status, json: async () => ({}) } as unknown as Response);

/** A Creem subscription in the shape the provider actually returns. */
function subscription(over: Record<string, unknown> = {}) {
  return {
    id: SUB,
    status: 'active',
    customer: { id: 'cus_test_1' },
    product: 'prod_test_solo',
    metadata: { plan_key: 'solo', plan_id: 'solo', user_id: 'user-1' },
    current_period_start_date: '2026-09-01T00:00:00.000Z',
    current_period_end_date: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

const provider = () => new CreemPaymentProvider();

beforeEach(() => {
  process.env.CREEM_API_KEY = 'creem_test_key_for_unit_tests';
  for (const k of Object.keys(process.env)) if (/^CREEM_.*_PRODUCT_ID$/.test(k)) delete process.env[k];
  calls = 0;
  answer = async () => ok(subscription());
  global.fetch = (async () => { calls++; return answer(); }) as unknown as typeof fetch;
});

afterEach(() => { global.fetch = realFetch; });

describe('a subscription it can read', () => {
  it('returns the plan the metadata names, when no product ids are configured to check against', async () => {
    const sub = await provider().getSubscription(SUB);
    expect(sub?.planId).toBe('solo');
    expect(sub?.status).toBe('active');
    expect(sub?.id).toBe(SUB);
  });

  it('prefers the product Creem is actually billing over the metadata', async () => {
    process.env.CREEM_BUSINESS_MONTHLY_PRODUCT_ID = 'prod_test_biz';
    // Metadata says solo; the product being charged is business. The product wins only when they agree —
    // here they disagree, so it must refuse rather than pick one.
    answer = async () => ok(subscription({ product: 'prod_test_biz' }));
    await expect(provider().getSubscription(SUB)).rejects.toBeInstanceOf(CreemSubscriptionUnusableError);
  });

  it('accepts metadata that agrees with the configured product', async () => {
    process.env.CREEM_SOLO_MONTHLY_PRODUCT_ID = 'prod_test_solo';
    const sub = await provider().getSubscription(SUB);
    expect(sub?.planId).toBe('solo');
  });

  it('reads the period field names Creem actually sends', async () => {
    const sub = await provider().getSubscription(SUB);
    expect(sub?.currentPeriodStart?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(sub?.currentPeriodEnd?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('still reads the legacy period names when they are genuinely present', async () => {
    answer = async () => ok(subscription({
      current_period_start_date: undefined,
      current_period_end_date: undefined,
      current_period_start: '2026-08-01T00:00:00.000Z',
      current_period_end: '2026-09-01T00:00:00.000Z',
    }));
    const sub = await provider().getSubscription(SUB);
    expect(sub?.currentPeriodEnd?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('THE 1970 PERIOD: an unknown date is null, never an epoch', () => {
  it.each([
    ['both period fields absent', { current_period_start_date: undefined, current_period_end_date: undefined }],
    ['an empty string',           { current_period_end_date: '' }],
    ['an unparseable string',     { current_period_end_date: 'not-a-date' }],
    ['a non-date type',           { current_period_end_date: { nested: true } }],
  ])('%s yields null', async (_label, over) => {
    answer = async () => ok(subscription(over));
    const sub = await provider().getSubscription(SUB);
    expect(sub).not.toBeNull();
    expect(sub?.currentPeriodEnd).toBeNull();
    // The specific regression: not 1970-01-01.
    expect(sub?.currentPeriodEnd?.getTime() ?? null).not.toBe(0);
  });

  it('trial and cancellation dates are unknown rather than epoch too', async () => {
    const sub = await provider().getSubscription(SUB);
    expect(sub?.trialStart).toBeNull();
    expect(sub?.trialEnd).toBeNull();
    expect(sub?.canceledAt).toBeNull();
  });

  it('accepts a unix-seconds timestamp', async () => {
    answer = async () => ok(subscription({ current_period_end_date: 1790000000 }));
    const sub = await provider().getSubscription(SUB);
    expect(sub?.currentPeriodEnd?.toISOString()).toBe(new Date(1790000000 * 1000).toISOString());
  });
});

describe('THE STARTER DEFAULT: an unreadable plan throws, it does not guess', () => {
  it.each([
    ['no metadata at all',        { metadata: {} }],
    ['metadata with no plan',     { metadata: { user_id: 'user-1' } }],
    ['a plan we do not sell',     { metadata: { plan_key: 'unicorn' } }],
    ['enterprise, sold by hand',  { metadata: { plan_key: 'enterprise' } }],
  ])('%s throws rather than returning starter', async (_label, over) => {
    answer = async () => ok(subscription(over));
    await expect(provider().getSubscription(SUB)).rejects.toBeInstanceOf(CreemSubscriptionUnusableError);
  });

  it('never returns a subscription whose plan is starter unless starter was actually named', async () => {
    answer = async () => ok(subscription({ metadata: { plan_key: 'starter' } }));
    const sub = await provider().getSubscription(SUB);
    expect(sub?.planId).toBe('starter');   // named explicitly — legitimate
  });

  it('refuses a product that is not a plan Redlined1 sells, when products are configured', async () => {
    process.env.CREEM_SOLO_MONTHLY_PRODUCT_ID = 'prod_test_solo';
    answer = async () => ok(subscription({ product: 'prod_someone_elses', metadata: { plan_key: 'solo' } }));
    await expect(provider().getSubscription(SUB)).rejects.toBeInstanceOf(CreemSubscriptionUnusableError);
  });

  it('refuses a response carrying no subscription id', async () => {
    answer = async () => ok(subscription({ id: '' }));
    await expect(provider().getSubscription(SUB)).rejects.toBeInstanceOf(CreemSubscriptionUnusableError);
  });

  it('carries a reason a human can act on', async () => {
    answer = async () => ok(subscription({ metadata: {} }));
    await expect(provider().getSubscription(SUB)).rejects.toMatchObject({
      name: 'CreemSubscriptionUnusableError',
      reason: expect.stringContaining('names no plan'),
    });
  });
});

describe('null still means exactly one thing', () => {
  it('404 is null — Creem has no such subscription', async () => {
    answer = async () => code(404);
    await expect(provider().getSubscription(SUB)).resolves.toBeNull();
    expect(calls).toBe(1);
  });

  it('a non-404 HTTP failure throws, and is NOT mistaken for absence', async () => {
    answer = async () => code(500);
    await expect(provider().getSubscription(SUB)).rejects.toThrow(/getSubscription failed \(500\)/);
  });

  it('an unusable answer is an error, not null, so a caller cannot skip it as "not found"', async () => {
    answer = async () => ok(subscription({ metadata: {} }));
    const result = await provider().getSubscription(SUB).catch(e => e);
    expect(result).toBeInstanceOf(CreemSubscriptionUnusableError);
    expect(result).not.toBeNull();
  });
});
