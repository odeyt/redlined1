/**
 * The PRODUCTION Creem webhook — app/api/billing/webhook/creem, the route Creem actually delivers to (proxy.ts puts
 * '/api/billing/webhook' in PUBLIC_PATHS; billing_events holds the production history). Real POST handler, real HMAC
 * signature, Creem's real envelope shape (eventType + object). Only Supabase and the alert sink are replaced, and
 * BILLING_AUTHORITATIVE_STATE is off, as it is in production.
 *
 * What was wrong at 172f5a9, each pinned below:
 *   - subscription.paused was HELD as an unhandled event, so a paused customer kept full paid access indefinitely;
 *   - resolvePlan disagreed with the shared rule both ways (it accepted a metadata plan with no product when a
 *     mapping was configured, and refused a mapped product whose metadata named no plan);
 *   - a signature failure LOGGED the valid HMAC of the sender's body — a forging oracle for anyone with log access;
 *   - a failed write answered 500 with the internal database error text in the body.
 *
 * Every id, product, date and secret here is synthetic.
 */
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { createInMemoryDb, type InMemoryDb } from '../billing/__tests__/inMemoryBillingDb';
import { getPlanStatus } from '../planGate';

let mockDb: InMemoryDb;
jest.mock('@supabase/supabase-js', () => ({ createClient: () => mockDb.db }));
jest.mock('@/lib/observability/billingAlerts', () => ({
  alertBillingFailure: () => {},
  alertBillingException: () => {},
}));

import { POST } from '../../app/api/billing/webhook/creem/route';

const SECRET = 'whsec_production_route_test_only';
const SHOP = 'a1000000-0000-4000-8000-0000000000a1';
const USER = 'c1000000-0000-4000-8000-0000000000c1';
const DATES = { current_period_start_date: '2026-09-01T00:00:00.000Z', current_period_end_date: '2026-10-01T00:00:00.000Z' };
const STORED = { current_period_start: '2026-08-01T00:00:00.000Z', current_period_end: '2026-09-01T00:00:00.000Z' };

let logs: string[];

beforeEach(() => {
  process.env.CREEM_WEBHOOK_SECRET = SECRET;
  delete process.env.BILLING_AUTHORITATIVE_STATE;
  for (const k of Object.keys(process.env)) if (/^CREEM_.*_PRODUCT_ID$/.test(k)) delete process.env[k];
  process.env.CREEM_BUSINESS_MONTHLY_PRODUCT_ID = 'prod_biz';
  process.env.CREEM_SOLO_MONTHLY_PRODUCT_ID = 'prod_solo';

  mockDb = createInMemoryDb({ unique: { billing_events: ['provider', 'provider_event_id'] } });
  mockDb.seed('shops', [{ id: SHOP, name: 'Shop A' }]);
  mockDb.seed('shop_users', [{ shop_id: SHOP, user_id: USER, role: 'owner' }]);
  mockDb.seed('profiles', [{ id: USER, plan: 'free', trial_ends_at: null, billing_status: 'inactive' }]);
  mockDb.seed('shop_subscriptions', []);
  mockDb.seed('billing_events', []);

  logs = [];
  const capture = (...a: unknown[]) => { logs.push(a.map(x => (x instanceof Error ? x.message : String(x))).join(' ')); };
  jest.spyOn(console, 'error').mockImplementation(capture);
  jest.spyOn(console, 'warn').mockImplementation(capture);
});
afterEach(() => { jest.restoreAllMocks(); });

const META = { shop_id: SHOP, user_id: USER };
type Opt<T> = T | null;

/** checkout.completed, Creem's envelope. product: null omits it. */
function checkout(o: { id?: string; product?: Opt<string>; plan?: Opt<string>; period?: Opt<Record<string, string>> } = {}) {
  const metadata = { ...META, ...(o.plan === null ? {} : { plan_key: o.plan ?? 'business' }) };
  return {
    id: o.id ?? 'evt_checkout', eventType: 'checkout.completed', created_at: 1788000000000,
    object: {
      object: 'checkout', id: 'ch_1', status: 'completed', customer: { id: 'cus_1' },
      ...(o.product === null ? {} : { product: { id: o.product ?? 'prod_biz', billing_type: 'recurring' } }),
      metadata,
      subscription: { object: 'subscription', id: 'sub_1', status: 'active', customer: { id: 'cus_1' }, metadata,
        ...(o.period === null ? {} : (o.period ?? DATES)) },
    },
  };
}

