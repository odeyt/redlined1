/**
 * The Creem webhook route, exercised as a route: real POST handler, real signature check, real request/response.
 * Only the database (an in-memory stand-in, see lib/billing/__tests__/inMemoryBillingDb.ts) and the alert sink are
 * replaced. Nothing here calls Creem, Supabase or Sentry, and every id, date and value is synthetic.
 *
 * The payload SHAPES come from key names read out of stored production events (checkout.completed carries a nested
 * `subscription`; subscription.paid carries current_period_start_date / current_period_end_date; a one-time order
 * from outside the app carries request_id and no metadata). No production value was copied.
 */
import { createHmac } from 'crypto';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { createInMemoryDb, type InMemoryDb } from '../billing/__tests__/inMemoryBillingDb';
import { getPlanStatus } from '../planGate';

let mockDb: InMemoryDb;
const mockAlerts = { failures: [] as Array<[string, Record<string, unknown>]>, exceptions: [] as unknown[][] };

jest.mock('@supabase/supabase-js', () => ({ createClient: () => mockDb.db }));
jest.mock('@/lib/observability/billingAlerts', () => ({
  alertBillingFailure: (message: string, context: Record<string, unknown>) => { mockAlerts.failures.push([message, context]); },
  alertBillingException: (...a: unknown[]) => { mockAlerts.exceptions.push(a); },
}));

import { POST } from '../../app/api/billing/webhook/creem/route';

const SECRET = 'whsec_route_test_secret_only';
const SHOP_A = 'a1000000-0000-4000-8000-0000000000a1';
const SHOP_B = 'a2000000-0000-4000-8000-0000000000a2';
const SHOP_MISSING = 'a9000000-0000-4000-8000-0000000000a9';
const USER_A = 'c1000000-0000-4000-8000-0000000000c1';
const USER_TWO_SHOPS = 'c2000000-0000-4000-8000-0000000000c2';
const USER_NO_SHOP = 'c3000000-0000-4000-8000-0000000000c3';
const USER_ONE_SHOP = 'c4000000-0000-4000-8000-0000000000c4';

const UNIQUE = { billing_events: ['provider_event_id'], shop_subscriptions: ['shop_id'] };

function freshDb(unique?: Record<string, string[]>) {
  mockDb = createInMemoryDb({ unique });
  mockDb.seed('shops', [{ id: SHOP_A, name: 'Shop A' }, { id: SHOP_B, name: 'Shop B' }]);
  mockDb.seed('shop_users', [
    { shop_id: SHOP_A, user_id: USER_A, role: 'owner' },
    { shop_id: SHOP_A, user_id: USER_TWO_SHOPS, role: 'owner' },
    { shop_id: SHOP_B, user_id: USER_TWO_SHOPS, role: 'owner' },
    { shop_id: SHOP_B, user_id: USER_ONE_SHOP, role: 'owner' },
  ]);
  mockDb.seed('profiles', [USER_A, USER_TWO_SHOPS, USER_NO_SHOP, USER_ONE_SHOP].map(id => ({ id, plan: 'free', trial_ends_at: null, billing_status: 'inactive' })));
  mockDb.seed('shop_subscriptions', []);
  mockDb.seed('billing_events', []);
}

// ── payload builders ───────────────────────────────────────────────────────────────────────────────────────
const meta = (o: Record<string, string> = {}) => ({ shop_id: SHOP_A, user_id: USER_A, plan_id: 'solo', plan_key: 'solo', billing_interval: 'monthly', ...o });
const dates = (start: string, end: string) => ({ current_period_start_date: start, current_period_end_date: end });

/** checkout.completed for a Redlined1 checkout. `metadata: null` means the event carries none. */
function initial(o: { id?: string; metadata?: Record<string, string> | null; period?: Record<string, unknown> | null } = {}) {
  const metadata = o.metadata === undefined ? meta() : o.metadata;
  const period = o.period === undefined ? dates('2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z') : o.period;
  return {
    id: o.id ?? 'evt_test_initial', eventType: 'checkout.completed', created_at: 1788000000000,
    object: {
      object: 'checkout', id: 'ch_test_1', mode: 'prod', status: 'completed',
      customer: { id: 'cus_test_1' }, order: { id: 'ord_test_1', status: 'paid', type: 'recurring' }, product: { id: 'prod_test_1', billing_type: 'recurring' },
      ...(metadata ? { metadata } : {}),
      subscription: { object: 'subscription', id: 'sub_test_1', status: 'active', customer: { id: 'cus_test_1' }, ...(metadata ? { metadata } : {}), ...(period ?? {}) },
    },
  };
}

/** subscription.paid: the object IS the subscription. */
function renewal(o: { id?: string; type?: string; metadata?: Record<string, string> | null; period?: Record<string, unknown> | null } = {}) {
  const metadata = o.metadata === undefined ? meta() : o.metadata;
  const period = o.period === undefined ? dates('2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z') : o.period;
  return {
    id: o.id ?? 'evt_test_renewal', eventType: o.type ?? 'subscription.paid', created_at: 1790000000000,
    object: {
      object: 'subscription', id: 'sub_test_1', mode: 'prod', status: 'active', customer: { id: 'cus_test_1' },
      product: { id: 'prod_test_1', billing_type: 'recurring' }, ...(metadata ? { metadata } : {}), ...(period ?? {}),
    },
  };
}

/** A one-time order made outside Redlined1 (payment link / dashboard): request_id, no metadata. */
const externalOrder = (id = 'evt_test_external') => ({
  id, eventType: 'checkout.completed', created_at: 1788000000000,
  object: {
    object: 'checkout', id: 'ch_ext_1', mode: 'prod', status: 'completed', request_id: 'req_test_1',
    customer: { id: 'cus_ext_1' }, order: { id: 'ord_ext_1', status: 'paid', type: 'onetime' }, product: { id: 'prod_ext_1', billing_type: 'onetime' },
  },
});

