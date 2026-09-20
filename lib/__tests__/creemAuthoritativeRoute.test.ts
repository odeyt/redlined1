/**
 * Option B at the route: the real POST handler with BILLING_AUTHORITATIVE_STATE on, a signed request, an
 * in-memory database, and an injected provider. Nothing here reaches Creem or Supabase.
 *
 * These are the cases the event-derived path cannot get right, pinned as the reason the feature exists:
 * a late activation after a cancellation, a stale plan after a change, a resubscription, and what happens when
 * the provider is unreachable. In a separate file from creemWebhookRoute.test.ts so PR #37's suite is untouched.
 */
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { createInMemoryDb, type InMemoryDb } from '../billing/__tests__/inMemoryBillingDb';

let mockDb: InMemoryDb;
const mockAlerts = { failures: [] as Array<[string, Record<string, unknown>]>, exceptions: [] as unknown[][] };

jest.mock('@supabase/supabase-js', () => ({ createClient: () => mockDb.db }));
jest.mock('@/lib/observability/billingAlerts', () => ({
  alertBillingFailure: (m: string, c: Record<string, unknown>) => { mockAlerts.failures.push([m, c]); },
  alertBillingException: (...a: unknown[]) => { mockAlerts.exceptions.push(a); },
}));

import { POST } from '../../app/api/billing/webhook/creem/route';

const SECRET = 'whsec_option_b_test_only';
const SHOP = 'a1000000-0000-4000-8000-0000000000a1';
const USER = 'c1000000-0000-4000-8000-0000000000c1';
const SUB_1 = 'sub_test_one';
const SUB_2 = 'sub_test_two';

/** What the injected provider will answer on the next call. */
let providerAnswer: () => Promise<Response>;
let providerCalls: number;

const okBody = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as unknown as Response);
const httpCode = (status: number) => ({ ok: false, status, json: async () => ({}) } as unknown as Response);

