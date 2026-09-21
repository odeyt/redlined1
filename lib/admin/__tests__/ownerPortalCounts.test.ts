/**
 * Owner-portal counting, classification, reconciliation and response-privacy
 * rules, run against an in-memory database (see fakeAdminDb.ts). Every id,
 * email and provider reference below is synthetic.
 */
import {
  listAccounts, getOwnerOverview, getAccountDetail, getBillingReconciliation, getCommercialOverview, sanitizeArchiveFilter,
} from '../accountsData';
import { getRevenueMetrics, getSubscriptionSummary, withCanonicalPastDue } from '@/commercial/analytics/BillingAnalyticsService';
import { PLAN_MONTHLY_PRICE } from '@/commercial/analytics/pricing';
import { createFakeAdminDb, type Row } from './fakeAdminDb';

const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const NOW = new Date().toISOString();

const S = {
  activePaid:      'a1000000-0000-4000-8000-000000000001',
  trial:           'a2000000-0000-4000-8000-000000000002',
  free:            'a3000000-0000-4000-8000-000000000003',
  lapsedTrial:     'a4000000-0000-4000-8000-000000000004',
  archivedFree:    'a5000000-0000-4000-8000-000000000005',
  archivedPaidNoSub: 'a6000000-0000-4000-8000-000000000006',
  internalA:       'a7000000-0000-4000-8000-000000000007',
  internalArchived: 'a8000000-0000-4000-8000-000000000008',
  paidNoSub:       'a9000000-0000-4000-8000-000000000009',
  freeActiveSub:   'b1000000-0000-4000-8000-000000000010',
  eventsNoSub:     'b2000000-0000-4000-8000-000000000011',
  conflict:        'b3000000-0000-4000-8000-000000000012',
};
const U = (n: number) => `c${String(n).padStart(7, '0')}-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

const PROVIDER_SUB = 'sub_TESTONLY-Zq7K';
const PROVIDER_CUS = 'cus_TESTONLY-Xp3M';

function shop(id: string, name: string, archived = false): Row {
  return { id, name, created_at: NOW, archived_at: archived ? NOW : null };
}
function ownerProfile(n: number, shopId: string, plan: string | null, trialEndsAt: string | null, billingStatus: string | null, email = `owner${n}@example-test.invalid`): Row {
  return { id: U(n), email, role: 'Owner', plan, trial_ends_at: trialEndsAt, shop_name: null, shop_id: shopId, billing_status: billingStatus };
}
function owner(n: number, shopId: string): Row {
  return { shop_id: shopId, user_id: U(n), role: 'owner' };
}
function sub(shopId: string, status: string, planKey = 'professional'): Row {
  return {
    shop_id: shopId, status, plan_key: planKey, billing_provider: 'creem',
    provider_customer_id: PROVIDER_CUS, provider_subscription_id: PROVIDER_SUB,
    trial_start: null, trial_end: null, current_period_start: NOW, current_period_end: iso(30),
    cancel_at_period_end: false, cancelled_at: null, past_due_at: null, created_at: NOW,
  };
}

const fake = createFakeAdminDb();

function resetDb() {
  fake.state.failTables.clear();
  fake.state.selects.length = 0;
  fake.state.tables = {
    shops: [
      shop(S.activePaid, 'Active Paid Co'), shop(S.trial, 'Trial Co'), shop(S.free, 'Free Co'),
      shop(S.lapsedTrial, 'Lapsed Trial Co'), shop(S.archivedFree, 'Archived Free Co', true),
      shop(S.archivedPaidNoSub, 'Archived Paid No Sub Co', true), shop(S.internalA, 'Internal A'),
      shop(S.internalArchived, 'Internal Archived', true), shop(S.paidNoSub, 'Paid No Sub Co'),
      shop(S.freeActiveSub, 'Free With Active Sub Co'), shop(S.eventsNoSub, 'Events No Sub Co'),
      shop(S.conflict, 'Conflict Co'),
    ],
    shop_users: [
      owner(1, S.activePaid), owner(2, S.trial), owner(3, S.free), owner(4, S.lapsedTrial), owner(5, S.archivedFree),
      owner(6, S.archivedPaidNoSub), owner(7, S.internalA), owner(8, S.internalArchived), owner(9, S.paidNoSub),
      owner(10, S.freeActiveSub), owner(11, S.eventsNoSub), owner(12, S.conflict),
      // staff whose legacy profiles.shop_id is null but who DO have a membership
      { shop_id: S.activePaid, user_id: U(14), role: 'staff' },
    ],
    profiles: [
      ownerProfile(1, S.activePaid, 'professional', null, 'active'),
      ownerProfile(2, S.trial, 'trial', iso(5), 'inactive'),
      ownerProfile(3, S.free, 'free', null, 'inactive'),
      ownerProfile(4, S.lapsedTrial, 'trial', iso(-10), 'inactive'),
      ownerProfile(5, S.archivedFree, 'free', null, 'inactive'),
      // an internal-looking email/name/plan must NOT make a shop internal
      ownerProfile(6, S.archivedPaidNoSub, 'pro', null, 'inactive', 'admin@internal.example'),
      ownerProfile(7, S.internalA, 'pro', null, 'inactive'),
      ownerProfile(8, S.internalArchived, 'pro', null, 'inactive'),
      ownerProfile(9, S.paidNoSub, 'solo', null, 'inactive'),
      ownerProfile(10, S.freeActiveSub, 'free', null, 'inactive'),
      ownerProfile(11, S.eventsNoSub, 'free', null, 'inactive'),
      ownerProfile(12, S.conflict, 'professional', null, 'past_due'),
      // membership metric: null legacy pointer + real membership => NOT "without membership"
      { id: U(14), email: 'staff@example-test.invalid', role: 'Advisor', plan: 'free', trial_ends_at: null, shop_name: null, shop_id: null, billing_status: 'inactive' },
      // legacy pointer set but NO shop_users row => without membership
      { id: U(15), email: 'pointer-only@example-test.invalid', role: 'Advisor', plan: 'free', trial_ends_at: null, shop_name: null, shop_id: S.free, billing_status: 'inactive' },
      // neither pointer nor membership => without membership
      { id: U(16), email: 'nowhere@example-test.invalid', role: 'Advisor', plan: 'free', trial_ends_at: null, shop_name: null, shop_id: null, billing_status: 'inactive' },
    ],
    shop_subscriptions: [sub(S.activePaid, 'active'), sub(S.freeActiveSub, 'active'), sub(S.conflict, 'active')],
    shop_mirrors: [],
    billing_events: [
      { id: 'e1', shop_id: S.activePaid, event_type: 'subscription.paid', processed: true, processed_at: NOW, error: null, created_at: NOW, payload: { secret: 'whsec_TESTONLYSECRET' } },
      { id: 'e2', shop_id: S.activePaid, event_type: 'subscription.update', processed: false, processed_at: null, error: 'boom sig=whsec_TESTONLY2', created_at: NOW, payload: { token: 'tok_TESTONLY' } },
      { id: 'e3', shop_id: S.eventsNoSub, event_type: 'checkout.completed', processed: true, processed_at: NOW, error: null, created_at: NOW },
      { id: 'e4', shop_id: S.eventsNoSub, event_type: 'checkout.completed', processed: true, processed_at: NOW, error: null, created_at: NOW },
    ],
    support_tickets: [],
  };
}

jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => fake.db }));
jest.mock('@/lib/adminAuth', () => ({
  getInternalShopIds: () => new Set(['a7000000-0000-4000-8000-000000000007', 'a8000000-0000-4000-8000-000000000008']),
}));
jest.mock('@/commercial/usage/usageService', () => ({ getMonthlyUsage: async () => ({ usage: {} }) }));

beforeEach(resetDb);

describe('Owner overview counts', () => {
  it('splits every shop into active external, archived external and internal — nothing counted twice or dropped', async () => {
    const o = await getOwnerOverview();
    expect(o.totalShops).toBe(12);
    expect(o.activeExternalShops).toBe(8);
    expect(o.archivedExternalShops).toBe(2);
    expect(o.internalShops).toBe(2);
    expect(o.activeExternalShops + o.archivedExternalShops + o.internalShops).toBe(o.totalShops);
  });

  it('gives each shop exactly one primary status, so the visible status tiles sum to their documented total', async () => {
    const o = await getOwnerOverview();
    const sum = (c: object) => Object.values(c as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(sum(o.active)).toBe(o.activeExternalShops);
    expect(sum(o.archived)).toBe(o.archivedExternalShops);

    const all = await listAccounts({ pageSize: 100 });
    expect(all.total).toBe(o.totalShops);
    expect(new Set(all.items.map(i => i.id)).size).toBe(all.items.length);
  });

  it('reports active and archived external shops separately, with the per-status figures we expect', async () => {
    const o = await getOwnerOverview();
    expect(o.active).toEqual({
      free: 3, trialing: 1, activePaid: 1, cancelScheduled: 0, pastDue: 0, cancelledAccessRetained: 0,
      expired: 0, paidUnverified: 1, billingMismatch: 2,
    });
    expect(o.archived).toEqual({
      free: 1, trialing: 0, activePaid: 0, cancelScheduled: 0, pastDue: 0, cancelledAccessRetained: 0,
      expired: 0, paidUnverified: 1, billingMismatch: 0,
    });
  });

  it('counts internal shops separately, including an archived one, and never inside the external totals', async () => {
    const o = await getOwnerOverview();
    expect(o.internalShops).toBe(2);
    expect(o.archivedExternalShops).toBe(2); // the archived INTERNAL shop is not in here
  });

  it('never labels paid access without a subscription row as "active paid"', async () => {
    const o = await getOwnerOverview();
    expect(o.active.activePaid).toBe(1); // only the shop whose records agree; the two others with an active row contradict their profile
    expect(o.active.paidUnverified).toBe(1);
    expect(o.active.billingMismatch).toBe(2);
    const all = await listAccounts({ pageSize: 100 });
    expect(all.items.find(i => i.id === S.paidNoSub)!.status).toBe('paid_unverified');
  });

  it('does not infer a shop is internal from an email, name, plan or missing subscription', async () => {
    const all = await listAccounts({ pageSize: 100 });
    const byId = (id: string) => all.items.find(i => i.id === id)!;
    expect(byId(S.archivedPaidNoSub).status).toBe('paid_unverified'); // internal-looking email, pro plan, no subscription
    expect(byId(S.paidNoSub).status).not.toBe('internal');
    expect(all.items.filter(i => i.status === 'internal').map(i => i.id).sort()).toEqual([S.internalA, S.internalArchived].sort());
  });

  it('"Signups today" starts at 00:00 UTC whatever timezone the host runs in', async () => {
    const before = (await getOwnerOverview()).signupsToday;
    const startOfUtcDay = new Date(); startOfUtcDay.setUTCHours(0, 0, 0, 0);
    fake.state.tables.shops.push(shop('b4000000-0000-4000-8000-000000000099', 'Midnight UTC Co', false));
    fake.state.tables.shops[fake.state.tables.shops.length - 1].created_at = startOfUtcDay.toISOString();
    const original = process.env.TZ;
    try {
      // Behind UTC, local midnight falls after this shop was created (07:00-08:00 UTC for Los Angeles),
      // so a figure built on local midnight would miss it. Two zones so that no hour of the UTC day slips through.
      for (const tz of ['America/Los_Angeles', 'Etc/GMT+1', 'Asia/Vientiane']) {
        process.env.TZ = tz;
        expect((await getOwnerOverview()).signupsToday).toBe(before + 1);
      }
    } finally {
      if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    }
  });

  it('headline signup figures and recent signups cover active external shops only', async () => {
    const o = await getOwnerOverview();
    expect(o.signupsToday).toBe(8);
    expect(o.signupsLast7Days).toBe(8);
    expect(o.signupsLast30Days).toBe(8);
    const ids = o.recentSignups.map(r => r.id);
    expect(ids).toHaveLength(8);
    for (const excluded of [S.archivedFree, S.archivedPaidNoSub, S.internalA, S.internalArchived]) expect(ids).not.toContain(excluded);
  });

  it('counts trials ending soon among active trial-access shops only', async () => {
    const o = await getOwnerOverview();
    expect(o.trialEndingIn7Days).toBe(1);
    expect(o.trialEndingIn3Days).toBe(0);
  });

  it('reports billing mismatches for active and archived shops separately', async () => {
    const o = await getOwnerOverview();
    expect(o.billingReviewActive).toBe(3); // unverified paid access, free+active sub, status conflict
    expect(o.billingReviewArchived).toBe(1);
  });
});

describe('Expired trials', () => {
  it('resolve to Free but carry their historical trial state', async () => {
    const all = await listAccounts({ pageSize: 100 });
    const lapsed = all.items.find(i => i.id === S.lapsedTrial)!;
    expect(lapsed.status).toBe('free');
    expect(lapsed.trialExpired).toBe(true);
    expect(all.items.find(i => i.id === S.trial)!.trialExpired).toBe(false);
    expect(all.items.find(i => i.id === S.free)!.trialExpired).toBe(false);
    expect(all.items.find(i => i.id === S.trial)!.status).toBe('trialing');
  });

  it('are reported on the account-detail plan too, without changing its status', async () => {
    const d = (await getAccountDetail(S.lapsedTrial))!;
    expect(d.plan.trialExpired).toBe(true);
    expect(d.status.status).toBe('free');
  });

  it('is never written back: the read path issues no profile updates', async () => {
    await listAccounts({ pageSize: 100 });
    await getOwnerOverview();
    const writes = fake.state.selects.filter(s => /^(insert|update|upsert|delete)$/i.test(s.table));
    expect(writes).toEqual([]);
    expect(fake.db.from('profiles')).not.toHaveProperty('update');
    expect(fake.db.from('profiles')).not.toHaveProperty('insert');
  });
});

describe('Archive filter', () => {
  it('sanitises to a known value', () => {
    expect(sanitizeArchiveFilter('active')).toBe('active');
    expect(sanitizeArchiveFilter('archived')).toBe('archived');
    expect(sanitizeArchiveFilter('internal')).toBe('internal');
    expect(sanitizeArchiveFilter('bogus')).toBe('all');
    expect(sanitizeArchiveFilter(undefined)).toBe('all');
  });

  it('keeps archived shops in the directory, and lets the owner isolate either side', async () => {
    expect((await listAccounts({ pageSize: 100 })).total).toBe(12);
    const active = await listAccounts({ pageSize: 100, archived: 'active' });
    const archived = await listAccounts({ pageSize: 100, archived: 'archived' });
    const internal = await listAccounts({ pageSize: 100, archived: 'internal' });
    expect(active.items.every(i => !i.shopArchived)).toBe(true);
    expect(archived.items.every(i => i.shopArchived)).toBe(true);
    expect(active.total + archived.total + internal.total).toBe(12);
  });

  it('agrees exactly with the Overview tiles it is linked from (internal shops are their own group)', async () => {
    const o = await getOwnerOverview();
    expect((await listAccounts({ pageSize: 100, archived: 'active' })).total).toBe(o.activeExternalShops);
    expect((await listAccounts({ pageSize: 100, archived: 'archived' })).total).toBe(o.archivedExternalShops);
    const internal = await listAccounts({ pageSize: 100, archived: 'internal' });
    expect(internal.total).toBe(o.internalShops);
    expect(internal.items.every(i => i.status === 'internal')).toBe(true);
  });
});

describe('Profiles without shop membership', () => {
  it('is based on missing shop_users membership, not on a null legacy profiles.shop_id', async () => {
    const o = await getOwnerOverview();
    // U(15): legacy pointer set, no membership  -> counted
    // U(16): no pointer and no membership      -> counted
    // U(14): null legacy pointer BUT a real membership -> NOT counted
    expect(o.profilesWithoutMembership).toBe(2);
  });

  it('is unavailable rather than wrong when the tables are too large to scan safely', async () => {
    const many: Row[] = Array.from({ length: 2001 }, (_, i) => ({
      id: `d${String(i).padStart(7, '0')}-0000-4000-8000-000000000000`, email: null, role: null, plan: 'free',
      trial_ends_at: null, shop_name: null, shop_id: null, billing_status: null,
    }));
    fake.state.tables.profiles = [...fake.state.tables.profiles, ...many];
    const o = await getOwnerOverview();
    expect(o.profilesWithoutMembership).toBeNull();
  });
});

describe('Billing reconciliation', () => {
  // Found in review: the list re-derived "paid, no billing record" from raw plan + subscription, so a paid shop
  // whose profile says past_due / cancelled (status past_due / cancelled_access_retained, indicator "reconciled",
  // review count 0) was still listed as needing review. The list now follows the canonical classification.
  it('does not list a paid shop that its profile billing flag already explains (past due / cancelled, no subscription row)', async () => {
    fake.state.tables.shops.push(shop('e1000000-0000-4000-8000-000000000001', 'Past Due No Row Co'), shop('e2000000-0000-4000-8000-000000000002', 'Cancelled No Row Co'));
    fake.state.tables.shop_users.push(owner(31, 'e1000000-0000-4000-8000-000000000001'), owner(32, 'e2000000-0000-4000-8000-000000000002'));
    fake.state.tables.profiles.push(
      ownerProfile(31, 'e1000000-0000-4000-8000-000000000001', 'pro', null, 'past_due'),
      ownerProfile(32, 'e2000000-0000-4000-8000-000000000002', 'pro', null, 'cancelled'),
    );
    const before = (await getOwnerOverview()).billingReviewActive;
    const o = await getOwnerOverview();
    expect(o.active.pastDue).toBe(1);
    expect(o.active.cancelledAccessRetained).toBe(1);
    expect(o.billingReviewActive).toBe(before); // neither is flagged for review
    const names = (await getBillingReconciliation({})).items.map(i => i.shopName);
    expect(names).not.toContain('Past Due No Row Co');
    expect(names).not.toContain('Cancelled No Row Co');
  });

  it('every shop counted as flagged for billing review is in the reconciliation list (the list may add the events check, never omit)', async () => {
    const o = await getOwnerOverview();
    const listed = new Set((await getBillingReconciliation({})).items.map(i => i.shopName));
    const flagged = (await listAccounts({ pageSize: 100 })).items.filter(i => i.billingMismatch && i.status !== 'internal');
    expect(flagged.length).toBe(o.billingReviewActive + o.billingReviewArchived);
    for (const f of flagged) expect(listed.has(f.shopName)).toBe(true);
  });

  it('lists each account that meets a reconciliation condition, with its reason', async () => {
    const r = await getBillingReconciliation({});
    const reasons = Object.fromEntries(r.items.map(i => [i.shopName, i.reasons]));
    expect(reasons).toEqual({
      'Paid No Sub Co': ['paid_no_billing_record'],
      'Archived Paid No Sub Co': ['paid_no_billing_record'],
      'Free With Active Sub Co': ['active_subscription_free_entitlement'],
      'Events No Sub Co': ['billing_events_without_subscription'],
      'Conflict Co': ['billing_status_conflict'],
    });
    expect(r.total).toBe(5);
  });

  it('excludes internal shops, and accounts that reconcile cleanly', async () => {
    const r = await getBillingReconciliation({});
    const names = r.items.map(i => i.shopName);
    expect(names).not.toContain('Internal A');
    expect(names).not.toContain('Internal Archived');
    expect(names).not.toContain('Active Paid Co');
    expect(names).not.toContain('Free Co');
  });

  it('lists active shops before archived ones and flags archived', async () => {
    const r = await getBillingReconciliation({});
    expect(r.items[r.items.length - 1].archived).toBe(true);
    expect(r.items.filter(i => i.archived).map(i => i.shopName)).toEqual(['Archived Paid No Sub Co']);
  });

  it('masks account identifiers and exposes only the fields needed to reconcile', async () => {
    const r = await getBillingReconciliation({});
    for (const item of r.items) {
      expect(item.accountRef).toMatch(/^ref-[0-9a-f]{10}$/);
      // Not a prefix of any shop id: a prefix could be matched back to the id list the directory API returns.
      for (const id of Object.values(S)) expect(id.replace(/-/g, '')).not.toContain(item.accountRef.slice(4));
      expect(Object.keys(item).sort()).toEqual([
        'accountRef', 'archived', 'billingEventCount', 'entitlement', 'hasSubscriptionReference',
        'profileBillingStatus', 'profilePlan', 'reasons', 'shopName', 'subscriptionPlanKey', 'subscriptionStatus',
      ].sort());
    }
    const json = JSON.stringify(r);
    for (const id of Object.values(S)) expect(json).not.toContain(id);
    expect(json).not.toMatch(/example-test\.invalid|internal\.example/); // no emails
    expect(json).not.toMatch(/sub_|cus_|whsec_|tok_/);
  });

  it('reads only shop_id from billing_events — never a payload or error column', async () => {
    await getBillingReconciliation({});
    const eventSelects = fake.state.selects.filter(s => s.table === 'billing_events');
    expect(eventSelects.length).toBeGreaterThan(0);
    for (const s of eventSelects) expect(s.columns).toEqual(['shop_id']);
  });

  it('is strictly bounded and paginated', async () => {
    const big = await getBillingReconciliation({ pageSize: 100000 });
    expect(big.pageSize).toBeLessThanOrEqual(50);
    const p1 = await getBillingReconciliation({ page: 1, pageSize: 2 });
    const p2 = await getBillingReconciliation({ page: 2, pageSize: 2 });
    const p3 = await getBillingReconciliation({ page: 3, pageSize: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p2.items).toHaveLength(2);
    expect(p3.items).toHaveLength(1);
    const seen = [...p1.items, ...p2.items, ...p3.items].map(i => i.accountRef);
    expect(new Set(seen).size).toBe(5);
    expect(p1.total).toBe(5);
    expect((await getBillingReconciliation({ page: 99, pageSize: 2 })).items).toEqual([]);
  });

  it('fails loudly instead of showing an empty list when a source cannot be read', async () => {
    fake.state.failTables.add('billing_events');
    await expect(getBillingReconciliation({})).rejects.toThrow(/admin data query failed/);
  });

  it('reports the result as truncated when the billing-events scan reaches its cap', async () => {
    expect((await getBillingReconciliation({})).truncated).toBe(false);
    const filler: Row[] = Array.from({ length: 2000 }, (_, i) => ({
      id: `cap${i}`, shop_id: S.eventsNoSub, event_type: 'checkout.completed', processed: true, processed_at: NOW, error: null, created_at: NOW,
    }));
    fake.state.tables.billing_events = filler;
    const r = await getBillingReconciliation({});
    expect(r.truncated).toBe(true);
    expect(r.maxScanRows).toBe(2000);
  });
});

describe('Account-detail response privacy', () => {
  it('never contains a complete or partial provider subscription or customer identifier', async () => {
    const d = (await getAccountDetail(S.activePaid))!;
    const json = JSON.stringify(d);
    expect(json).not.toContain(PROVIDER_SUB);
    expect(json).not.toContain(PROVIDER_CUS);
    expect(json).not.toContain('Zq7K'); // no masked tail either: a masked value must not identify the provider record
    expect(json).not.toContain('Xp3M');
    expect(json).not.toMatch(/"raw"\s*:/);
    expect(json).not.toMatch(/\bsub_|\bcus_/);
  });

  it('reports linkage as booleans only', async () => {
    const d = (await getAccountDetail(S.activePaid))!;
    expect(d.subscription).not.toBeNull();
    expect(d.subscription!.hasSubscriptionReference).toBe(true);
    expect(d.subscription!.hasCustomerReference).toBe(true);
    expect(d.subscription).not.toHaveProperty('providerSubscriptionId');
    expect(d.subscription).not.toHaveProperty('providerCustomerId');
  });

  it('never exposes webhook payloads, secrets, signatures, tokens or provider error text', async () => {
    const d = (await getAccountDetail(S.activePaid))!;
    const json = JSON.stringify(d);
    expect(d.billingEvents).toHaveLength(2);
    expect(json).not.toMatch(/whsec_|tok_|boom|payload|signature|secret/i);
    for (const e of d.billingEvents) {
      expect(Object.keys(e).sort()).toEqual(['createdAt', 'eventType', 'failed', 'id', 'processed', 'processedAt']);
    }
    expect(d.billingEvents.find(e => e.eventType === 'subscription.update')!.failed).toBe(true);
    expect(d.billingEvents.find(e => e.eventType === 'subscription.paid')!.failed).toBe(false);
  });

  it('never selects a webhook payload column, and reduces the stored error to a boolean on the server', async () => {
    await getAccountDetail(S.activePaid);
    for (const s of fake.state.selects.filter(x => x.table === 'billing_events')) {
      expect(s.columns).not.toContain('payload');
    }
  });

  it('carries no subscription block for a shop without a subscription row', async () => {
    const d = (await getAccountDetail(S.free))!;
    expect(d.subscription).toBeNull();
  });
});

describe('One canonical commercial state — the Owner Overview and Billing Health cannot disagree', () => {
  it('the Overview commercial block is exactly what Billing Health reads', async () => {
    const overview = await getOwnerOverview();
    const shared = await getCommercialOverview();
    expect(overview.commercial).toEqual(shared);
  });

  it('Billing Health subscription and revenue figures come from the same resolver as the Overview', async () => {
    const o = await getOwnerOverview();
    const revenue = await getRevenueMetrics();
    const subs = await getSubscriptionSummary();
    expect(revenue.mrr).toBe(o.commercial.revenue.mrr);
    expect(revenue.arr).toBe(o.commercial.revenue.arr);
    expect(revenue.arpa).toBe(o.commercial.revenue.arpa);
    expect(subs.active).toBe(o.active.activePaid + o.active.cancelScheduled + o.archived.activePaid + o.archived.cancelScheduled);
    expect(subs.mismatch).toBe(o.active.billingMismatch + o.archived.billingMismatch);
    expect(subs.unverified).toBe(o.active.paidUnverified + o.archived.paidUnverified);
  });

  it('the Billing Health renewal block takes past-due count and past-due MRR from the resolver, not from raw subscription rows', async () => {
    const commercial = await getCommercialOverview();
    // What the old raw query would have produced: every status=past_due row, verified or not.
    const raw = { failedRenewals: 4, shopsAffected: 2, mrrAtRisk: 999, pastDueCount: 7, gracePeriodCount: 0, recovered: 0 };
    const r = withCanonicalPastDue(raw, commercial);
    expect(r.pastDueCount).toBe(commercial.subscriptions.pastDue);
    expect(r.mrrAtRisk).toBe(commercial.revenue.pastDueRevenue);
    // Event-based figures are untouched.
    expect(r.failedRenewals).toBe(4);
    expect(r.shopsAffected).toBe(2);
  });

  it('MRR counts the one verified subscription only; the contradictory and unverified ones are excluded and reported', async () => {
    const { revenue, reconciliation } = await getOwnerOverview().then(o => o.commercial);
    expect(revenue.mrr).toBe(PLAN_MONTHLY_PRICE.professional);
    expect(revenue.arr).toBe(PLAN_MONTHLY_PRICE.professional * 12);
    expect(revenue.pricedRecurringShops).toBe(1);
    expect(revenue.excluded.mismatch).toBe(2);
    expect(revenue.excluded.unverified).toBe(2); // includes the archived one
    expect(reconciliation).toBe('mismatch');
  });

  it.each([
    ['an unknown word', { billing_interval: 'quarterly' }],
    ['a number', { billing_interval: 12 }],
    ['an object', { billing_interval: { every: 'week' } }],
  ])('a stored billing interval that is %s is excluded from verified MRR and reported, never priced', async (_label, metadata) => {
    const before = await getCommercialOverview();
    const verified = fake.state.tables.shop_subscriptions.find(r => r.shop_id === S.activePaid)!;
    verified.metadata = metadata;
    const after = await getCommercialOverview();
    expect(before.revenue.mrr).toBe(PLAN_MONTHLY_PRICE.professional);
    expect(after.revenue.mrr).toBe(0);
    expect(after.revenue.pricedRecurringShops).toBe(0);
    expect(after.revenue.excluded.unrecognisedInterval).toBe(1);
    // The same figures reach Billing Health and the Overview.
    expect((await getRevenueMetrics()).mrr).toBe(0);
    expect((await getOwnerOverview()).commercial.revenue.excluded.unrecognisedInterval).toBe(1);
  });

  it('a stored interval of "annual" or a missing one is still priced', async () => {
    const verified = fake.state.tables.shop_subscriptions.find(r => r.shop_id === S.activePaid)!;
    verified.metadata = { billing_interval: 'annual' };
    expect((await getCommercialOverview()).revenue.excluded.unrecognisedInterval).toBe(0);
    expect((await getCommercialOverview()).revenue.mrr).toBeGreaterThan(0);
    verified.metadata = null;
    const c = await getCommercialOverview();
    expect(c.revenue.mrr).toBe(PLAN_MONTHLY_PRICE.professional);
    expect(c.revenue.assumedMonthlyInterval).toBe(1);
  });

  it('internal shops never appear in commercial totals', async () => {
    const { subscriptions } = await getOwnerOverview().then(o => o.commercial);
    expect(subscriptions.internalShops).toBe(0); // the fixture gives internal shops no billing row
    fake.state.tables.shop_subscriptions.push(sub(S.internalA, 'active'));
    const c = await getCommercialOverview();
    expect(c.subscriptions.internalShops).toBe(1);
    expect(c.revenue.mrr).toBe(PLAN_MONTHLY_PRICE.professional); // unchanged
  });

  it('zero paid shops: zero revenue and a reconciled indicator', async () => {
    fake.state.tables.shop_subscriptions = [];
    fake.state.tables.billing_events = [];
    fake.state.tables.profiles = fake.state.tables.profiles.map(p => ((p.plan === 'professional' || p.plan === 'solo' || p.plan === 'pro') ? { ...p, plan: 'free', billing_status: 'inactive' } : p));
    const { revenue, reconciliation, subscriptions } = await getOwnerOverview().then(o => o.commercial);
    expect(revenue.mrr).toBe(0);
    expect(revenue.arpa).toBe(0);
    expect(subscriptions.active).toBe(0);
    expect(reconciliation).toBe('reconciled');
  });

  it('an orphan billing record (a subscription with no shop) fails the reconciliation closed', async () => {
    fake.state.tables.shop_subscriptions = [sub(S.activePaid, 'active'), sub('ffffffff-ffff-4fff-8fff-ffffffffffff', 'active')];
    fake.state.tables.profiles = fake.state.tables.profiles.map(p => ((p.plan === 'solo' || p.plan === 'pro' || p.id === U(10) || p.id === U(12)) ? { ...p, plan: 'free', billing_status: 'inactive' } : p));
    const c = await getOwnerOverview().then(o => o.commercial);
    expect(c.orphanSubscriptions).toBe(1);
    expect(c.reconciliation).toBe('mismatch');
    expect(c.revenue.mrr).toBe(PLAN_MONTHLY_PRICE.professional); // the orphan adds nothing
  });

  it('counts billing events with no shop, without exposing them', async () => {
    fake.state.tables.billing_events.push({ id: 'e9', shop_id: null, event_type: 'checkout.completed', processed: true, processed_at: NOW, error: null, created_at: NOW });
    const c = await getOwnerOverview().then(o => o.commercial);
    expect(c.unattributedBillingEvents).toBe(1);
    expect(JSON.stringify(c)).not.toMatch(/checkout\.completed/);
  });

  it('reports an orphan count as unknown, not zero, when it cannot be determined safely', async () => {
    fake.state.tables.shop_subscriptions = Array.from({ length: 2001 }, () => sub('ffffffff-ffff-4fff-8fff-ffffffffffff', 'active'));
    const c = await getCommercialOverview();
    expect(c.orphanSubscriptions).toBeNull();
  });
});

describe('Tenant isolation of the commercial joins', () => {
  const SHOP_A = 'd1000000-0000-4000-8000-00000000000a';
  const SHOP_B = 'd2000000-0000-4000-8000-00000000000b';
  const OWNER_A = U(41);
  const OWNER_B = U(42);

  beforeEach(() => {
    fake.state.tables = {
      shops: [shop(SHOP_A, 'Tenant A'), shop(SHOP_B, 'Tenant B')],
      shop_users: [owner(41, SHOP_A), owner(42, SHOP_B)],
      profiles: [
        ownerProfile(41, SHOP_A, 'professional', null, 'active', 'a-owner@example-test.invalid'),
        ownerProfile(42, SHOP_B, 'professional', null, 'inactive', 'b-owner@example-test.invalid'),
      ],
      // only tenant A has billing evidence
      shop_subscriptions: [sub(SHOP_A, 'active')],
      billing_events: [
        { id: 'a1', shop_id: SHOP_A, event_type: 'subscription.paid', processed: true, processed_at: NOW, error: null, created_at: NOW },
      ],
      shop_mirrors: [], support_tickets: [],
    };
  });

  it("one tenant's subscription and events are never attributed to another tenant", async () => {
    const all = await listAccounts({ pageSize: 100 });
    const a = all.items.find(i => i.id === SHOP_A)!;
    const b = all.items.find(i => i.id === SHOP_B)!;
    expect(a.status).toBe('active_paid');
    expect(b.status).toBe('paid_unverified'); // paid profile, but no billing evidence of its own
    const detailB = (await getAccountDetail(SHOP_B))!;
    expect(detailB.subscription).toBeNull();
    expect(detailB.billingEvents).toEqual([]);
    const recon = await getBillingReconciliation({});
    expect(recon.items.map(i => i.shopName)).toEqual(['Tenant B']);
    expect(recon.items[0].billingEventCount).toBe(0);
  });

  it("each shop's primary contact is its own owner", async () => {
    const all = await listAccounts({ pageSize: 100 });
    expect(all.items.find(i => i.id === SHOP_A)!.primaryContactEmail).toBe('a-owner@example-test.invalid');
    expect(all.items.find(i => i.id === SHOP_B)!.primaryContactEmail).toBe('b-owner@example-test.invalid');
  });

  it('a person who owns two shops keeps each shop\'s billing evidence separate', async () => {
    fake.state.tables.shop_users.push({ shop_id: SHOP_B, user_id: OWNER_A, role: 'owner' });
    // shop B now lists two owners; the first owner row wins, but B must still not inherit A's subscription
    const all = await listAccounts({ pageSize: 100 });
    const b = all.items.find(i => i.id === SHOP_B)!;
    expect(b.status).not.toBe('active_paid');
    expect(OWNER_B).not.toBe(OWNER_A);
    const revenue = (await getOwnerOverview()).commercial.revenue;
    expect(revenue.pricedRecurringShops).toBe(1);
  });
});
