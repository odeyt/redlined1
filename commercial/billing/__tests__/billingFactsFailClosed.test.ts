/**
 * The commercial billing path — creemProvider.handleWebhook -> processWebhook -> subscriptionService — driven
 * end to end against an in-memory database, with no provider fact ever defaulted.
 *
 * Removed, each pinned below:
 *   creemProvider.handleWebhook   planKey: meta.plan_key ?? 'professional'
 *                                 currentPeriodStart: ... : new Date()
 *                                 currentPeriodEnd:   ... : new Date(Date.now() + 30 * 86400000)
 *   processWebhook                planKey: update.planKey ?? 'professional'
 *                                 periodStart: ?? new Date()   periodEnd: ?? new Date(Date.now() + 30 * 86400000)
 * and, found on the same path: an activation missing its ids fell through to "set status active"; a failed
 * activation write was marked processed; a retry inserted a second event row; an event naming no shop was
 * dropped and marked processed.
 *
 * Real subscriptionService writes; only Supabase is replaced. Every id, product and date is synthetic.
 */
import { createInMemoryDb, type InMemoryDb } from '@/lib/billing/__tests__/inMemoryBillingDb';

let mockDb: InMemoryDb;
jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => mockDb.db }));

import { processWebhook } from '@/commercial/billing/billingService';

const SHOP = 'shop-a';
const DATES = { current_period_start_date: '2026-09-01T00:00:00.000Z', current_period_end_date: '2026-10-01T00:00:00.000Z' };
const STORED = { current_period_start: '2026-08-01T00:00:00.000Z', current_period_end: '2026-09-01T00:00:00.000Z' };

const PRODUCTS = {
  CREEM_STARTER_MONTHLY_PRODUCT_ID:      'prod_starter',
  CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID: 'prod_pro',
  CREEM_BUSINESS_MONTHLY_PRODUCT_ID:     'prod_biz',
  CREEM_SOLO_MONTHLY_PRODUCT_ID:         'prod_solo',
};

function clearProducts() {
  for (const k of Object.keys(process.env)) if (/^CREEM_.*_PRODUCT_ID$/.test(k)) delete process.env[k];
}

