const SHOP_A = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';

type Result = { data: unknown; error: unknown };
let ownerResult: Result;
let profileResult: Result;

function makeChain(result: Result) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(result),
  };
  return chain;
}

const mockFrom = jest.fn((table: string) => {
  if (table === 'shop_users') return makeChain(ownerResult);
  if (table === 'profiles') return makeChain(profileResult);
  return makeChain({ data: null, error: null });
});

jest.mock('@/lib/supabaseServer', () => ({
  getAdminDb: () => ({ from: (table: string) => mockFrom(table) }),
}));

const mockGetShopSubscription = jest.fn();
jest.mock('@/commercial/subscriptions/subscriptionService', () => ({
  getShopSubscription: (...args: unknown[]) => mockGetShopSubscription(...args),
  activateSubscription: jest.fn(),
  updateSubscriptionStatus: jest.fn(),
}));

const mockGetMonthlyUsage = jest.fn();
jest.mock('@/commercial/usage/usageService', () => ({
  getMonthlyUsage: (...args: unknown[]) => mockGetMonthlyUsage(...args),
}));

import { getBillingStatus } from '../billingService';

beforeEach(() => {
  ownerResult = { data: { user_id: OWNER_ID }, error: null };
  profileResult = { data: null, error: null };
  mockGetShopSubscription.mockReset();
  mockGetShopSubscription.mockResolvedValue(null);
  mockGetMonthlyUsage.mockReset();
  mockGetMonthlyUsage.mockResolvedValue({ shopId: SHOP_A, period: { start: new Date(), end: new Date() }, usage: {} });
});

describe('getBillingStatus — with a real shop_subscriptions row', () => {
  it('returns the commercial plan and subscription unchanged', async () => {
    mockGetShopSubscription.mockResolvedValue({
      id: 'sub-1', shopId: SHOP_A, planKey: 'professional', status: 'active',
      billingProvider: 'creem', providerCustomerId: 'cus_1', providerSubscriptionId: 'sub_1',
      trialStart: null, trialEnd: null, currentPeriodStart: null, currentPeriodEnd: null,
      cancelAtPeriodEnd: false, cancelledAt: null, pastDueAt: null, metadata: {},
      createdAt: new Date(), updatedAt: new Date(),
    });
    const status = await getBillingStatus(SHOP_A);
    expect(status.subscription?.planKey).toBe('professional');
    expect(status.plan?.name).toBe('Professional');
    expect(status.isActive).toBe(true);
  });
});

describe('getBillingStatus — no shop_subscriptions row (in-house Free Forever / trial system)', () => {
  it('shows Free Trial with real days-left for an active trial, not "Unknown"', async () => {
    const futureTrial = new Date(Date.now() + 5 * 86400000).toISOString();
    profileResult = { data: { plan: null, trial_ends_at: futureTrial }, error: null };
    const status = await getBillingStatus(SHOP_A);
    expect(status.plan?.name).toBe('Free Trial');
    expect(status.trialDaysLeft).toBeGreaterThanOrEqual(4);
    expect(status.trialDaysLeft).toBeLessThanOrEqual(5);
    expect(status.subscription).toBeNull();
  });

  it('shows Free Forever for an explicitly free-plan shop, with no trial days', async () => {
    profileResult = { data: { plan: 'free', trial_ends_at: null }, error: null };
    const status = await getBillingStatus(SHOP_A);
    expect(status.plan?.name).toBe('Free Forever');
    expect(status.trialDaysLeft).toBeNull();
  });

  it('shows a real paid-plan name (Solo) even though it has no shop_subscriptions row', async () => {
    profileResult = { data: { plan: 'solo', trial_ends_at: null }, error: null };
    const status = await getBillingStatus(SHOP_A);
    expect(status.plan?.name).toBe('Solo');
  });

  it('resolves a paid plan that overlaps the commercial catalog (Professional) via getPlan', async () => {
    profileResult = { data: { plan: 'professional', trial_ends_at: null }, error: null };
    const status = await getBillingStatus(SHOP_A);
    expect(status.plan?.name).toBe('Professional');
  });

  it('never shows "Unknown" — a lapsed trial with no owner row on record still gets a Free Forever fallback', async () => {
    ownerResult = { data: null, error: null }; // no owner found at all
    const status = await getBillingStatus(SHOP_A);
    expect(status.plan?.name).toBe('Free Forever');
  });
});
