/**
 * tests/commercial/internal-shop-exclusion.spec.ts
 * D1 internal shops must never appear in commercial revenue metrics.
 */

jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: jest.fn() }));
jest.mock('@/lib/adminAuth', () => ({
  getInternalShopIds: () => new Set([
    '38d55fae-741b-4bac-b520-f96eed65bf38',
    '90b72748-bf01-4456-999f-f4ba48091606',
  ]),
}));

function mockSubscriptionRows(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require('@/lib/supabaseServer').getAdminDb as jest.Mock).mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    }),
  });
}

describe('Internal shop exclusion from revenue metrics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('two active internal shops produce zero MRR', async () => {
    mockSubscriptionRows([
      { shop_id: '38d55fae-741b-4bac-b520-f96eed65bf38', plan_key: 'professional', status: 'active', metadata: { billing_interval: 'monthly' }, cancel_at_period_end: false },
      { shop_id: '90b72748-bf01-4456-999f-f4ba48091606', plan_key: 'professional', status: 'active', metadata: { billing_interval: 'monthly' }, cancel_at_period_end: false },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRevenueMetrics } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getRevenueMetrics();
    expect(result.mrr).toBe(0);
    expect(result.arr).toBe(0);
    expect(result.arpa).toBe(0);
  });

  it('internal shop count is reported separately, not as commercial subscribers', async () => {
    mockSubscriptionRows([
      { shop_id: '38d55fae-741b-4bac-b520-f96eed65bf38', plan_key: 'professional', status: 'active' },
      { shop_id: '90b72748-bf01-4456-999f-f4ba48091606', plan_key: 'professional', status: 'active' },
      { shop_id: 'external-shop-001', plan_key: 'starter', status: 'active' },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getSubscriptionSummary } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getSubscriptionSummary();
    expect(result.internalShops).toBe(2);
    expect(result.total).toBe(1);
    expect(result.active).toBe(1);
  });

  it('mixed internal + external correctly sums only external MRR', async () => {
    mockSubscriptionRows([
      { shop_id: '38d55fae-741b-4bac-b520-f96eed65bf38', plan_key: 'professional', status: 'active', metadata: { billing_interval: 'monthly' }, cancel_at_period_end: false },
      { shop_id: 'external-shop-001', plan_key: 'starter', status: 'active', metadata: { billing_interval: 'monthly' }, cancel_at_period_end: false },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRevenueMetrics } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getRevenueMetrics();
    expect(result.mrr).toBe(29); // only starter plan
  });
});
