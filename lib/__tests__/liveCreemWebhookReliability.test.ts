/**
 * POST /api/webhooks/creem — reliability. Real handler, real HMAC signature, real recordPaymentEvent /
 * syncSubscriptionFromProvider / markEventProcessed, and the real CreemPaymentProvider.getSubscription with only
 * `fetch` stubbed. Supabase is an in-memory stand-in carrying payment_events' real unique index.
 *
 * NOTE: this route is not reachable in production — proxy.ts does not list it in PUBLIC_PATHS, and Creem delivers to
 * app/api/billing/webhook/creem. These tests keep it correct for the day it is.
 *
 * What was wrong at 172f5a9, each pinned below:
 *   - syncSubscriptionFromProvider swallowed a failed subscription or profile write, and the route then marked the
 *     event processed: a write that never happened could never be retried.
 *   - recordPaymentEvent answered a failed INSERT with the same `false` as "already processed", so the route
 *     acknowledged a database failure as a duplicate.
 *   - markEventProcessed swallowed its own failure while the route answered 200.
 *   - every processing error was answered 200, so Creem never redelivered anything.
 *   - 'paused' mapped to 'unknown', and the sync wrote the paid plan for every status, so a paused subscription
 *     kept full access — and an incomplete one was granted it.
 *   - a subscription event with no id was looked up as "/subscriptions/" and would fail on every redelivery.
 *
 * Every id, product, date and secret here is synthetic.
 */
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { createInMemoryDb, type InMemoryDb } from '../billing/__tests__/inMemoryBillingDb';
import { getPlanStatus } from '../planGate';

let mockDb: InMemoryDb;
jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => mockDb.db }));

import { POST } from '../../app/api/webhooks/creem/route';

const SECRET = 'whsec_reliability_test_only';
const USER = 'user-1';
const BODY_SENTINEL = 'body-sentinel-value-7f3a';          // must never reach a log line or a response
const DATES = { current_period_start_date: '2026-09-01T00:00:00.000Z', current_period_end_date: '2026-10-01T00:00:00.000Z' };
const STORED = { current_period_start: '2026-08-01T00:00:00.000Z', current_period_end: '2026-09-01T00:00:00.000Z' };

const realFetch = global.fetch;
let providerAnswer: () => Promise<Response>;
let providerCalls: number;
let logs: string[];

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as unknown as Response);
const code = (status: number) => ({ ok: false, status, json: async () => ({}) } as unknown as Response);

/** A Creem subscription as getSubscription reads it. */
function providerSub(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_1', status: 'active', customer: { id: 'cus_1' }, product: 'prod_biz',
    metadata: { user_id: USER, plan_key: 'business' },
    ...DATES,
    ...over,
  };
}

beforeEach(() => {
  process.env.CREEM_WEBHOOK_SECRET = SECRET;
  process.env.PAYMENT_PROVIDER = 'creem';
  process.env.CREEM_API_KEY = 'creem_test_key_for_unit_tests';
  for (const k of Object.keys(process.env)) if (/^CREEM_.*_PRODUCT_ID$/.test(k)) delete process.env[k];
  process.env.CREEM_BUSINESS_MONTHLY_PRODUCT_ID = 'prod_biz';
  process.env.CREEM_SOLO_MONTHLY_PRODUCT_ID = 'prod_solo';

  mockDb = createInMemoryDb({ unique: { payment_events: ['provider', 'provider_event_id'] } });
  mockDb.seed('payment_events', []);
  mockDb.seed('subscriptions', []);
  mockDb.seed('profiles', [{ id: USER, plan: 'free', billing_status: 'inactive', trial_ends_at: null }]);

  providerCalls = 0;
  providerAnswer = async () => ok(providerSub());
  global.fetch = (async () => { providerCalls++; return providerAnswer(); }) as unknown as typeof fetch;

  logs = [];
  const capture = (...a: unknown[]) => { logs.push(a.map(x => (x instanceof Error ? x.message : String(x))).join(' ')); };
  jest.spyOn(console, 'error').mockImplementation(capture);
  jest.spyOn(console, 'warn').mockImplementation(capture);
});
afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks(); });

function checkout(id = 'evt_1', over: Record<string, unknown> = {}) {
  return {
    type: 'checkout.completed', id,
    data: {
      customer: { id: 'cus_1' }, subscription: { id: 'sub_1' }, product: 'prod_biz',
      metadata: { user_id: USER, plan_id: 'business' }, note: BODY_SENTINEL, ...DATES, ...over,
    },
  };
}
const subEvent = (type: string, id = `evt_${type}`, data: Record<string, unknown> = { id: 'sub_1' }) => ({ type, id, data });

