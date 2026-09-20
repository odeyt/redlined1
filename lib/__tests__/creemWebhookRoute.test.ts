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

  it('other event types (a refund, an unknown type) are recorded and acknowledged without a shop or an alert', async () => {
    const r = await deliver({ id: 'evt_test_refund', eventType: 'refund.created', object: { object: 'refund', id: 're_test_1' } });
    expect(r.body).toEqual({ received: true, classified: 'other' });
    expect(events()[0]).toMatchObject({ processed: true, error: null });
    expect(mockAlerts.failures).toHaveLength(0);
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
  const unresolvedRow = () => events().find(e => typeof e.error === 'string' && String(e.error).startsWith('UNRESOLVED_SHOP:'));

  it('is kept as an owner-visible unresolved event, acknowledged, and changes nothing', async () => {
    const r = await deliver(renewal({ metadata: null }));
    expect(r).toEqual({ status: 200, body: { received: true, unresolved: 'no_shop_metadata' } });
    expect(events()).toHaveLength(1);
    // The exact shape Billing Health counts as "failed": error set, not processed.
    expect(events()[0]).toMatchObject({ shop_id: null, processed: false, error: 'UNRESOLVED_SHOP:no_shop_metadata' });
    expect(subs()).toHaveLength(0);
    expect(mockDb.writesTo('profiles')).toHaveLength(0);   // no user identified, so no plan was granted to anyone
    expect(mockDb.writesTo('shop_subscriptions')).toHaveLength(0);
    expect(mockAlerts.failures).toHaveLength(1);
    expect(mockAlerts.failures[0][0]).toMatch(/cannot resolve a shop/);
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
    // Only the buyer that our own checkout identified has their own profile plan set; no shop record is touched.
    expect(mockDb.writesTo('profiles').every(w => w.values.plan === 'solo')).toBe(true);
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
      expect(events()[0]).toMatchObject({ processed: false, error: 'UNRESOLVED_SHOP:no_membership' });
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
      expect(String(events()[0].error)).not.toMatch(/^UNRESOLVED_SHOP:/);
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

    for (const [i, end] of [['past', '2001-01-01T00:00:00.000Z'], ['future', '2099-01-01T00:00:00.000Z']] as const) {
      await deliver(renewal({ id: `evt_test_${i}`, period: dates('2000-12-01T00:00:00.000Z', end) }));
      expect(subs()).toHaveLength(1);
      expect(subs()[0].current_period_end).toBe(end);   // the period DID move...
      expect({ plan: profile(USER_A).plan, status: profile(USER_A).billing_status, sub: subs()[0].status, access: getPlanStatus(String(profile(USER_A).plan), null) }).toEqual(before);   // ...and nothing else did
    }
  });

  it('a renewal writes a fixed, small set of fields; everything except the period repeats a value already stored', async () => {
    await deliver(initial());
    const before = { ...subs()[0] };
    mockDb.clearWrites();
    await deliver(renewal());
    const patch = mockDb.writesTo('shop_subscriptions', 'update')[0].values;
    expect(Object.keys(patch).sort()).toEqual(['current_period_end', 'current_period_start', 'plan_key', 'provider_customer_id', 'status', 'updated_at']);
    // plan, status and the customer id are re-stated with the SAME values, so only the display period actually moves
    expect(patch).toMatchObject({ plan_key: before.plan_key, status: before.status, provider_customer_id: before.provider_customer_id });
    expect(patch.current_period_end).not.toBe(before.current_period_end);
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