beforeEach(() => {
  delete process.env.CREEM_WEBHOOK_SECRET;        // the commercial handler skips its signature check without one
  clearProducts();
  Object.assign(process.env, PRODUCTS);
  mockDb = createInMemoryDb({ unique: { billing_events: ['provider', 'provider_event_id'], shop_subscriptions: ['shop_id'] } });
  mockDb.seed('shop_subscriptions', []);
  mockDb.seed('billing_events', []);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

type Opt<T> = T | null;   // null = omit the field entirely
function checkout(o: {
  id?: string; product?: Opt<string>; plan_key?: Opt<string>; period?: Opt<Record<string, string>>;
  ids?: 'both' | 'nested' | 'none'; shop?: Opt<string>;
} = {}) {
  const ids = o.ids ?? 'both';
  const data: Record<string, unknown> = {
    metadata: {
      ...(o.shop === null ? {} : { shop_id: o.shop ?? SHOP }),
      ...(o.plan_key === null ? {} : { plan_key: o.plan_key ?? 'professional' }),
    },
    ...(o.period === null ? {} : (o.period ?? DATES)),
  };
  if (o.product !== null) data.product = o.product ?? 'prod_pro';
  // 'both' also carries the flat ids the previous implementation read, so an old-code run reaches the activation
  // write and the comparison is about the plan and the period rather than about id shapes.
  if (ids !== 'none') { data.customer = { id: 'cus_1' }; data.subscription = { id: 'sub_1' }; }
  if (ids === 'both') { data.customer_id = 'cus_1'; data.subscription_id = 'sub_1'; }
  return { type: 'checkout.completed', id: o.id ?? 'evt_1', data };
}

function updated(status: unknown, o: { id?: string; shop?: Opt<string> } = {}) {
  const data: Record<string, unknown> = { id: 'sub_1', metadata: o.shop === null ? {} : { shop_id: o.shop ?? SHOP } };
  if (status !== undefined) data.status = status;
  return { type: 'subscription.updated', id: o.id ?? 'evt_u1', data };
}

const deliver = (e: unknown) => processWebhook(JSON.stringify(e), '', 'creem');
const row = () => mockDb.rows('shop_subscriptions').find(r => r.shop_id === SHOP);
const events = () => mockDb.rows('billing_events');
const activations = () => mockDb.writesTo('shop_subscriptions', 'upsert');
const seedActive = (over: Record<string, unknown> = {}) => mockDb.seed('shop_subscriptions', [{
  id: 'sub-row', shop_id: SHOP, plan_key: 'business', status: 'active', billing_provider: 'creem',
  provider_customer_id: 'cus_1', provider_subscription_id: 'sub_1', ...STORED, ...over,
}]);

/** The event failed: recorded, unprocessed, with a reason — and nothing was granted. */
function expectHeld(result: { success: boolean; error?: string }, reason: RegExp) {
  expect(result.success).toBe(false);
  expect(result.error).toMatch(reason);
  expect(events()).toHaveLength(1);
  expect(events()[0].processed).toBe(false);
  expect(String(events()[0].error)).toMatch(reason);
}

// ── plans ───────────────────────────────────────────────────────────────────────────────────────────────────
describe('a missing, empty or unknown plan never becomes professional', () => {
  it.each([
    ['no product and no plan',      { product: null, plan_key: null }],
    ['no product, a plan named',    { product: null }],
    ['no product, an empty plan',   { product: null, plan_key: '' }],
    ['no product, an unknown plan', { product: null, plan_key: 'unicorn' }],
  ])('%s: refused, nothing written', async (_label, o) => {
    const r = await deliver(checkout(o as Parameters<typeof checkout>[0]));
    expectHeld(r, /activation refused: the provider data names no product/);
    expect(row()).toBeUndefined();
    expect(activations()).toHaveLength(0);
  });
});

describe('the product decides the plan', () => {
  it('an UNKNOWN product fails closed, even with a valid plan in the metadata', async () => {
    const r = await deliver(checkout({ product: 'prod_unknown', plan_key: 'professional' }));
    expectHeld(r, /not a plan this integration sells/);
    expect(row()).toBeUndefined();
  });

  it('a solo product is refused: solo is not a plan this commercial layer activates', async () => {
    const r = await deliver(checkout({ product: 'prod_solo', plan_key: 'solo' }));
    expectHeld(r, /not a plan this integration sells/);
  });

  it('a product and metadata that disagree are refused rather than reconciled', async () => {
    const r = await deliver(checkout({ product: 'prod_biz', plan_key: 'professional' }));
    expectHeld(r, /disagrees with the product/);
  });

  it('a valid mapped product and the provider dates apply', async () => {
    const r = await deliver(checkout({ product: 'prod_biz', plan_key: 'business' }));
    expect(r.success).toBe(true);
    expect(row()).toMatchObject({
      plan_key: 'business', status: 'active',
      provider_customer_id: 'cus_1', provider_subscription_id: 'sub_1',
      current_period_start: DATES.current_period_start_date,
      current_period_end:   DATES.current_period_end_date,
    });
    expect(events()[0].processed).toBe(true);
    expect(events()[0].error).toBeNull();
  });

  it('ids given only as nested objects are read, not turned into ""', async () => {
    const r = await deliver(checkout({ product: 'prod_biz', plan_key: 'business', ids: 'nested' }));
    expect(r.success).toBe(true);
    expect(row()).toMatchObject({ provider_customer_id: 'cus_1', provider_subscription_id: 'sub_1' });
  });

  it('CONTROL: with no product mapping configured at all, validated metadata is the plan', async () => {
    clearProducts();
    const r = await deliver(checkout({ product: null, plan_key: 'business' }));
    expect(r.success).toBe(true);
    expect(row()?.plan_key).toBe('business');
  });
});

// ── periods ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('a billing period is never invented', () => {
  it('an activation with no period is applied with the period UNKNOWN — not now, not now + 30 days', async () => {
    const r = await deliver(checkout({ product: 'prod_biz', plan_key: 'business', period: null }));
    expect(r.success).toBe(true);
    expect(row()?.plan_key).toBe('business');
    expect(row()?.current_period_start).toBeUndefined();
    expect(row()?.current_period_end).toBeUndefined();
  });

  it('the legacy period names Creem does not send are not read', async () => {
    const r = await deliver(checkout({
      product: 'prod_biz', plan_key: 'business',
      period: { current_period_start: '2026-09-01T00:00:00.000Z', current_period_end: '2026-10-01T00:00:00.000Z' },
    }));
    expect(r.success).toBe(true);
    expect(row()?.current_period_end).toBeUndefined();
  });
});