function providerSubscription(over: Record<string, unknown> = {}) {
  return {
    id: SUB_1,
    status: 'active',
    customer: { id: 'cus_test_1' },
    metadata: { plan_key: 'solo', plan_id: 'solo', shop_id: SHOP, user_id: USER },
    current_period_start_date: '2026-09-01T00:00:00.000Z',
    current_period_end_date: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

/** An event carrying a subscription id — enough for the route to look the subscription up. */
function event(type: string, over: Record<string, unknown> = {}) {
  return {
    id: `evt_${Math.random().toString(36).slice(2, 10)}`,
    eventType: type,
    created_at: '2026-09-20T10:00:00.000Z',
    object: {
      id: 'obj_1',
      subscription: { id: SUB_1 },
      customer: { id: 'cus_test_1' },
      metadata: { plan_key: 'solo', plan_id: 'solo', shop_id: SHOP, user_id: USER },
      ...over,
    },
  };
}

async function deliver(payload: unknown) {
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', SECRET).update(body).digest('hex');
  const res = await POST(new NextRequest('http://localhost/api/billing/webhook/creem', {
    method: 'POST', body, headers: { 'creem-signature': signature },
  }));
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

const subs = () => mockDb.rows('shop_subscriptions');
const events = () => mockDb.rows('billing_events');
const profile = () => mockDb.rows('profiles').find(p => p.id === USER)!;

beforeEach(() => {
  process.env.CREEM_WEBHOOK_SECRET = SECRET;
  process.env.BILLING_AUTHORITATIVE_STATE = 'true';
  process.env.CREEM_API_KEY = 'creem_test_key_for_unit_tests';
  process.env.CREEM_BASE_URL = 'https://test-api.example/v1';
  for (const k of Object.keys(process.env)) if (/^CREEM_.*_PRODUCT_ID$/.test(k)) delete process.env[k];

  mockAlerts.failures.length = 0;
  mockAlerts.exceptions.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  mockDb = createInMemoryDb({
    // The SAME pair as docs/migrations/proposed/billing_events_provider_event_uniq.sql.
    unique: { billing_events: ['provider', 'provider_event_id'], shop_subscriptions: ['shop_id'] },
  });
  mockDb.seed('shops', [{ id: SHOP, name: 'Shop A' }]);
  mockDb.seed('shop_users', [{ shop_id: SHOP, user_id: USER, role: 'owner' }]);
  mockDb.seed('profiles', [{ id: USER, plan: 'free', trial_ends_at: null, billing_status: 'inactive' }]);
  mockDb.seed('shop_subscriptions', []);
  mockDb.seed('billing_events', []);

  providerCalls = 0;
  providerAnswer = async () => okBody(providerSubscription());
  global.fetch = (async () => { providerCalls++; return providerAnswer(); }) as unknown as typeof fetch;
});

afterEach(() => { jest.restoreAllMocks(); });

// ── the hazard Option B exists to remove ────────────────────────────────────────────────────────────────────
describe('out-of-order delivery', () => {
  it('a LATE ACTIVATION after a cancellation does not reactivate: the provider says cancelled', async () => {
    providerAnswer = async () => okBody(providerSubscription({ status: 'canceled' }));
    const r = await deliver(event('subscription.paid'));

    expect(r.status).toBe(200);
    expect(subs()[0].status).toBe('cancelled');
    expect(profile().billing_status).toBe('cancelled');
  });

  it('a STALE PLAN in an old event cannot downgrade: the provider names the current plan', async () => {
    providerAnswer = async () => okBody(providerSubscription({
      metadata: { plan_key: 'business', plan_id: 'business', shop_id: SHOP, user_id: USER },
    }));
    // The EVENT still says solo. Option B ignores it.
    const r = await deliver(event('subscription.paid'));

    expect(r.status).toBe(200);
    expect(subs()[0].plan_key).toBe('business');
    expect(profile().plan).toBe('business');
  });

  it('a cancellation that the provider has already superseded does not cancel', async () => {
    providerAnswer = async () => okBody(providerSubscription({ status: 'active' }));
    await deliver(event('subscription.canceled'));

    expect(subs()[0].status).toBe('active');
    expect(profile().billing_status).toBe('active');
  });

  it('the applied outcome does not depend on the ORDER the two events arrive in', async () => {
    providerAnswer = async () => okBody(providerSubscription({ status: 'canceled' }));
    await deliver(event('subscription.canceled'));
    await deliver(event('subscription.paid'));
    const afterOneOrder = subs()[0].status;

    // Same two events, opposite order, fresh database.
    mockDb.seed('shop_subscriptions', []);
    mockDb.seed('billing_events', []);
    await deliver(event('subscription.paid'));
    await deliver(event('subscription.canceled'));

    expect(subs()[0].status).toBe(afterOneOrder);
    expect(afterOneOrder).toBe('cancelled');
  });
});

describe('resubscription', () => {
  it('adopts the NEW subscription id the provider reports', async () => {
    providerAnswer = async () => okBody(providerSubscription());
    await deliver(event('subscription.paid'));
    expect(subs()[0].provider_subscription_id).toBe(SUB_1);

    providerAnswer = async () => okBody(providerSubscription({
      id: SUB_2, current_period_end_date: '2026-11-01T00:00:00.000Z',
    }));
    await deliver(event('subscription.paid', { subscription: { id: SUB_2 } }));

    expect(subs()).toHaveLength(1);
    expect(subs()[0].provider_subscription_id).toBe(SUB_2);
    expect(subs()[0].status).toBe('active');
  });

  it('MID-PERIOD CANCEL AND RESUBSCRIBE: SUB_2 is never paired with SUB_1 period or cancellation date', async () => {
    // 1. SUB_1 runs to 1 October.
    await deliver(event('subscription.paid'));
    const sub1End = subs()[0].current_period_end;
    expect(subs()[0].provider_subscription_id).toBe(SUB_1);

    // 2. Cancelled mid-period, on 10 September, per the provider's own canceled_at.
    providerAnswer = async () => okBody(providerSubscription({
      status: 'canceled', canceled_at: '2026-09-10T00:00:00.000Z',
    }));
    await deliver(event('subscription.canceled'));
    expect(subs()[0].status).toBe('cancelled');
    expect(subs()[0].cancelled_at).toBe('2026-09-10T00:00:00.000Z');

    // 3. Resubscribed the same day. SUB_2 ends 20 September — EARLIER than SUB_1's stored end, which is exactly
    //    the case a forward-only rule turns into an incoherent row.
    providerAnswer = async () => okBody(providerSubscription({
      id: SUB_2,
      status: 'active',
      canceled_at: null,
      current_period_start_date: '2026-09-10T00:00:00.000Z',
      current_period_end_date: '2026-09-20T00:00:00.000Z',
    }));
    await deliver(event('subscription.paid', { subscription: { id: SUB_2 } }));

    const row = subs()[0];
    expect(row.provider_subscription_id).toBe(SUB_2);
    expect(row.status).toBe('active');
    // The three assertions that fail if SUB_2 is wearing SUB_1 clothes.
    expect(row.current_period_end).not.toBe(sub1End);
    expect(row.current_period_end).toBe('2026-09-20T00:00:00.000Z');
    expect(row.cancelled_at).toBeNull();
  });

  it('the same subscription still may not move its period backward', async () => {
    await deliver(event('subscription.paid'));
    const storedEnd = subs()[0].current_period_end;

    // Same id, older period: a late or duplicated event for ONE subscription. Forward-only still applies.
    providerAnswer = async () => okBody(providerSubscription({ current_period_end_date: '2026-09-15T00:00:00.000Z' }));
    await deliver(event('subscription.paid'));

    expect(subs()[0].provider_subscription_id).toBe(SUB_1);
    expect(subs()[0].current_period_end).toBe(storedEnd);
  });
});

// ── duplicates and overlap ──────────────────────────────────────────────────────────────────────────────────
describe('duplicate and overlapping delivery', () => {
  it('a redelivery of a processed event is skipped and does NOT call the provider again', async () => {
    const e = event('subscription.paid');
    await deliver(e);
    const callsAfterFirst = providerCalls;

    const second = await deliver(e);
    expect(second.body.skipped).toBe('duplicate');
    expect(providerCalls).toBe(callsAfterFirst);
    expect(events()).toHaveLength(1);
  });

  it('two DIFFERENT events for one shop still leave a single subscription row', async () => {
    await deliver(event('subscription.paid'));
    await deliver(event('subscription.paid'));
    expect(subs()).toHaveLength(1);
  });

  it('Option B does not close the overlapping-insert hole — the unique index is what does', async () => {
    // With the constraints present, the racing insert loses with 23505 and is applied to the winner instead.
    const e1 = event('subscription.paid');
    const e2 = event('subscription.paid');
    await Promise.all([deliver(e1), deliver(e2)]);

    expect(subs()).toHaveLength(1);
    expect(events()).toHaveLength(2);
  });
});

// ── the provider is not answering ───────────────────────────────────────────────────────────────────────────
describe('Creem API failure', () => {
  it('FAILS CLOSED when the provider is unreachable: nothing is applied and Creem is asked to retry', async () => {
    providerAnswer = async () => { throw new Error('ECONNRESET'); };
    const r = await deliver(event('subscription.paid'));

    expect(r.status).toBe(500);
    expect(subs()).toHaveLength(0);
    expect(profile().plan).toBe('free');
    expect(profile().billing_status).toBe('inactive');
  });

  it('the retry reuses the same event row rather than adding a second', async () => {
    providerAnswer = async () => httpCode(503);
    const e = event('subscription.paid');
    await deliver(e);
    await deliver(e);
    expect(events()).toHaveLength(1);
    expect(events()[0].processed).toBe(false);
  });

  it('recovers on redelivery once the provider is healthy again', async () => {
    providerAnswer = async () => httpCode(503);
    const e = event('subscription.paid');
    expect((await deliver(e)).status).toBe(500);

    providerAnswer = async () => okBody(providerSubscription());
    const second = await deliver(e);

    expect(second.status).toBe(200);
    expect(events()).toHaveLength(1);
    expect(events()[0].processed).toBe(true);
    expect(subs()[0].status).toBe('active');
  });

  it('HOLDS (200, not 5xx) when the provider answers but the answer cannot be applied', async () => {
    providerAnswer = async () => okBody(providerSubscription({ status: 'incomplete' }));
    const r = await deliver(event('subscription.paid'));

    expect(r.status).toBe(200);
    expect(r.body.unresolved).toBe('provider_state_unusable');
    expect(subs()).toHaveLength(0);
    expect(profile().plan).toBe('free');
  });

  it('a 404 from the provider is held, not retried forever', async () => {
    providerAnswer = async () => httpCode(404);
    const r = await deliver(event('subscription.paid'));
    expect(r.status).toBe(200);
    expect(r.body.unresolved).toBe('provider_state_unusable');
  });
});

// ── events that name no subscription ────────────────────────────────────────────────────────────────────────
describe('an event with no subscription id', () => {
  const noSub = (type = 'checkout.completed') => {
    const e = event(type) as { object: Record<string, unknown> };
    delete e.object.subscription;
    return e;
  };

  it('A LEGITIMATE FIRST PURCHASE STILL ACTIVATES: no prior state exists for a stale event to undo', async () => {
    const r = await deliver(noSub());

    expect(r.status).toBe(200);
    expect(providerCalls).toBe(0);           // there is nothing to look up
    expect(subs()).toHaveLength(1);
    expect(subs()[0].status).toBe('active');
    expect(subs()[0].plan_key).toBe('solo');
    expect(profile().plan).toBe('solo');
    expect(profile().billing_status).toBe('active');
  });

  it('is reconciled against the shop stored subscription once one exists', async () => {
    await deliver(event('subscription.paid'));               // stores SUB_1
    providerAnswer = async () => okBody(providerSubscription({ status: 'canceled' }));

    const r = await deliver(noSub());

    expect(r.status).toBe(200);
    // The provider was asked about SUB_1 even though this event named nothing.
    expect(subs()[0].status).toBe('cancelled');
    expect(subs()[0].provider_subscription_id).toBe(SUB_1);
  });

  it('HOLDS with a recoverable reason when a row exists but nothing names a subscription', async () => {
    mockDb.seed('shop_subscriptions', [{
      id: 'row-1', shop_id: SHOP, plan_key: 'solo', status: 'active',
      provider_subscription_id: null, created_at: '2026-09-01T00:00:00.000Z',
    }]);

    const r = await deliver(noSub());

    expect(r.status).toBe(200);
    expect(r.body.unresolved).toBe('subscription_unidentified');
    expect(events()[0].processed).toBe(false);
  });

  it('that hold RECOVERS on redelivery once a later event has stored an id', async () => {
    mockDb.seed('shop_subscriptions', [{
      id: 'row-1', shop_id: SHOP, plan_key: 'solo', status: 'active',
      provider_subscription_id: null, created_at: '2026-09-01T00:00:00.000Z',
    }]);
    const e = noSub();
    expect((await deliver(e)).body.unresolved).toBe('subscription_unidentified');

    // A later event names the subscription, which is what the held one was missing.
    await deliver(event('subscription.paid'));

    const retry = await deliver(e);
    expect(retry.status).toBe(200);
    expect(retry.body.unresolved).toBeUndefined();
    expect(events().filter(r => r.processed === false)).toHaveLength(0);
  });

  it('a cancellation naming no subscription, for a shop with none, is held rather than applied', async () => {
    const r = await deliver(noSub('subscription.canceled'));

    expect(r.body.unresolved).toBe('subscription_unidentified');
    expect(subs()).toHaveLength(0);
  });
});

// ── deduplication keyed the way the index is ────────────────────────────────────────────────────────────────
describe('deduplication on (provider, provider_event_id)', () => {
  it('a redelivery is recognised against a database that ENFORCES the proposed index', async () => {
    const e = event('subscription.paid');
    await deliver(e);
    const second = await deliver(e);

    expect(second.body.skipped).toBe('duplicate');
    expect(events()).toHaveLength(1);
  });

  it('CONCURRENT delivery of one event inserts exactly one row when the index is enforced', async () => {
    const e = event('subscription.paid');
    // Force both requests to finish their idempotency read before either inserts: the read-then-insert race.
    mockDb.barrier('billing_events', 'select', 2);

    const [a, b] = await Promise.all([deliver(e), deliver(e)]);

    expect(events()).toHaveLength(1);
    expect(subs()).toHaveLength(1);
    expect([a.status, b.status].sort()).toEqual([200, 200]);
  });

  it('an event id reused by a DIFFERENT provider is not treated as a creem duplicate', async () => {
    const e = event('subscription.paid');
    await deliver(e);
    const id = String(events()[0].provider_event_id);

    mockDb.rows('billing_events').push({
      id: 'other-1', provider: 'stripe', provider_event_id: id,
      event_type: 'x', processed: true, created_at: '2026-09-01T00:00:00.000Z',
    });

    expect(events().filter(r => r.provider === 'creem')).toHaveLength(1);
  });
});

// ── the flag ────────────────────────────────────────────────────────────────────────────────────────────────
describe('with the flag off', () => {
  it('never calls the provider and applies the event as before', async () => {
    process.env.BILLING_AUTHORITATIVE_STATE = 'false';
    providerAnswer = async () => okBody(providerSubscription({ status: 'canceled' }));

    const r = await deliver(event('subscription.paid'));

    expect(providerCalls).toBe(0);
    expect(r.status).toBe(200);
    // The EVENT said paid, and with Option B off the event is what decides.
    expect(subs()[0].status).toBe('active');
  });
});