async function deliver(payload: unknown, opts: { secret?: string } = {}) {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', opts.secret ?? SECRET).update(body).digest('hex');
  const res = await POST(new NextRequest('http://localhost/api/billing/webhook/creem', { method: 'POST', body, headers: { 'creem-signature': signature } }));
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

const events = () => mockDb.rows('billing_events');
const subs = () => mockDb.rows('shop_subscriptions');
const profile = (id: string) => mockDb.rows('profiles').find(p => p.id === id)!;

beforeEach(() => {
  process.env.CREEM_WEBHOOK_SECRET = SECRET;
  for (const k of Object.keys(process.env)) if (/^CREEM_.*_PRODUCT_ID$/.test(k)) delete process.env[k];   // plan-vs-product checks are opt-in per test
  mockAlerts.failures.length = 0;
  mockAlerts.exceptions.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  freshDb();
});
afterEach(() => { jest.restoreAllMocks(); });

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('subscription period: initial payment and renewal', () => {
  it("initial payment stores the provider's own period, from the nested subscription", async () => {
    const r = await deliver(initial());
    expect(r).toEqual({ status: 200, body: { received: true } });
    expect(subs()).toHaveLength(1);
    expect(subs()[0]).toMatchObject({
      shop_id: SHOP_A, plan_key: 'solo', status: 'active', billing_provider: 'creem',
      provider_customer_id: 'cus_test_1', provider_subscription_id: 'sub_test_1',
      current_period_start: '2026-09-01T00:00:00.000Z', current_period_end: '2026-10-01T00:00:00.000Z',
    });
    expect(events()[0]).toMatchObject({ shop_id: SHOP_A, processed: true, error: null });
  });

  it('a renewal (subscription.paid) advances the period on the SAME row, from current_period_end_date', async () => {
    await deliver(initial());
    const r = await deliver(renewal());
    expect(r.status).toBe(200);
    expect(subs()).toHaveLength(1);
    expect(subs()[0]).toMatchObject({ current_period_start: '2026-10-01T00:00:00.000Z', current_period_end: '2026-11-01T00:00:00.000Z', status: 'active' });
    // The renewal carries no subscription id of its own, and must not blank the one the initial payment stored.
    expect(subs()[0]).toMatchObject({ provider_subscription_id: 'sub_test_1', provider_customer_id: 'cus_test_1' });
  });

  it('the real production ordering (renewal event first, initial payment a moment later) ends with one complete row', async () => {
    await deliver(renewal({ id: 'evt_test_first' }));
    await deliver(initial({ id: 'evt_test_second' }));
    expect(subs()).toHaveLength(1);
    expect(subs()[0]).toMatchObject({ provider_subscription_id: 'sub_test_1', provider_customer_id: 'cus_test_1' });
    expect(subs()[0].current_period_end).toBeTruthy();
  });

  it('does NOT read the old field names: a payload that only has current_period_end gets NO period, never a guessed one', async () => {
    const legacy = initial({ period: { current_period_start: '2026-09-01T00:00:00.000Z', current_period_end: '2026-10-01T00:00:00.000Z' } });
    await deliver(legacy);
    expect(subs()[0].current_period_start).toBeNull();
    expect(subs()[0].current_period_end).toBeNull();   // the old code stored now + 30 days here
  });

  it('an event that carries no period leaves an existing stored period exactly as it was', async () => {
    mockDb.seed('shop_subscriptions', [{ id: 'sub-row-1', shop_id: SHOP_A, plan_key: 'solo', status: 'active', current_period_start: '2026-08-01T00:00:00.000Z', current_period_end: '2026-08-31T00:00:00.000Z', created_at: '2026-08-01T00:00:00.000Z' }]);
    await deliver(initial({ period: null }));
    expect(subs()).toHaveLength(1);
    expect(subs()[0]).toMatchObject({ current_period_start: '2026-08-01T00:00:00.000Z', current_period_end: '2026-08-31T00:00:00.000Z' });
  });

  it('ignores implausible or unparseable dates instead of storing them', async () => {
    await deliver(initial({ period: dates('not a date', '1970-01-01T00:00:00.000Z') }));
    expect(subs()[0].current_period_start).toBeNull();
    expect(subs()[0].current_period_end).toBeNull();
  });

  it('a period that ends before it starts is provider data we cannot trust: neither is stored', async () => {
    await deliver(initial({ period: dates('2026-10-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z') }));
    expect(subs()[0].current_period_start).toBeNull();
    expect(subs()[0].current_period_end).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('classification comes before the shop link', () => {
  it('an external one-time order is recorded and acknowledged, not reported as a failed Redlined1 subscription', async () => {
    const r = await deliver(externalOrder());
    expect(r).toEqual({ status: 200, body: { received: true, classified: 'external_order' } });
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ shop_id: null, processed: true, error: null });
    expect(subs()).toHaveLength(0);
    expect(mockDb.writesTo('profiles')).toHaveLength(0);
    expect(mockAlerts.failures).toHaveLength(0);     // the old code fired "subscription NOT activated" here
    expect(mockAlerts.exceptions).toHaveLength(0);
  });

  it('ONLY a positively identified external one-time order is acknowledged quietly: a one-time order that is not positively identified is held', async () => {
    const unidentified = externalOrder('evt_test_unidentified') as { object: Record<string, unknown> };
    delete unidentified.object.order;
    delete unidentified.object.product;   // no billing type at all: not positively one-time
    const r = await deliver(unidentified);
    expect(r.body).toEqual({ received: true, unresolved: 'malformed_checkout' });
    expect(events()[0]).toMatchObject({ processed: false, error: 'UNRESOLVED:malformed_checkout' });
  });

  it('a subscription event with Redlined1 metadata is classified as ours and processed normally', async () => {
    const r = await deliver(initial());
    expect(r.body).toEqual({ received: true });
    expect(mockAlerts.failures).toHaveLength(0);
  });

  it('metadata that appears only on the nested subscription is used to find the shop too (classifying and linking agree)', async () => {
    const p = initial() as { object: Record<string, unknown> };
    delete p.object.metadata;   // the nested subscription still carries it
    const r = await deliver(p);
    expect(r).toEqual({ status: 200, body: { received: true } });
    expect(subs()).toHaveLength(1);
    expect(subs()[0].shop_id).toBe(SHOP_A);
    expect(events()[0]).toMatchObject({ shop_id: SHOP_A, processed: true, error: null });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('a subscription event that cannot be linked to a shop', () => {
  const unresolvedRow = () => events().find(e => typeof e.error === 'string' && String(e.error).startsWith('UNRESOLVED:'));

  it('is kept as an owner-visible unresolved event, acknowledged, and changes nothing', async () => {
    const r = await deliver(renewal({ metadata: null }));
    expect(r).toEqual({ status: 200, body: { received: true, unresolved: 'no_shop_metadata' } });
    expect(events()).toHaveLength(1);
    // The exact shape Billing Health counts as "failed": error set, not processed.
    expect(events()[0]).toMatchObject({ shop_id: null, processed: false, error: 'UNRESOLVED:no_shop_metadata' });
    expect(subs()).toHaveLength(0);
    expect(mockDb.writesTo('profiles')).toHaveLength(0);   // no user identified, so no plan was granted to anyone
    expect(mockDb.writesTo('shop_subscriptions')).toHaveLength(0);
    expect(mockAlerts.failures).toHaveLength(1);
    expect(mockAlerts.failures[0][0]).toMatch(/event held/);
    expect(mockAlerts.failures[0][1]).toMatchObject({ reason: 'no_shop_metadata', eventClass: 'unattributed_subscription' });
  });

  it('the alert carries no payload, email or customer id', async () => {
    await deliver(renewal({ metadata: null }));
    const ctx = JSON.stringify(mockAlerts.failures[0][1]);
    expect(ctx).not.toMatch(/cus_test|sub_test|@|payload|customer/i);
  });

  it('a shop id that does not exist is unresolved, and no subscription is written for any shop', async () => {
    const r = await deliver(initial({ metadata: meta({ shop_id: SHOP_MISSING }) }));
    expect(r.body).toEqual({ received: true, unresolved: 'shop_not_found' });
    expect(subs()).toHaveLength(0);
    expect(unresolvedRow()).toBeTruthy();
  });

  it('a malformed shop id is unresolved, not a database error and not a retry storm', async () => {
    const r = await deliver(initial({ metadata: meta({ shop_id: 'not-a-uuid' }) }));
    expect(r).toEqual({ status: 200, body: { received: true, unresolved: 'shop_not_found' } });
    expect(mockAlerts.exceptions).toHaveLength(0);
  });

  it('a buyer in TWO shops is never assigned an arbitrary one: unresolved, and neither shop gets a subscription', async () => {
    const r = await deliver(initial({ metadata: { user_id: USER_TWO_SHOPS, plan_key: 'solo', plan_id: 'solo' } }));
    expect(r.body).toEqual({ received: true, unresolved: 'ambiguous_membership' });
    expect(subs()).toHaveLength(0);
    // Nothing is granted before the shop is resolved: not the buyer's profile, and not any shop's record.
    expect(mockDb.writesTo('profiles')).toHaveLength(0);
    expect(profile(USER_TWO_SHOPS).plan).toBe('free');
    expect(profile(USER_A).plan).toBe('free');
  });

  it('a buyer who belongs to no shop is unresolved (no_membership)', async () => {
    const r = await deliver(initial({ metadata: { user_id: USER_NO_SHOP, plan_key: 'solo', plan_id: 'solo' } }));
    expect(r.body).toEqual({ received: true, unresolved: 'no_membership' });
    expect(subs()).toHaveLength(0);
  });

  it('a buyer with exactly ONE shop is still linked without shop_id (the safe fallback is preserved)', async () => {
    const r = await deliver(initial({ metadata: { user_id: USER_ONE_SHOP, plan_key: 'solo', plan_id: 'solo' } }));
    expect(r.body).toEqual({ received: true });
    expect(subs()).toHaveLength(1);
    expect(subs()[0].shop_id).toBe(SHOP_B);
    expect(events()[0]).toMatchObject({ shop_id: SHOP_B, processed: true });
  });

  it('a cancellation that cannot be linked is held, and does not cancel any shop\'s subscription', async () => {
    mockDb.seed('shop_subscriptions', [{ id: 'sub-row-1', shop_id: SHOP_A, plan_key: 'solo', status: 'active', created_at: '2026-08-01T00:00:00.000Z' }]);
    const r = await deliver(renewal({ type: 'subscription.cancelled', metadata: null }));
    expect(r.body).toEqual({ received: true, unresolved: 'no_shop_metadata' });
    expect(subs()[0].status).toBe('active');
    expect(mockDb.writesTo('shop_subscriptions')).toHaveLength(0);
  });

  describe('acknowledgement and retry, defined deliberately', () => {
    const lateBuyer = () => initial({ id: 'evt_test_late', metadata: { user_id: USER_NO_SHOP, plan_key: 'solo', plan_id: 'solo' } });

    it('is acknowledged with 200 (retrying an unchanged event cannot help), and a redelivery reuses the same row', async () => {
      const first = await deliver(lateBuyer());
      const again = await deliver(lateBuyer());
      expect(first.status).toBe(200);
      expect(again.status).toBe(200);
      expect(events()).toHaveLength(1);
      expect(events()[0]).toMatchObject({ processed: false, error: 'UNRESOLVED:no_membership' });
    });

    it('once the cause is fixed, a redelivery resolves it: same row, cleared, linked, subscription created', async () => {
      await deliver(lateBuyer());
      expect(events()[0].processed).toBe(false);
      mockDb.rows('shop_users').push({ shop_id: SHOP_A, user_id: USER_NO_SHOP, role: 'owner' });   // membership corrected
      const r = await deliver(lateBuyer());
      expect(r).toEqual({ status: 200, body: { received: true } });
      expect(events()).toHaveLength(1);
      expect(events()[0]).toMatchObject({ shop_id: SHOP_A, processed: true, error: null });
      expect(subs()).toHaveLength(1);
      expect(subs()[0].shop_id).toBe(SHOP_A);
    });

    it('a TRANSIENT failure while looking the shop up is not "unresolved": it answers 500 so Creem retries, and the retry succeeds', async () => {
      mockDb.failNext('shops', 'select', { message: 'connection reset' });
      const first = await deliver(initial());
      expect(first.status).toBe(500);
      expect(events()).toHaveLength(1);
      expect(events()[0].processed).toBe(false);
      expect(String(events()[0].error)).not.toMatch(/^UNRESOLVED:/);
      expect(mockAlerts.exceptions).toHaveLength(1);
      const retry = await deliver(initial());
      expect(retry.status).toBe(200);
      expect(events()).toHaveLength(1);
      expect(events()[0]).toMatchObject({ processed: true, error: null });
      expect(subs()).toHaveLength(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('idempotency: duplicate delivery and failed redelivery (sequential)', () => {
  it('a duplicate delivery of a processed event is skipped: no second row, no further writes', async () => {
    await deliver(initial());
    mockDb.clearWrites();
    const r = await deliver(initial());
    expect(r).toEqual({ status: 200, body: { received: true, skipped: 'duplicate' } });
    expect(events()).toHaveLength(1);
    expect(subs()).toHaveLength(1);
    expect(mockDb.state.writes).toHaveLength(0);
  });

  it('a redelivery after a FAILED attempt reuses the event row and completes; there is still one row and one subscription', async () => {
    mockDb.failNext('shop_subscriptions', 'insert', { message: 'simulated write failure' });
    const first = await deliver(initial());
    expect(first.status).toBe(500);
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ processed: false });
    expect(String(events()[0].error)).toMatch(/shop_subscriptions insert failed/);
    expect(mockAlerts.exceptions).toHaveLength(1);
    expect(subs()).toHaveLength(0);
    expect(profile(USER_A).plan).toBe('solo');   // the buyer's own plan was already set; repeating that write is harmless

    const retry = await deliver(initial());
    expect(retry).toEqual({ status: 200, body: { received: true } });
    expect(events()).toHaveLength(1);                                   // NOT two rows for one event
    expect(events()[0]).toMatchObject({ processed: true, error: null }); // the earlier error is cleared
    expect(subs()).toHaveLength(1);
  });

  it('a bad signature is rejected before anything is read or written', async () => {
    const r = await deliver(initial(), { secret: 'a-different-secret' });
    expect(r.status).toBe(401);
    expect(mockDb.state.writes).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('idempotency under CONCURRENT delivery', () => {
  it('KNOWN LIMITATION, pinned so it cannot be forgotten: with no unique index, overlapping deliveries of one event both insert', async () => {
    // The application checks "does this event id exist?" and then inserts. Two requests that overlap both pass the
    // check before either inserts. This test documents that behaviour; it is not a behaviour anyone wants.
    // It fails the day billing_events gets a unique index on provider_event_id: then update this test and the docs.
    // The barrier holds both requests at their "does this event exist?" read until both have arrived, so both
    // provably pass the check before either inserts. (Not left to scheduler timing.)
    mockDb.barrier('billing_events', 'select', 2);
    const [a, b] = await Promise.all([deliver(initial()), deliver(initial())]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(events()).toHaveLength(2);
  });

  it('KNOWN LIMITATION: with no unique index on shop_id, two overlapping DIFFERENT events for a new shop each create a subscription row', async () => {
    mockDb.barrier('shop_subscriptions', 'select', 2);   // both look for the shop's row before either creates it
    await Promise.all([deliver(initial({ id: 'evt_test_a' })), deliver(renewal({ id: 'evt_test_b' }))]);
    expect(subs()).toHaveLength(2);
  });

  describe('with the unique indexes proposed in docs/billing-webhook-idempotency.md (modelled here; NOT in this change)', () => {
    beforeEach(() => freshDb(UNIQUE));

    it('two overlapping deliveries of the SAME event leave exactly one event row and one subscription; the loser is a duplicate', async () => {
      mockDb.barrier('billing_events', 'select', 2);   // both pass the existence check before either inserts
      const results = await Promise.all([deliver(initial()), deliver(initial())]);
      expect(results.map(r => r.status)).toEqual([200, 200]);
      expect(events()).toHaveLength(1);
      expect(subs()).toHaveLength(1);
      expect(results.filter(r => r.body.skipped === 'duplicate')).toHaveLength(1);   // the insert that lost the race
    });

    it('two overlapping DIFFERENT events for a new shop leave exactly one subscription that holds what both carried', async () => {
      mockDb.barrier('shop_subscriptions', 'select', 2);   // both look for the shop's row before either creates it
      const results = await Promise.all([deliver(initial({ id: 'evt_test_a' })), deliver(renewal({ id: 'evt_test_b' }))]);
      expect(results.map(r => r.status)).toEqual([200, 200]);       // no 5xx, so no needless retry
      expect(subs()).toHaveLength(1);
      expect(subs()[0]).toMatchObject({ provider_subscription_id: 'sub_test_1', provider_customer_id: 'cus_test_1', status: 'active' });
      expect(subs()[0].current_period_end).toBeTruthy();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('the period is display data: correcting it cannot change entitlement', () => {
  it('a renewal whose period ends in the distant past or future changes neither the buyer\'s plan nor the subscription status', async () => {
    await deliver(initial());
    const before = { plan: profile(USER_A).plan, status: profile(USER_A).billing_status, sub: subs()[0].status, access: getPlanStatus(String(profile(USER_A).plan), null) };
    expect(before).toEqual({ plan: 'solo', status: 'active', sub: 'active', access: 'pro' });

    // A far-future end moves the period FORWARD; a far-past end does NOT move it back. Neither touches entitlement.
    for (const [i, end, moved] of [['past', '2001-01-01T00:00:00.000Z', false], ['future', '2099-01-01T00:00:00.000Z', true]] as const) {
      const storedEnd = subs()[0].current_period_end;
      await deliver(renewal({ id: `evt_test_${i}`, period: dates('2000-12-01T00:00:00.000Z', end) }));
      expect(subs()).toHaveLength(1);
      expect(subs()[0].current_period_end).toBe(moved ? end : storedEnd);
      expect({ plan: profile(USER_A).plan, status: profile(USER_A).billing_status, sub: subs()[0].status, access: getPlanStatus(String(profile(USER_A).plan), null) }).toEqual(before);
    }
  });

  it('a renewal writes a fixed, small set of fields; the period goes through its own conditional statements', async () => {
    await deliver(initial());
    const before = { ...subs()[0] };
    mockDb.clearWrites();
    await deliver(renewal());
    const [patch, ...periodWrites] = mockDb.writesTo('shop_subscriptions', 'update').map(w => w.values);
    expect(Object.keys(patch).sort()).toEqual(['plan_key', 'provider_customer_id', 'status', 'updated_at']);   // no period in the general write
    // plan, status and the customer id are re-stated with the SAME values, so only the display period actually moves
    expect(patch).toMatchObject({ plan_key: before.plan_key, status: before.status, provider_customer_id: before.provider_customer_id });
    expect(periodWrites.every(w => Object.keys(w).sort().join() === 'current_period_end,current_period_start')).toBe(true);
    expect(subs()[0].current_period_end).not.toBe(before.current_period_end);
  });

  it('entitlement code does not read the subscription period or shop_subscriptions at all', () => {
    const root = path.join(__dirname, '..', '..');
    for (const f of ['lib/planGate.ts', 'lib/usePlan.ts']) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      expect(src).not.toMatch(/period_end|periodEnd|current_period|shop_subscriptions/);
    }
  });

  it('no application source compares a subscription period end with the current time', () => {
    const root = path.join(__dirname, '..', '..');
    const SKIP = new Set(['node_modules', '.next', '.git', '__tests__', 'tests', 'docs', 'supabase', 'coverage', 'scripts']);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name)) files.push(full);
      }
    };
    ['app', 'lib', 'commercial', 'features', 'components', 'services', 'hooks'].filter(d => fs.existsSync(path.join(root, d))).forEach(d => walk(path.join(root, d)));
    // `period_end` / `periodEnd` on the same line as a < or > comparison against "now" (arrow functions excluded).
    const CMP = '(?<![=-])[<>]=?(?!>)';
    const NOW = '(Date\\.now\\(\\)|new Date\\(\\s*\\))';
    const gate = new RegExp(`(period_?end|periodEnd|PeriodEnd)[^\\n]*${CMP}[^\\n]*${NOW}|${NOW}[^\\n]*${CMP}[^\\n]*(period_?end|periodEnd|PeriodEnd)`, 'i');
    const offenders = files.filter(f => gate.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(root, f).replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// Revision of PR #37: every case below was reproduced against the reviewed head first (see the PR), then fixed.
const USER_TECH = 'c5000000-0000-4000-8000-0000000000c5';
const USER_ADVISOR = 'c6000000-0000-4000-8000-0000000000c6';
const USER_MANAGER = 'c7000000-0000-4000-8000-0000000000c7';
const USER_MIXED = 'c8000000-0000-4000-8000-0000000000c8';
const USER_ONLY_TECH = 'c9000000-0000-4000-8000-0000000000c9';
const USER_NO_PROFILE = 'ca000000-0000-4000-8000-0000000000ca';

function addMember(userId: string, shopId: string, role: string, withProfile = true) {
  mockDb.rows('shop_users').push({ shop_id: shopId, user_id: userId, role });
  if (withProfile && !mockDb.rows('profiles').some(p => p.id === userId)) {
    mockDb.rows('profiles').push({ id: userId, plan: 'free', trial_ends_at: null, billing_status: 'inactive' });
  }
}

/** The event was held, acknowledged, and NOTHING was changed for anyone. */
function expectHeld(r: { status: number; body: Record<string, unknown> }, reason: string, plansThatMustStayFree: string[] = []) {
  expect(r.status).toBe(200);                                        // acknowledged: a redelivery of the same bytes cannot change the answer
  expect(r.body).toEqual({ received: true, unresolved: reason });
  expect(events().at(-1)).toMatchObject({ processed: false, error: `UNRESOLVED:${reason}` });
  expect(mockDb.writesTo('profiles')).toHaveLength(0);               // no plan granted, no billing status touched
  expect(mockDb.writesTo('shop_subscriptions')).toHaveLength(0);     // no subscription created or changed
  for (const id of plansThatMustStayFree) expect(profile(id).plan).toBe('free');
  expect(mockAlerts.exceptions).toHaveLength(0);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('period ordering: an older event or retry never moves a stored period end backward', () => {
  const OCT_NOV = dates('2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z');
  const NOV_DEC = dates('2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z');

  it('LATE DELIVERY: an older event that arrives after a newer renewal leaves the newer period in place', async () => {
    await deliver(renewal({ id: 'evt_test_newer', period: NOV_DEC }));
    expect(subs()[0]).toMatchObject({ current_period_start: '2026-11-01T00:00:00.000Z', current_period_end: '2026-12-01T00:00:00.000Z' });
    const r = await deliver(initial({ id: 'evt_test_late_older' }));      // Sep 1 -> Oct 1, delivered last
    expect(r).toEqual({ status: 200, body: { received: true } });
    expect(events().find(e => e.provider_event_id === 'evt_test_late_older')).toMatchObject({ processed: true, error: null });
    expect(subs()).toHaveLength(1);
    expect(subs()[0]).toMatchObject({ current_period_start: '2026-11-01T00:00:00.000Z', current_period_end: '2026-12-01T00:00:00.000Z' });
  });

  it('FAILED REDELIVERY: an event that failed, then a newer renewal, then the retry of the failed one: the newer period survives', async () => {
    await deliver(renewal({ id: 'evt_test_r1', period: OCT_NOV }));
    mockDb.failNext('shop_subscriptions', 'update', { message: 'simulated write failure' });
    const failed = await deliver(initial({ id: 'evt_test_i1' }));        // the OLDER event fails and is left for retry
    expect(failed.status).toBe(500);
    await deliver(renewal({ id: 'evt_test_r2', period: NOV_DEC }));      // a newer renewal lands meanwhile
    expect(subs()[0].current_period_end).toBe('2026-12-01T00:00:00.000Z');

    const retry = await deliver(initial({ id: 'evt_test_i1' }));         // Creem retries the older event
    expect(retry).toEqual({ status: 200, body: { received: true } });
    expect(events().filter(e => e.provider_event_id === 'evt_test_i1')).toHaveLength(1);
    expect(events().find(e => e.provider_event_id === 'evt_test_i1')).toMatchObject({ processed: true, error: null });
    expect(subs()).toHaveLength(1);
    expect(subs()[0]).toMatchObject({ current_period_start: '2026-11-01T00:00:00.000Z', current_period_end: '2026-12-01T00:00:00.000Z' });
  });

  it('a newer period still moves forward, an equal one changes nothing, and a period that was never set is filled in', async () => {
    mockDb.seed('shop_subscriptions', [{ id: 'row-1', shop_id: SHOP_A, plan_key: 'solo', status: 'active', current_period_start: null, current_period_end: null, created_at: '2026-08-01T00:00:00.000Z' }]);
    await deliver(renewal({ id: 'evt_a', period: OCT_NOV }));
    expect(subs()[0].current_period_end).toBe('2026-11-01T00:00:00.000Z');       // NULL -> set
    await deliver(renewal({ id: 'evt_b', period: OCT_NOV }));
    expect(subs()[0].current_period_end).toBe('2026-11-01T00:00:00.000Z');       // equal -> unchanged
    await deliver(renewal({ id: 'evt_c', period: NOV_DEC }));
    expect(subs()[0]).toMatchObject({ current_period_start: '2026-11-01T00:00:00.000Z', current_period_end: '2026-12-01T00:00:00.000Z' });   // newer -> moves
  });

  it('the rule is the database\'s, not a read the application made earlier: overlapping older and newer events end at the newer period', async () => {
    await deliver(initial());                                             // creates the row (Sep -> Oct)
    mockDb.barrier('shop_subscriptions', 'select', 2);                    // both requests find the row before either writes to it
    await Promise.all([deliver(renewal({ id: 'evt_test_x', period: NOV_DEC })), deliver(renewal({ id: 'evt_test_y', period: OCT_NOV }))]);
    expect(subs()).toHaveLength(1);
    expect(subs()[0]).toMatchObject({ current_period_start: '2026-11-01T00:00:00.000Z', current_period_end: '2026-12-01T00:00:00.000Z' });
  });

  it('a moved-forward period is written by conditional statements only (never an unconditional overwrite of the two columns)', async () => {
    await deliver(initial());
    mockDb.clearWrites();
    await deliver(renewal());
    const withPeriod = mockDb.writesTo('shop_subscriptions', 'update').filter(w => 'current_period_end' in w.values);
    expect(withPeriod).toHaveLength(2);                                   // "was NULL" and "was older", each matched by the database
    expect(withPeriod.reduce((n, w) => n + (w.matched ?? 0), 0)).toBe(1); // at most one of them can change the row
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('shop authorization: the checkout user must be an eligible member of the shop before anything changes', () => {
  beforeEach(() => {
    addMember(USER_TECH, SHOP_A, 'technician');
    addMember(USER_ADVISOR, SHOP_A, 'advisor');
    addMember(USER_MANAGER, SHOP_A, 'manager');
    addMember(USER_MIXED, SHOP_A, 'owner');
    addMember(USER_MIXED, SHOP_A, 'technician');
    addMember(USER_ONLY_TECH, SHOP_B, 'technician');
    addMember(USER_NO_PROFILE, SHOP_A, 'owner', false);
  });

  it('UNRELATED SHOP: a user who belongs to a different shop gets no plan and the named shop gets no subscription', async () => {
    const r = await deliver(initial({ metadata: meta({ user_id: USER_ONE_SHOP }) }));   // USER_ONE_SHOP is a member of SHOP_B only
    expectHeld(r, 'buyer_not_member', [USER_ONE_SHOP, USER_A]);
    expect(events()[0].shop_id).toBeNull();                                            // the event is not linked to a shop it did not earn
    expect(mockAlerts.failures).toHaveLength(1);
  });

  it('a user with no membership anywhere, naming a real shop, is refused the same way', async () => {
    const r = await deliver(initial({ metadata: meta({ user_id: USER_NO_SHOP }) }));
    expectHeld(r, 'buyer_not_member', [USER_NO_SHOP]);
  });

  it('TECHNICIAN MEMBERSHIP: a technician of the shop receives no paid plan', async () => {
    const r = await deliver(initial({ metadata: meta({ user_id: USER_TECH }) }));
    expectHeld(r, 'buyer_not_eligible', [USER_TECH]);
    expect(subs()).toHaveLength(0);
  });

  it('an advisor is not an eligible buyer either (allowlist: owner and manager only)', async () => {
    const r = await deliver(initial({ metadata: meta({ user_id: USER_ADVISOR }) }));
    expectHeld(r, 'buyer_not_eligible', [USER_ADVISOR]);
  });

  it('a stray technician row next to an owner row for the same shop is refused: every row must be eligible', async () => {
    const r = await deliver(initial({ metadata: meta({ user_id: USER_MIXED }) }));
    expectHeld(r, 'buyer_not_eligible', [USER_MIXED]);
  });

  it('an owner and a manager are eligible: the plan is granted and the subscription written', async () => {
    expect(await deliver(initial({ id: 'evt_owner' }))).toEqual({ status: 200, body: { received: true } });
    expect(profile(USER_A).plan).toBe('solo');
    const m = await deliver(initial({ id: 'evt_mgr', metadata: meta({ user_id: USER_MANAGER }) }));
    expect(m).toEqual({ status: 200, body: { received: true } });
    expect(profile(USER_MANAGER).plan).toBe('solo');
    expect(subs().every(s => s.shop_id === SHOP_A)).toBe(true);
  });

  describe('CONFLICTING METADATA: identifiers come from one source, and two disagreeing sources are refused', () => {
    const withNested = (nested: Record<string, string>, top: Record<string, string> = meta()) => {
      const p = initial({ metadata: top }) as { object: { subscription: { metadata: Record<string, string> } } };
      p.object.subscription.metadata = nested;
      return p;
    };

    it('a top-level shop that differs from the nested subscription\'s shop is a conflict; neither shop is touched', async () => {
      const r = await deliver(withNested(meta({ shop_id: SHOP_B })));
      expectHeld(r, 'conflicting_metadata', [USER_A, USER_ONE_SHOP]);
      expect(subs()).toHaveLength(0);
    });

    it('a top-level user that differs from the nested user is a conflict', async () => {
      const r = await deliver(withNested(meta({ user_id: USER_MANAGER })));
      expectHeld(r, 'conflicting_metadata', [USER_A, USER_MANAGER]);
    });

    it('two halves of two different checkouts are never combined into one buyer + shop pair', async () => {
      // top-level names only the shop, the nested subscription names only a user
      const r = await deliver(withNested({ user_id: USER_A, plan_key: 'solo', plan_id: 'solo' }, { shop_id: SHOP_A, plan_key: 'solo', plan_id: 'solo' }));
      expectHeld(r, 'conflicting_metadata', [USER_A]);
    });

    it('a conflict on a cancellation is refused too, and the stored subscription is left alone', async () => {
      mockDb.seed('shop_subscriptions', [{ id: 'row-1', shop_id: SHOP_A, plan_key: 'solo', status: 'active', created_at: '2026-08-01T00:00:00.000Z' }]);
      const p = renewal({ type: 'subscription.canceled' }) as { object: Record<string, unknown> };
      p.object.subscription = { metadata: meta({ shop_id: SHOP_B }) };
      const r = await deliver(p);
      expectHeld(r, 'conflicting_metadata');
      expect(subs()[0].status).toBe('active');
    });

    it('identical metadata in both places is fine (this is what real checkout.completed events carry)', async () => {
      expect(await deliver(initial())).toEqual({ status: 200, body: { received: true } });
      expect(subs()).toHaveLength(1);
    });
  });

  describe('when the buyer cannot be established safely, nothing is granted', () => {
    it('a shop id with NO checkout user is not enough: unresolved', async () => {
      const m = { shop_id: SHOP_A, plan_key: 'solo', plan_id: 'solo' };
      expectHeld(await deliver(initial({ metadata: m })), 'buyer_unverified', [USER_A]);
    });

    it('a checkout user that is not a valid id is unresolved, not a database error', async () => {
      expectHeld(await deliver(initial({ metadata: meta({ user_id: 'not-a-uuid' }) })), 'buyer_unverified', [USER_A]);
    });

    it('a user id with no shop id falls back ONLY to a single eligible membership; a technician-only user gets nothing', async () => {
      const m = { user_id: USER_ONLY_TECH, plan_key: 'solo', plan_id: 'solo' };
      expectHeld(await deliver(initial({ metadata: m })), 'buyer_not_eligible', [USER_ONLY_TECH]);
      expect(subs()).toHaveLength(0);
    });

    it('the fallback never chooses between two memberships, even when one of them is a technician row', async () => {
      addMember(USER_ONLY_TECH, SHOP_A, 'owner');
      expectHeld(await deliver(initial({ metadata: { user_id: USER_ONLY_TECH, plan_key: 'solo', plan_id: 'solo' } })), 'ambiguous_membership', [USER_ONLY_TECH]);
    });

    it('an eligible member with no profile row is held (a retry cannot create one), and no subscription is written', async () => {
      const r = await deliver(initial({ metadata: meta({ user_id: USER_NO_PROFILE }) }));
      expect(r).toEqual({ status: 200, body: { received: true, unresolved: 'no_buyer_profile' } });
      expect(events()[0]).toMatchObject({ processed: false, error: 'UNRESOLVED:no_buyer_profile' });
      expect(subs()).toHaveLength(0);
    });

    it('a TRANSIENT membership lookup failure is a 5xx (retry can help), not an unresolved event', async () => {
      mockDb.failNext('shop_users', 'select', { message: 'connection reset' });
      const r = await deliver(initial());
      expect(r.status).toBe(500);
      expect(mockDb.writesTo('profiles')).toHaveLength(0);
      expect(subs()).toHaveLength(0);
      expect((await deliver(initial())).status).toBe(200);                              // and the retry succeeds
    });
  });

  describe('cancellation and past-due are authorised the same way', () => {
    beforeEach(() => {
      mockDb.seed('shop_subscriptions', [{ id: 'row-1', shop_id: SHOP_A, plan_key: 'solo', status: 'active', created_at: '2026-08-01T00:00:00.000Z' }]);
    });

    it('a cancellation naming an unrelated user does not cancel the shop and does not touch any billing status', async () => {
      const r = await deliver(renewal({ type: 'subscription.canceled', metadata: meta({ user_id: USER_ONE_SHOP }) }));
      expectHeld(r, 'buyer_not_member');
      expect(subs()[0].status).toBe('active');
    });

    it('a cancellation naming a technician is refused', async () => {
      expectHeld(await deliver(renewal({ type: 'subscription.canceled', metadata: meta({ user_id: USER_TECH }) })), 'buyer_not_eligible');
      expect(subs()[0].status).toBe('active');
    });

    it('a past-due naming an unrelated user is refused', async () => {
      expectHeld(await deliver(renewal({ type: 'subscription.past_due', metadata: meta({ user_id: USER_ONE_SHOP }) })), 'buyer_not_member');
      expect(subs()[0].status).toBe('active');
    });

    it('an eligible buyer\'s cancellation and past-due are still applied', async () => {
      await deliver(renewal({ id: 'evt_pd', type: 'subscription.past_due' }));
      expect(subs()[0].status).toBe('past_due');
      expect(profile(USER_A).billing_status).toBe('past_due');
      await deliver(renewal({ id: 'evt_cx', type: 'subscription.canceled' }));
      expect(subs()[0].status).toBe('cancelled');
      expect(profile(USER_A).billing_status).toBe('cancelled');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('plan mapping: a missing, unknown or conflicting plan is never defaulted to a paid plan', () => {
  const noPlan = () => ({ shop_id: SHOP_A, user_id: USER_A, billing_interval: 'monthly' });

  it('MISSING PLAN: no plan in the metadata is unresolved. The buyer stays on their current plan, NOT professional', async () => {
    const r = await deliver(initial({ metadata: noPlan() }));
    expectHeld(r, 'plan_missing', [USER_A]);
    expect(subs()).toHaveLength(0);
    expect(mockAlerts.failures).toHaveLength(1);
  });

  it.each([
    ['an unknown plan', { plan_key: 'platinum', plan_id: 'platinum' }, 'plan_unknown'],
    ['a plan that is not sold online (enterprise)', { plan_key: 'enterprise', plan_id: 'enterprise' }, 'plan_unknown'],
    ['a legacy plan name that is not in the catalogue', { plan_key: 'pro', plan_id: 'pro' }, 'plan_unknown'],
    ['plan_key and plan_id that disagree', { plan_key: 'solo', plan_id: 'business' }, 'plan_conflict'],
  ])('%s is unresolved and grants nothing', async (_n, plan, reason) => {
    const r = await deliver(initial({ metadata: { ...noPlan(), ...plan } }));
    expectHeld(r, reason, [USER_A]);
    expect(subs()).toHaveLength(0);
  });

  it('a renewal with no plan is held too, and an existing subscription keeps its plan', async () => {
    await deliver(initial({ metadata: meta({ plan_key: 'business', plan_id: 'business' }) }));
    mockDb.clearWrites();
    const r = await deliver(renewal({ metadata: noPlan() }));
    expect(r.body).toEqual({ received: true, unresolved: 'plan_missing' });
    expect(subs()[0].plan_key).toBe('business');
    expect(profile(USER_A).plan).toBe('business');
    expect(mockDb.writesTo('profiles')).toHaveLength(0);
    expect(mockDb.writesTo('shop_subscriptions')).toHaveLength(0);
  });

  it('either key alone is accepted when it is a real plan (the checkout has always sent plan_id, and plan_key)', async () => {
    await deliver(initial({ id: 'evt_1', metadata: { shop_id: SHOP_A, user_id: USER_A, plan_id: 'starter' } }));
    expect(subs()[0].plan_key).toBe('starter');
    await deliver(renewal({ id: 'evt_2', metadata: { shop_id: SHOP_A, user_id: USER_A, plan_key: 'professional' } }));
    expect(subs()[0].plan_key).toBe('professional');
  });

  describe('against the product actually bought (existing CREEM_*_PRODUCT_ID variables, read only)', () => {
    beforeEach(() => {
      process.env.CREEM_SOLO_MONTHLY_PRODUCT_ID = 'prod_test_1';       // the product initial() and renewal() carry
      process.env.CREEM_BUSINESS_MONTHLY_PRODUCT_ID = 'prod_test_biz';
    });

    it('a product that matches the plan is applied', async () => {
      expect(await deliver(initial())).toEqual({ status: 200, body: { received: true } });
      expect(subs()[0].plan_key).toBe('solo');
    });

    it('a product Redlined1 does not sell is held as unknown', async () => {
      const p = renewal() as { object: Record<string, unknown> };
      p.object.product = { id: 'prod_from_a_payment_link', billing_type: 'recurring' };
      expectHeld(await deliver(p), 'plan_unknown', [USER_A]);
    });

    it('a product of another plan than the metadata says is a conflict and grants nothing', async () => {
      const p = initial({ metadata: meta({ plan_key: 'business', plan_id: 'business' }) }) as { object: Record<string, unknown> };
      // the checkout's product is the solo one, but the metadata claims business
      expectHeld(await deliver(p), 'plan_conflict', [USER_A]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('event classification: only a positively identified external order is quiet; everything else is explicit', () => {
  const held = (reason: string) => ({ status: 200, body: { received: true, unresolved: reason } });

  it('MISSING EVENT TYPE: held, recorded, investigable', async () => {
    const r = await deliver({ id: 'evt_test_notype', object: renewal().object });
    expect(r).toEqual(held('missing_event_type'));
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ provider_event_id: 'evt_test_notype', processed: false, error: 'UNRESOLVED:missing_event_type' });
    expect(mockDb.writesTo('profiles')).toHaveLength(0);
    expect(subs()).toHaveLength(0);
  });

  it('MISSING EVENT ID: held and NOT applied (it could not be told apart from a duplicate), recorded with no id', async () => {
    const r = await deliver({ eventType: 'subscription.paid', object: renewal().object });
    expect(r).toEqual(held('missing_event_id'));
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ provider_event_id: null, processed: false, error: 'UNRESOLVED:missing_event_id' });
    expect(mockDb.writesTo('profiles')).toHaveLength(0);
    expect(subs()).toHaveLength(0);
  });

  it('a missing id does not become the text "undefined" or a shared key that would make unrelated events look like duplicates', async () => {
    await deliver({ eventType: 'subscription.paid', object: renewal().object });
    await deliver({ eventType: 'subscription.canceled', object: renewal().object });
    expect(events()).toHaveLength(2);                                                    // two distinct rows; neither was skipped as a "duplicate"
    expect(events().every(e => e.provider_event_id === null)).toBe(true);
  });

  it.each([
    ['text', 'a string'], ['number', 7], ['array', ['a']],
  ])('an unreadable object (%s) is held as malformed, not crashed on', async (name, bad) => {
    const r = await deliver({ id: `evt_test_bad_${name}`, eventType: 'checkout.completed', object: bad });
    expect(r).toEqual(held('malformed_object'));
    expect(mockAlerts.exceptions).toHaveLength(0);
    expect(subs()).toHaveLength(0);
  });

  it('MALFORMED CHECKOUT: a completed checkout that is neither ours nor a recognisable order is held, not treated as an external order', async () => {
    const r = await deliver({ id: 'evt_test_mc', eventType: 'checkout.completed', object: { object: 'checkout', id: 'ch_x' } });
    expect(r).toEqual(held('malformed_checkout'));
    expect(events()[0]).toMatchObject({ processed: false, error: 'UNRESOLVED:malformed_checkout' });
  });

  it('an event with no object at all is held rather than read as flat data', async () => {
    expect(await deliver({ id: 'evt_test_noobj', eventType: 'checkout.completed' })).toEqual(held('malformed_checkout'));
  });

  it.each([['refund.created'], ['dispute.created']])('%s is held for an owner decision and changes no access', async type => {
    await deliver(initial());
    mockDb.clearWrites();
    const r = await deliver({ id: `evt_test_${type}`, eventType: type, object: { object: 'refund', id: 're_test_1', order: { type: 'onetime' }, product: { billing_type: 'onetime' } } });
    expect(r).toEqual(held('refund_or_dispute'));
    expect(events().at(-1)).toMatchObject({ processed: false, error: 'UNRESOLVED:refund_or_dispute' });
    expect(mockDb.writesTo('profiles')).toHaveLength(0);
    expect(mockDb.writesTo('shop_subscriptions')).toHaveLength(0);
    expect(profile(USER_A).plan).toBe('solo');                                          // not revoked automatically either: a person decides
    expect(mockAlerts.failures.at(-1)?.[1]).toMatchObject({ reason: 'refund_or_dispute' });
  });

  it('UNHANDLED SUBSCRIPTION EVENTS (an update or upgrade) are held visibly, and the stored plan is unchanged', async () => {
    await deliver(initial());
    mockDb.clearWrites();
    // subscription.paused was in this list; it is now APPLIED under the approved rule paused -> suspended.
    for (const type of ['subscription.update', 'subscription.trialing', 'subscription.scheduled_cancel']) {
      const r = await deliver(renewal({ id: `evt_${type}`, type, metadata: meta({ plan_key: 'business', plan_id: 'business' }) }));
      expect(r).toEqual(held('unhandled_subscription_event'));
    }
    expect(mockDb.writesTo('profiles')).toHaveLength(0);
    expect(mockDb.writesTo('shop_subscriptions')).toHaveLength(0);
    expect(subs()[0].plan_key).toBe('solo');
    expect(events().filter(e => e.error === 'UNRESOLVED:unhandled_subscription_event')).toHaveLength(3);
  });

  it('an unknown event type is held', async () => {
    expect(await deliver({ id: 'evt_test_unknown', eventType: 'something.new', object: { object: 'thing' } })).toEqual(held('unknown_event_type'));
  });

  it('a held event is acknowledged with 200 every time, and a redelivery reuses its row: no retry storm, no pile of rows', async () => {
    const refund = { id: 'evt_test_refund_again', eventType: 'refund.created', object: { object: 'refund', id: 're_test_2' } };
    for (let i = 0; i < 4; i++) expect((await deliver(refund)).status).toBe(200);
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ processed: false, error: 'UNRESOLVED:refund_or_dispute' });
  });

  it('the one quiet class is a positively identified external one-time order: recorded processed, no alert', async () => {
    const r = await deliver(externalOrder());
    expect(r).toEqual({ status: 200, body: { received: true, classified: 'external_order' } });
    expect(events()[0]).toMatchObject({ processed: true, error: null });
    expect(mockAlerts.failures).toHaveLength(0);
  });

  it('a one-time order that carries Redlined1 metadata is NOT external: it is proven like any other event', async () => {
    const p = externalOrder('evt_test_ours_onetime') as { object: Record<string, unknown> };
    p.object.metadata = meta();
    const r = await deliver(p);
    expect(r.status).toBe(200);
    expect(subs()).toHaveLength(1);                                                       // applied only because the buyer and shop check out
  });

  it('no alert carries the payload, an email or a provider id of the customer', async () => {
    await deliver({ id: 'evt_test_refund_x', eventType: 'refund.created', object: { object: 'refund', customer: { id: 'cus_secret_1', email: 'someone@example.invalid' } } });
    expect(JSON.stringify(mockAlerts.failures)).not.toMatch(/cus_secret|example\.invalid|@|payload/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('out-of-order state: what IS protected, and what is NOT (needs a schema decision, see docs/billing-webhook-idempotency.md)', () => {
  const BIZ = () => meta({ plan_key: 'business', plan_id: 'business' });

  it('PROTECTED: a renewal whose product no longer matches the plan in its metadata is held, so it cannot revert an upgraded plan', async () => {
    process.env.CREEM_SOLO_MONTHLY_PRODUCT_ID = 'prod_test_solo';
    process.env.CREEM_BUSINESS_MONTHLY_PRODUCT_ID = 'prod_test_biz';
    const first = initial({ metadata: BIZ() }) as { object: Record<string, unknown> };
    first.object.product = { id: 'prod_test_biz', billing_type: 'recurring' };
    await deliver(first);                                                                 // shop is on business
    expect(subs()[0].plan_key).toBe('business');
    // the customer's subscription now bills the business product, but the metadata on it still says solo
    const stale = renewal({ id: 'evt_test_stale_meta' }) as { object: Record<string, unknown> };
    stale.object.product = { id: 'prod_test_biz', billing_type: 'recurring' };
    mockDb.clearWrites();
    const r = await deliver(stale);
    expect(r.body).toEqual({ received: true, unresolved: 'plan_conflict' });
    expect(subs()[0].plan_key).toBe('business');
    expect(profile(USER_A).plan).toBe('business');
    expect(mockDb.writesTo('profiles')).toHaveLength(0);
  });

  it('PROTECTED: the period never goes backward, even when the late event is applied in every other respect', async () => {
    await deliver(renewal({ id: 'evt_new', metadata: BIZ(), period: dates('2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z') }));
    await deliver(renewal({ id: 'evt_old', period: dates('2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z') }));
    expect(subs()[0].current_period_end).toBe('2026-12-01T00:00:00.000Z');
  });

  it('KNOWN LIMITATION (late activation after cancellation): an older activation that arrives after a cancellation reactivates the subscription', async () => {
    // Nothing in the schema says WHICH event is newer: billing_events.created_at is when WE received it and
    // shop_subscriptions.updated_at is when WE wrote it. A date-only rule was rejected on purpose. This pins today's
    // behaviour so a fix (a stored provider event time; see the docs) has to change this test knowingly.
    await deliver(initial({ id: 'evt_test_activation' }));
    await deliver(renewal({ id: 'evt_test_cancel', type: 'subscription.canceled' }));
    expect(subs()[0].status).toBe('cancelled');
    expect(profile(USER_A).billing_status).toBe('cancelled');
    await deliver(renewal({ id: 'evt_test_late_paid', type: 'subscription.paid', period: dates('2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z') }));
    expect(subs()[0].status).toBe('active');                                              // <- the hazard
    expect(profile(USER_A).billing_status).toBe('active');
    expect(subs()[0].current_period_end).toBe('2026-10-01T00:00:00.000Z');                // the period itself was protected
  });

  it('KNOWN LIMITATION (plan revert): an older event with consistent metadata for a lower plan reverts a higher stored plan', async () => {
    await deliver(initial({ id: 'evt_test_upgrade_state', metadata: BIZ() }));
    expect(subs()[0].plan_key).toBe('business');
    await deliver(renewal({ id: 'evt_test_old_solo', period: dates('2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z') }));   // solo, older
    expect(subs()[0].plan_key).toBe('solo');                                              // <- the hazard
    expect(profile(USER_A).plan).toBe('solo');
    expect(subs()[0].current_period_end).toBe('2026-10-01T00:00:00.000Z');                // the period itself was protected
  });

  it('the plan and status of an event are NOT decided by comparing its period to the stored one', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'api', 'billing', 'webhook', 'creem', 'route.ts'), 'utf8');
    const code = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    // the only comparison against a stored period is the conditional UPDATE inside advancePeriod, on the period columns
    expect(code.match(/\.(lt|lte|gt|gte)\(/g)).toEqual(['.lt(']);
    expect(code).not.toMatch(/period\.end\s*[<>]|[<>]=?\s*period\.end|getTime\(\)\s*[<>]/);
  });
});
