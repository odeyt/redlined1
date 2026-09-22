/**
 * POST /api/webhooks/creem — the LIVE route — driven as a route: real handler, real HMAC signature, real
 * extractSubscriptionFromCheckout / recordPaymentEvent / syncSubscriptionFromProvider. Only Supabase is replaced.
 *
 * Removed on this path, each pinned below:
 *   extractSubscriptionFromCheckout   period: now and now + 30 days, always
 *                                     plan:   any non-empty metadata plan_id, sellable or not (and a 'starter'
 *                                             fallback), written to profiles.plan — what planGate reads
 *                                     ids:    a missing subscription id became '', so such checkouts collided on
 *                                             one row; a nested customer became "[object Object]"
 *   recordPaymentEvent                any existing row was a "duplicate", so a FAILED event could never be retried
 *   syncSubscriptionFromProvider      an unknown period was written as null, erasing a stored one
 *
 * Every id, product and date is synthetic.
 */
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { createInMemoryDb, type InMemoryDb } from '../billing/__tests__/inMemoryBillingDb';

let mockDb: InMemoryDb;
jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => mockDb.db }));

import { POST } from '../../app/api/webhooks/creem/route';
import { extractSubscriptionFromCheckout, BillingFactsError } from '../billing/billing-service';

const SECRET = 'whsec_live_route_test_only';
const USER = 'user-1';
const DATES = { current_period_start_date: '2026-09-01T00:00:00.000Z', current_period_end_date: '2026-10-01T00:00:00.000Z' };
const STORED = { current_period_start: '2026-08-01T00:00:00.000Z', current_period_end: '2026-09-01T00:00:00.000Z' };

function clearProducts() {
  for (const k of Object.keys(process.env)) if (/^CREEM_.*_PRODUCT_ID$/.test(k)) delete process.env[k];
}