async function deliver(payload: unknown, opts: { raw?: string; secret?: string } = {}) {
  const body = opts.raw ?? JSON.stringify(payload);
  const signature = createHmac('sha256', opts.secret ?? SECRET).update(body).digest('hex');
  const res = await POST(new NextRequest('http://localhost/api/webhooks/creem', {
    method: 'POST', body, headers: { 'creem-signature': signature },
  }));
  const text = await res.text();
  return { status: res.status, text, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
}

const events = () => mockDb.rows('payment_events');
const subs = () => mockDb.rows('subscriptions');
const profile = () => mockDb.rows('profiles').find(p => p.id === USER)!;
const subWrites = () => mockDb.writesTo('subscriptions', 'upsert');
const access = () => getPlanStatus(String(profile().plan), (profile().trial_ends_at as string | null) ?? null);

// ── A: a failed write is not marked processed ──────────────────────────────────────────────────────────────
describe('a failed write is never marked processed', () => {
  it('SUBSCRIPTION write fails: 500, event unprocessed; resend applies once; a further delivery is a duplicate', async () => {
    const e = checkout('evt_write');
    mockDb.failNext('subscriptions', 'upsert');

    const first = await deliver(e);
    expect(first.status).toBe(500);
    expect(events()).toHaveLength(1);
    expect(events()[0].processed).toBe(false);
    expect(subs()).toHaveLength(0);
    expect(profile().plan).toBe('free');

    const resend = await deliver(e);                      // the SAME signed event
    expect(resend.status).toBe(200);
    expect(events()).toHaveLength(1);                     // same row, reused
    expect(events()[0].processed).toBe(true);
    expect(events()[0].processed_at).toBeTruthy();        // payment_events has no error column; this IS its failure state
    expect(subWrites()).toHaveLength(1);                  // the subscription was written exactly once
    expect(profile().plan).toBe('business');

    const again = await deliver(e);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(subWrites()).toHaveLength(1);
  });

  it('ENTITLEMENT (profile) write fails: 500, unprocessed, and the resend grants access', async () => {
    const e = checkout('evt_profile');
    mockDb.failNext('profiles', 'update');

    expect((await deliver(e)).status).toBe(500);
    expect(events()[0].processed).toBe(false);
    expect(profile().plan).toBe('free');

    expect((await deliver(e)).status).toBe(200);
    expect(events()[0].processed).toBe(true);
    expect(profile().plan).toBe('business');
  });

  it('the event RECORD fails: 500, not "duplicate" — a database failure is not an acknowledgement', async () => {
    mockDb.failNext('payment_events', 'insert');
    const r = await deliver(checkout('evt_record'));
    expect(r.status).toBe(500);
    expect(r.body.duplicate).toBeUndefined();
    expect(subWrites()).toHaveLength(0);
  });

  it('the PROCESSED MARK fails: 500, so the redelivery repeats the idempotent write and marks it', async () => {
    const e = checkout('evt_mark');
    mockDb.failNext('payment_events', 'update');

    expect((await deliver(e)).status).toBe(500);
    expect(events()[0].processed).toBe(false);
    expect(profile().plan).toBe('business');              // the writes did happen

    expect((await deliver(e)).status).toBe(200);
    expect(events()[0].processed).toBe(true);
    expect(subs()).toHaveLength(1);                       // repeated upsert, still one row
  });

  it('a buyer with no profile is HELD (200, unprocessed): a retry cannot create one', async () => {
    mockDb.seed('profiles', []);
    const r = await deliver(checkout('evt_noprofile'));
    expect(r.status).toBe(200);
    expect(r.body.held).toBe(true);
    expect(events()[0].processed).toBe(false);
  });
});

// ── B: paused -> suspended, and back ────────────────────────────────────────────────────────────────────────
describe('paused removes paid access and keeps everything needed to resume', () => {
  const seedPaid = () => {
    mockDb.seed('profiles', [{ id: USER, plan: 'business', billing_status: 'active', trial_ends_at: null }]);
    mockDb.seed('subscriptions', [{
      id: 's1', user_id: USER, provider: 'creem', provider_customer_id: 'cus_1', provider_subscription_id: 'sub_1',
      plan_id: 'business', status: 'active', ...STORED,
    }]);
  };

  it('paused -> suspended: access REMOVED; plan, provider ids and period KEPT', async () => {
    seedPaid();
    expect(access()).toBe('pro');
    providerAnswer = async () => ok(providerSub({ status: 'paused', ...DATES }));

    const r = await deliver(subEvent('subscription.paused'));
    expect(r.status).toBe(200);
    expect(access()).toBe('free');
    expect(profile().billing_status).toBe('suspended');
    expect(subs()).toHaveLength(1);
    expect(subs()[0]).toMatchObject({
      status: 'suspended', plan_id: 'business',
      provider_customer_id: 'cus_1', provider_subscription_id: 'sub_1',
      current_period_start: DATES.current_period_start_date, current_period_end: DATES.current_period_end_date,
    });
  });

  it('a later ACTIVE state restores access, from the provider product — nothing fabricated', async () => {
    seedPaid();
    providerAnswer = async () => ok(providerSub({ status: 'paused' }));
    await deliver(subEvent('subscription.paused'));
    expect(access()).toBe('free');

    providerAnswer = async () => ok(providerSub({ status: 'active' }));
    const r = await deliver(subEvent('subscription.resumed'));
    expect(r.status).toBe(200);
    expect(access()).toBe('pro');
    expect(profile().plan).toBe('business');
    expect(profile().billing_status).toBe('active');
    expect(subs()[0]).toMatchObject({ status: 'active', plan_id: 'business', provider_subscription_id: 'sub_1' });
  });

  it('a pause whose response omits the period leaves the stored period intact, and invents none', async () => {
    seedPaid();
    providerAnswer = async () => ok(providerSub({
      status: 'paused', current_period_start_date: undefined, current_period_end_date: undefined,
    }));
    await deliver(subEvent('subscription.paused'));
    expect(subs()[0]).toMatchObject({ status: 'suspended', ...STORED });
  });

  it('a pause whose product cannot be proven is HELD: access is not changed on a guess', async () => {
    seedPaid();
    providerAnswer = async () => ok(providerSub({ status: 'paused', product: 'prod_unknown' }));
    const r = await deliver(subEvent('subscription.paused'));
    expect(r.status).toBe(200);
    expect(r.body.held).toBe(true);
    expect(access()).toBe('pro');
    expect(subs()[0].status).toBe('active');
  });

  it('an incomplete subscription does NOT grant access, and a cancellation does not demote it', async () => {
    providerAnswer = async () => ok(providerSub({ status: 'incomplete' }));
    await deliver(subEvent('subscription.updated', 'evt_incomplete'));
    expect(access()).toBe('free');

    seedPaid();
    providerAnswer = async () => ok(providerSub({ status: 'active' }));
    await deliver(subEvent('subscription.canceled', 'evt_cancel'));
    expect(profile().plan).toBe('business');              // standing policy: no demotion on cancellation
    expect(profile().billing_status).toBe('canceled');
  });
});

// ── D: the HTTP contract ────────────────────────────────────────────────────────────────────────────────────
describe('HTTP answers: non-2xx only where a redelivery can help', () => {
  it('401 for a bad signature — nothing recorded, the provider never asked', async () => {
    const r = await deliver(checkout(), { secret: 'not-the-secret' });
    expect(r.status).toBe(401);
    expect(events()).toHaveLength(0);
    expect(providerCalls).toBe(0);
  });

  it('400 for a body that is not an event, and the body is not logged', async () => {
    // A short body on purpose: V8 quotes it IN FULL in the parse error ('"LEAKME" is not valid JSON'), and the
    // route used to log that error. A long or brace-led body would be abbreviated or not quoted, and prove nothing.
    const r = await deliver(null, { raw: 'LEAKME' });
    expect(r.status).toBe(400);
    expect(events()).toHaveLength(0);
    expect(logs.join('\n')).not.toContain('LEAKME');
  });

  it('500 when the provider is unavailable; the redelivery applies once it recovers', async () => {
    providerAnswer = async () => code(503);
    const e = subEvent('subscription.updated', 'evt_503');
    expect((await deliver(e)).status).toBe(500);
    expect(events()[0].processed).toBe(false);

    providerAnswer = async () => ok(providerSub());
    expect((await deliver(e)).status).toBe(200);
    expect(events()[0].processed).toBe(true);
    expect(profile().plan).toBe('business');
  });

  it('200 held — not 500 forever — when the provider answers with data that cannot be applied', async () => {
    providerAnswer = async () => ok(providerSub({ metadata: {}, product: undefined }));
    const r = await deliver(subEvent('subscription.updated', 'evt_unusable'));
    expect(r.status).toBe(200);
    expect(r.body.held).toBe(true);
    expect(events()[0].processed).toBe(false);
  });

  it('200 held for a subscription event with no id, without calling the provider', async () => {
    const r = await deliver(subEvent('subscription.updated', 'evt_noid', {}));
    expect(r.status).toBe(200);
    expect(r.body.held).toBe(true);
    expect(providerCalls).toBe(0);
  });

  it('200 and marked processed for an event type this route does not act on', async () => {
    const r = await deliver(subEvent('invoice.paid', 'evt_invoice'));
    expect(r.status).toBe(200);
    expect(r.body.ignored).toBe(true);
    expect(events()[0].processed).toBe(true);
  });

  it('200 for a duplicate of an applied event, never non-2xx', async () => {
    const e = checkout('evt_dup');
    expect((await deliver(e)).status).toBe(200);
    const again = await deliver(e);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
  });

  it('no response and no log line carries the secret or the event body', async () => {
    mockDb.failNext('subscriptions', 'upsert');
    const failed = await deliver(checkout('evt_leak'));
    const held = await deliver(checkout('evt_leak2', { product: 'prod_unknown' }));
    const everything = [failed.text, held.text, ...logs].join('\n');
    expect(everything).not.toContain(SECRET);
    expect(everything).not.toContain(BODY_SENTINEL);
    expect(everything).not.toContain('evt_leak');         // event references are masked to their last 4
  });
});