// ── the event stays visible, and a retry applies it once ────────────────────────────────────────────────────
describe('an invalid event stays unprocessed, and a retry applies it exactly once', () => {
  it('fails, then succeeds once the missing fact is configured, then is skipped', async () => {
    const e = checkout({ id: 'evt_retry', product: 'prod_new', plan_key: 'professional' });

    expectHeld(await deliver(e), /not a plan this integration sells/);

    // The missing fact becomes available: the product is added to the mapping.
    process.env.CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID = 'prod_new';

    const second = await deliver(e);
    expect(second.success).toBe(true);
    expect(events()).toHaveLength(1);                 // the failed row was REUSED, not duplicated
    expect(events()[0].processed).toBe(true);
    expect(events()[0].error).toBeNull();             // the old reason is cleared once it applies
    expect(row()?.plan_key).toBe('professional');
    expect(activations()).toHaveLength(1);

    const third = await deliver(e);
    expect(third.success).toBe(true);
    expect(events()).toHaveLength(1);
    expect(activations()).toHaveLength(1);            // applied exactly once
  });

  it('a failed activation WRITE keeps the event retryable instead of marking it done', async () => {
    const e = checkout({ id: 'evt_write', product: 'prod_biz', plan_key: 'business' });
    mockDb.failNext('shop_subscriptions', 'upsert');

    expectHeld(await deliver(e), /activation write failed/);
    expect(row()).toBeUndefined();

    const retry = await deliver(e);
    expect(retry.success).toBe(true);
    expect(events()).toHaveLength(1);
    expect(row()?.plan_key).toBe('business');
  });

  it('a subscription event naming no shop is kept, not dropped and marked processed', async () => {
    const r = await deliver(updated('past_due', { shop: null }));
    expectHeld(r, /names no shop/);
  });
});

// ── what an update may and may not change ───────────────────────────────────────────────────────────────────
describe('existing data is not erased, and stale data is not proof of a new entitlement', () => {
  it('an activation that omits its period leaves the stored period intact', async () => {
    seedActive();
    const r = await deliver(checkout({ product: 'prod_biz', plan_key: 'business', period: null }));
    expect(r.success).toBe(true);
    expect(row()).toMatchObject({ plan_key: 'business', ...STORED });
  });

  it('a status change touches status only — never the plan, the ids or the period', async () => {
    seedActive();
    const r = await deliver(updated('past_due'));
    expect(r.success).toBe(true);
    expect(row()).toMatchObject({
      status: 'past_due', plan_key: 'business',
      provider_customer_id: 'cus_1', provider_subscription_id: 'sub_1', ...STORED,
    });
  });

  it('STALE DATA IS NOT PROOF: an activation lacking plan facts is refused even though the shop already has a plan', async () => {
    // The shop's stored 'business' plan says nothing about what THIS event bought. Using it would turn an event
    // that names no plan into a confirmed grant.
    seedActive();
    const r = await deliver(checkout({ product: null, plan_key: null }));
    expectHeld(r, /names no product/);
    expect(row()).toMatchObject({ plan_key: 'business', status: 'active', ...STORED });
  });

  it('an activation MISSING its provider ids does not fall through to "set status active"', async () => {
    seedActive({ status: 'suspended' });
    const r = await deliver(checkout({ product: 'prod_biz', plan_key: 'business', ids: 'none' }));
    expectHeld(r, /no provider customer id or no provider subscription id/);
    expect(row()?.status).toBe('suspended');
  });
});

// ── decision 1: paused -> suspended, and back ───────────────────────────────────────────────────────────────
describe('paused is a temporary loss of entitlement, and resuming restores it', () => {
  it('paused -> suspended, then active -> active, with plan, ids and period untouched throughout', async () => {
    seedActive();
    const kept = { plan_key: 'business', provider_customer_id: 'cus_1', provider_subscription_id: 'sub_1', ...STORED };

    expect((await deliver(updated('paused', { id: 'evt_pause' }))).success).toBe(true);
    expect(row()).toMatchObject({ status: 'suspended', ...kept });

    expect((await deliver(updated('active', { id: 'evt_resume' }))).success).toBe(true);
    expect(row()).toMatchObject({ status: 'active', ...kept });
  });

  it('suspended counts as NOT active for entitlement; active again after resuming', async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = 'true';
    try {
      // Loaded fresh so it reads NEXT_PUBLIC_BILLING_ENABLED as set above. The Supabase mock survives the reset.
      jest.resetModules();
      const { isSubscriptionActive } = await import('@/commercial/subscriptions/subscriptionService');
      seedActive({ status: 'suspended' });
      expect(await isSubscriptionActive(SHOP)).toBe(false);
      seedActive({ status: 'active' });
      expect(await isSubscriptionActive(SHOP)).toBe(true);
    } finally {
      delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
    }
  });
});