beforeEach(() => {
  process.env.CREEM_WEBHOOK_SECRET = SECRET;
  process.env.PAYMENT_PROVIDER = 'creem';
  clearProducts();
  process.env.CREEM_SOLO_MONTHLY_PRODUCT_ID = 'prod_solo';
  process.env.CREEM_BUSINESS_MONTHLY_PRODUCT_ID = 'prod_biz';
  // payment_events carries this unique index in production (supabase/migration_billing.sql).
  mockDb = createInMemoryDb({ unique: { payment_events: ['provider', 'provider_event_id'] } });
  mockDb.seed('payment_events', []);
  mockDb.seed('subscriptions', []);
  mockDb.seed('profiles', [{ id: USER, plan: 'free', billing_status: 'inactive' }]);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

type Opt<T> = T | null;
function checkout(o: {
  id?: string; product?: Opt<string>; plan_id?: Opt<string>; user?: Opt<string>; period?: Opt<Record<string, string>>;
  subscription?: Opt<unknown>;
} = {}) {
  const meta: Record<string, string> = {};
  if (o.user !== null) meta.user_id = o.user ?? USER;
  if (o.plan_id !== null) meta.plan_id = o.plan_id ?? 'business';
  const data: Record<string, unknown> = {
    customer: { id: 'cus_1' },
    // the flat ids the previous implementation read, so an old-code run reaches its write
    customer_id: 'cus_1',
    metadata: meta,
    ...(o.period === null ? {} : (o.period ?? DATES)),
  };
  if (o.product !== null) data.product = o.product ?? 'prod_biz';
  if (o.subscription !== null) {
    data.subscription = o.subscription ?? { id: 'sub_1' };
    data.subscription_id = 'sub_1';
  }
  return { type: 'checkout.completed', id: o.id ?? 'evt_1', data };
}

async function deliver(payload: unknown) {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', SECRET).update(body).digest('hex');
  const res = await POST(new NextRequest('http://localhost/api/webhooks/creem', {
    method: 'POST', body, headers: { 'creem-signature': signature },
  }));
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

const events = () => mockDb.rows('payment_events');
const subs = () => mockDb.rows('subscriptions');
const plan = () => mockDb.rows('profiles').find(p => p.id === USER)?.plan;
const writes = () => mockDb.writesTo('subscriptions', 'upsert');

/** Recorded, NOT processed, nothing granted. payment_events has no error column, so the reason is logged. */
function expectHeld() {
  expect(events()).toHaveLength(1);
  expect(events()[0].processed).toBe(false);
  expect(writes()).toHaveLength(0);
}

describe('a checkout whose plan cannot be proven is not granted, and stays retryable', () => {
  it('no product and no plan: held, and the buyer stays on free', async () => {
    const r = await deliver(checkout({ product: null, plan_id: null }));
    expect(r.status).toBe(200);
    expectHeld();
    expect(plan()).toBe('free');
  });

  it('an UNKNOWN product: held, even with a sellable plan named', async () => {
    await deliver(checkout({ product: 'prod_unknown', plan_id: 'business' }));
    expectHeld();
    expect(plan()).toBe('free');
  });

  it('a plan that is not sold (enterprise) is refused, not written to profiles.plan', async () => {
    await deliver(checkout({ product: 'prod_biz', plan_id: 'enterprise' }));
    expectHeld();
    expect(plan()).toBe('free');
  });

  it('a missing subscription id is refused rather than colliding onto one "" row', async () => {
    await deliver(checkout({ id: 'evt_a', subscription: null }));
    await deliver(checkout({ id: 'evt_b', subscription: null }));
    expect(subs().some(s => s.provider_subscription_id === '')).toBe(false);
    expect(events().every(e => e.processed === false)).toBe(true);
  });

  it('CONTROL: a checkout that is not ours at all is acknowledged, and nothing is granted', async () => {
    await deliver(checkout({ user: null, plan_id: null, product: null }));
    expect(events()[0].processed).toBe(true);
    expect(writes()).toHaveLength(0);
    expect(plan()).toBe('free');
  });
});

describe('what IS applied comes from the provider', () => {
  it('a valid mapped product and the provider dates apply', async () => {
    await deliver(checkout());
    expect(events()[0].processed).toBe(true);
    expect(plan()).toBe('business');
    expect(subs()[0]).toMatchObject({
      plan_id: 'business', provider_subscription_id: 'sub_1', provider_customer_id: 'cus_1',
      current_period_start: DATES.current_period_start_date, current_period_end: DATES.current_period_end_date,
    });
  });

  it('no period: applied with the period UNKNOWN — not now, not now + 30 days', async () => {
    await deliver(checkout({ period: null }));
    expect(plan()).toBe('business');
    expect(subs()[0].current_period_start).toBeUndefined();
    expect(subs()[0].current_period_end).toBeUndefined();
  });

  it('a checkout omitting its period does not ERASE the period already stored', async () => {
    mockDb.seed('subscriptions', [{ id: 's1', provider_subscription_id: 'sub_1', plan_id: 'business', ...STORED }]);
    await deliver(checkout({ period: null }));
    expect(subs()).toHaveLength(1);
    expect(subs()[0]).toMatchObject(STORED);
  });
});

describe('retry', () => {
  it('fails, then applies EXACTLY ONCE once the missing fact is configured', async () => {
    const e = checkout({ id: 'evt_retry', product: 'prod_new', plan_id: 'business' });

    await deliver(e);
    expectHeld();
    expect(plan()).toBe('free');

    // The missing fact becomes available.
    process.env.CREEM_BUSINESS_ANNUAL_PRODUCT_ID = 'prod_new';

    await deliver(e);
    expect(events()).toHaveLength(1);                 // the same row, reused
    expect(events()[0].processed).toBe(true);
    expect(plan()).toBe('business');
    expect(writes()).toHaveLength(1);

    const third = await deliver(e);
    expect(third.body.duplicate).toBe(true);
    expect(writes()).toHaveLength(1);                 // not applied again
  });
});

describe('extractSubscriptionFromCheckout', () => {
  const asEvent = (data: Record<string, unknown>) =>
    ({ id: 'x', provider: 'creem', type: 'checkout.completed', providerEventId: 'e', data, rawBody: '' }) as never;

  it('reads a nested customer as its id, not "[object Object]"', () => {
    // Nested ONLY. The builder also sends a flat customer_id for old-code comparisons elsewhere; left in, the old
    // implementation would read that first and this test would never reach the shape it is about.
    const data = { ...checkout().data } as Record<string, unknown>;
    delete data.customer_id;
    const sub = extractSubscriptionFromCheckout(asEvent(data));
    expect(sub?.providerCustomerId).toBe('cus_1');
  });

  it('a plan without a buyer is an error, not "not ours"', () => {
    expect(() => extractSubscriptionFromCheckout(asEvent(checkout({ user: null }).data))).toThrow(BillingFactsError);
  });

  it('the thrown reason says what is missing and carries no customer data', () => {
    try {
      extractSubscriptionFromCheckout(asEvent(checkout({ product: 'prod_unknown' }).data));
      throw new Error('expected a BillingFactsError');
    } catch (err) {
      expect(err).toBeInstanceOf(BillingFactsError);
      expect((err as BillingFactsError).reason).toMatch(/not a plan this integration sells/);
      expect((err as BillingFactsError).reason).not.toMatch(/cus_1|user-1|sub_1/);
    }
  });
});