/** A subscription.* event: the object IS the subscription. */
function subEvent(type: string, o: { id?: string; sub?: string; product?: Opt<string>; plan?: Opt<string>; period?: Opt<Record<string, string>> } = {}) {
  return {
    id: o.id ?? `evt_${type}`, eventType: type, created_at: 1790000000000,
    object: {
      object: 'subscription', id: o.sub ?? 'sub_1', status: 'active', customer: { id: 'cus_1' },
      ...(o.product === null ? {} : { product: { id: o.product ?? 'prod_biz', billing_type: 'recurring' } }),
      metadata: { ...META, ...(o.plan === null ? {} : { plan_key: o.plan ?? 'business' }) },
      ...(o.period === null ? {} : (o.period ?? DATES)),
    },
  };
}

async function deliver(payload: unknown, secret = SECRET) {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  const res = await POST(new NextRequest('http://localhost/api/billing/webhook/creem', {
    method: 'POST', body, headers: { 'creem-signature': signature },
  }));
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) as Record<string, unknown> };
}

const profile = () => mockDb.rows('profiles').find(p => p.id === USER)!;
const row = () => mockDb.rows('shop_subscriptions').find(r => r.shop_id === SHOP);
const events = () => mockDb.rows('billing_events');
const access = () => getPlanStatus(String(profile().plan), null);

/** A paid, active shop, as a completed checkout leaves it. */
function seedPaid() {
  mockDb.seed('profiles', [{ id: USER, plan: 'business', trial_ends_at: null, billing_status: 'active' }]);
  mockDb.seed('shop_subscriptions', [{
    id: 'row-1', shop_id: SHOP, plan_key: 'business', status: 'active', billing_provider: 'creem',
    provider_customer_id: 'cus_1', provider_subscription_id: 'sub_1', ...STORED,
    created_at: '2026-08-01T00:00:00.000Z',
  }]);
}

// ── 1-5: plan and period come from the provider ────────────────────────────────────────────────────────────
describe('the production route takes the plan from the product and nothing else', () => {
  it('metadata CANNOT grant a plan on its own when a product mapping is configured', async () => {
    const r = await deliver(checkout({ product: null }));
    expect(r.body).toEqual({ received: true, unresolved: 'plan_missing' });
    expect(access()).toBe('free');
  });

  it('a mapped product grants its plan even when the metadata names none', async () => {
    const r = await deliver(checkout({ plan: null }));
    expect(r.status).toBe(200);
    expect(profile().plan).toBe('business');
  });

  it.each([
    ['unknown product',             { product: 'prod_unknown' }, 'plan_unknown'],
    ['metadata contradicts product', { plan: 'solo' },           'plan_conflict'],
  ])('%s fails closed', async (_label, o, reason) => {
    const r = await deliver(checkout(o));
    expect(r.body).toEqual({ received: true, unresolved: reason });
    expect(access()).toBe('free');
    expect(row()).toBeUndefined();
  });

  it('no period is invented: an activation without one stores it as unknown', async () => {
    await deliver(checkout({ period: null }));
    expect(profile().plan).toBe('business');
    expect(row()?.current_period_start ?? null).toBeNull();
    expect(row()?.current_period_end ?? null).toBeNull();
  });
});

// ── 6-8: failure, retry, duplicate ─────────────────────────────────────────────────────────────────────────
describe('a temporary write failure is retryable, and applies exactly once', () => {
  it('500 and unprocessed; the resend applies once; a later delivery is a harmless duplicate', async () => {
    const e = checkout({ id: 'evt_retry' });
    mockDb.failNext('profiles', 'update');

    const first = await deliver(e);
    expect(first.status).toBe(500);
    expect(first.body).toEqual({ error: 'Activation failed' });      // no internal error text in the response
    expect(events()).toHaveLength(1);
    expect(events()[0].processed).toBe(false);
    expect(String(events()[0].error)).toMatch(/profiles\.plan update failed/);
    expect(access()).toBe('free');

    const resend = await deliver(e);
    expect(resend.status).toBe(200);
    expect(events()).toHaveLength(1);                                // same row, reused
    expect(events()[0].processed).toBe(true);
    expect(events()[0].error).toBeNull();                            // the stale failure is cleared
    expect(mockDb.writesTo('shop_subscriptions', 'insert')).toHaveLength(1);
    expect(access()).toBe('pro');

    const again = await deliver(e);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ received: true, skipped: 'duplicate' });
    expect(mockDb.writesTo('shop_subscriptions', 'insert')).toHaveLength(1);
  });
});

// ── 9-11: paused, and back ─────────────────────────────────────────────────────────────────────────────────
describe('paused suspends paid access on the production route', () => {
  it('paused -> suspended: access REMOVED; plan, provider ids and period KEPT', async () => {
    seedPaid();
    expect(access()).toBe('pro');

    const r = await deliver(subEvent('subscription.paused'));
    expect(r.body).toEqual({ received: true });
    expect(access()).toBe('free');
    expect(profile().billing_status).toBe('suspended');
    expect(row()).toMatchObject({
      status: 'suspended', plan_key: 'business',
      provider_customer_id: 'cus_1', provider_subscription_id: 'sub_1', ...STORED,
    });
    expect(events()[0].processed).toBe(true);
  });

  it('a later ACTIVE event restores access from the product', async () => {
    seedPaid();
    await deliver(subEvent('subscription.paused'));
    expect(access()).toBe('free');

    const r = await deliver(subEvent('subscription.active', { id: 'evt_resume' }));
    expect(r.status).toBe(200);
    expect(access()).toBe('pro');
    expect(profile().plan).toBe('business');
    expect(row()).toMatchObject({ status: 'active', plan_key: 'business', provider_subscription_id: 'sub_1' });
  });

  it('STALE METADATA cannot restore access: an active event whose product is not provable is held', async () => {
    seedPaid();
    await deliver(subEvent('subscription.paused'));

    const r = await deliver(subEvent('subscription.active', { id: 'evt_stale', product: null }));
    expect(r.body).toEqual({ received: true, unresolved: 'plan_missing' });
    expect(access()).toBe('free');                                   // the stored plan is not proof either
    expect(row()?.status).toBe('suspended');
  });

  it('a pause for a DIFFERENT subscription is held and removes nothing', async () => {
    seedPaid();
    const r = await deliver(subEvent('subscription.paused', { sub: 'sub_OLD' }));
    expect(r.body).toEqual({ received: true, unresolved: 'subscription_mismatch' });
    expect(access()).toBe('pro');
    expect(row()?.status).toBe('active');
  });

  it('a pause for a shop with no subscription is held, not applied to nothing', async () => {
    const r = await deliver(subEvent('subscription.paused'));
    expect(r.body).toEqual({ received: true, unresolved: 'subscription_unidentified' });
  });

  it('a pause whose profile write fails is retryable and suspends on the resend', async () => {
    seedPaid();
    mockDb.failNext('profiles', 'update');
    expect((await deliver(subEvent('subscription.paused'))).status).toBe(500);
    expect(access()).toBe('pro');
    expect(events()[0].processed).toBe(false);

    expect((await deliver(subEvent('subscription.paused'))).status).toBe(200);
    expect(access()).toBe('free');
    expect(row()?.status).toBe('suspended');
  });
});

// ── 12: nothing sensitive in logs or responses ─────────────────────────────────────────────────────────────
describe('logs and responses', () => {
  it('a rejected signature does NOT log the valid HMAC of the sender\'s body', async () => {
    const payload = checkout({ id: 'evt_forged' });
    const body = JSON.stringify(payload);
    const validForThisBody = createHmac('sha256', SECRET).update(body).digest('hex');

    const r = await deliver(payload, 'not-the-secret');
    expect(r.status).toBe(401);
    const everything = [r.text, ...logs].join('\n');
    expect(everything).not.toContain(validForThisBody);
    expect(everything).not.toContain(validForThisBody.slice(0, 32));
    expect(everything).not.toContain(SECRET);
  });
});
