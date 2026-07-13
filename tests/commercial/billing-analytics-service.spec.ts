/**
 * tests/commercial/billing-analytics-service.spec.ts
 * Unit tests for BillingAnalyticsService metric calculations.
 * Uses jest globals (typed via @types/jest in tsconfig).
 * Run with: npx jest tests/commercial/ (or equivalent runner)
 */

// ─── Mock dependencies ────────────────────────────────────────────────────────

jest.mock('@/lib/supabaseServer', () => ({
  getAdminDb: jest.fn(),
}));

jest.mock('@/lib/adminAuth', () => ({
  getInternalShopIds: () => new Set([
    '38d55fae-741b-4bac-b520-f96eed65bf38',
    '90b72748-bf01-4456-999f-f4ba48091606',
  ]),
}));

function mockSubscriptions(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require('@/lib/supabaseServer').getAdminDb as jest.Mock).mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    }),
  });
}

// ─── MRR tests ────────────────────────────────────────────────────────────────

describe('MRR calculation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('monthly plan contributes full monthly price', async () => {
    mockSubscriptions([
      { shop_id: 'shop-1', plan_key: 'professional', status: 'active', metadata: { billing_interval: 'monthly' }, cancel_at_period_end: false },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRevenueMetrics } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getRevenueMetrics();
    expect(result.mrr).toBe(59);
  });

  it('annual plan contributes annual price / 12', async () => {
    mockSubscriptions([
      { shop_id: 'shop-1', plan_key: 'professional', status: 'active', metadata: { billing_interval: 'annual' }, cancel_at_period_end: false },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRevenueMetrics } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getRevenueMetrics();
    expect(result.mrr).toBeCloseTo(590 / 12, 1);
  });

  it('trialing subscription contributes zero MRR', async () => {
    mockSubscriptions([
      { shop_id: 'shop-1', plan_key: 'professional', status: 'trialing', metadata: {}, cancel_at_period_end: false },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRevenueMetrics } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getRevenueMetrics();
    expect(result.mrr).toBe(0);
  });

  it('internal D1 shop contributes zero MRR', async () => {
    mockSubscriptions([
      { shop_id: '38d55fae-741b-4bac-b520-f96eed65bf38', plan_key: 'professional', status: 'active', metadata: { billing_interval: 'monthly' }, cancel_at_period_end: false },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRevenueMetrics } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getRevenueMetrics();
    expect(result.mrr).toBe(0);
  });

  it('cancelled subscription contributes zero MRR', async () => {
    mockSubscriptions([
      { shop_id: 'shop-1', plan_key: 'professional', status: 'cancelled', metadata: {}, cancel_at_period_end: false },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRevenueMetrics } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getRevenueMetrics();
    expect(result.mrr).toBe(0);
  });

  it('ARR equals MRR × 12', async () => {
    mockSubscriptions([
      { shop_id: 'shop-1', plan_key: 'starter', status: 'active', metadata: { billing_interval: 'monthly' }, cancel_at_period_end: false },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRevenueMetrics } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getRevenueMetrics();
    expect(result.arr).toBeCloseTo(result.mrr * 12, 2);
  });

  it('ARPA returns zero safely when no active paid shops', async () => {
    mockSubscriptions([]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRevenueMetrics } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getRevenueMetrics();
    expect(result.arpa).toBe(0);
    expect(result.mrr).toBe(0);
  });

  it('empty dataset returns all zeros without error', async () => {
    mockSubscriptions([]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRevenueMetrics } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getRevenueMetrics();
    expect(result.mrr).toBe(0);
    expect(result.arr).toBe(0);
    expect(result.arpa).toBe(0);
  });
});

// ─── LTV tests ────────────────────────────────────────────────────────────────

describe('LTV calculation', () => {
  it('returns null LTV when churn is zero', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getLifetimeValue } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getLifetimeValue(
      { mrr: 590, arr: 7080, arpa: 59, currency: 'USD', mrrByPlan: {}, revenueAtRisk: 0, note: '' },
      { logoRate: 0, revenueRate: 0, cancelledThisPeriod: 0, scheduledCancel: 0, lostMrr: 0, sampleSize: 10, insufficient: false, note: '' },
      { newPaidShops: 5, cacConfigured: false, cacAmount: null, note: '' },
    );
    expect(result.estimatedLtv).toBeNull();
    expect(result.ltvNote).toMatch(/zero/);
  });

  it('returns null LTV when sample is insufficient', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getLifetimeValue } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getLifetimeValue(
      { mrr: 590, arr: 7080, arpa: 59, currency: 'USD', mrrByPlan: {}, revenueAtRisk: 0, note: '' },
      { logoRate: 5, revenueRate: 5, cancelledThisPeriod: 1, scheduledCancel: 0, lostMrr: 59, sampleSize: 3, insufficient: true, note: '' },
      { newPaidShops: 1, cacConfigured: false, cacAmount: null, note: '' },
    );
    expect(result.estimatedLtv).toBeNull();
  });

  it('CAC is null when not configured', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getLifetimeValue } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getLifetimeValue(
      { mrr: 590, arr: 7080, arpa: 59, currency: 'USD', mrrByPlan: {}, revenueAtRisk: 0, note: '' },
      { logoRate: 5, revenueRate: 5, cancelledThisPeriod: 1, scheduledCancel: 0, lostMrr: 59, sampleSize: 10, insufficient: false, note: '' },
      { newPaidShops: 2, cacConfigured: false, cacAmount: null, note: 'CAC data not configured' },
    );
    expect(result.cac).toBeNull();
  });

  it('computes LTV = ARPA / churn_rate correctly', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getLifetimeValue } = require('@/commercial/analytics/BillingAnalyticsService');
    const result = await getLifetimeValue(
      { mrr: 590, arr: 7080, arpa: 59, currency: 'USD', mrrByPlan: {}, revenueAtRisk: 0, note: '' },
      { logoRate: 5, revenueRate: 5, cancelledThisPeriod: 1, scheduledCancel: 0, lostMrr: 59, sampleSize: 10, insufficient: false, note: '' },
      { newPaidShops: 2, cacConfigured: false, cacAmount: null, note: '' },
    );
    // LTV = 59 / 0.05 = 1180
    expect(result.estimatedLtv).toBeCloseTo(1180, 0);
  });
});

// ─── Metric warnings tests ────────────────────────────────────────────────────

describe('Metric warnings', () => {
  it('warns when webhook failure rate exceeds 5%', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getMetricWarnings } = require('@/commercial/analytics/BillingAnalyticsService');
    const warnings: string[] = getMetricWarnings(
      { total: 5, active: 5, trialing: 0, pastDue: 0, cancelled: 0, expired: 0, suspended: 0, byPlan: {}, internalShops: 0 },
      { received: 100, processed: 80, failed: 10, duplicatesIgnored: 0, failureRate: 10, medianLatencyMs: 100, p95LatencyMs: 200, p99LatencyMs: 300, maxLatencyMs: 400, oldestUnprocessedAgeMs: null, topFailingTypes: [], latencyNote: '' },
      { failedRenewals: 0, shopsAffected: 0, mrrAtRisk: 0, pastDueCount: 0, gracePeriodCount: 0, recovered: 0 },
      { active: 0, expiringIn1Day: 0, expiringIn3Days: 0, expiredUnconverted: 0, converted: 0, conversionRate: null, avgDaysToConversion: null, cohortNote: '' },
      { logoRate: 2, revenueRate: 2, cancelledThisPeriod: 0, scheduledCancel: 0, lostMrr: 0, sampleSize: 10, insufficient: false, note: '' },
      { count: 0, totalAmount: 0, currency: 'USD', refundRate: null, byPlan: {}, avgDaysToRefund: null },
    );
    expect(warnings.some((w: string) => w.includes('failure rate'))).toBe(true);
  });

  it('warns when past-due MRR is above zero', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getMetricWarnings } = require('@/commercial/analytics/BillingAnalyticsService');
    const warnings: string[] = getMetricWarnings(
      { total: 5, active: 4, trialing: 0, pastDue: 1, cancelled: 0, expired: 0, suspended: 0, byPlan: {}, internalShops: 0 },
      { received: 10, processed: 10, failed: 0, duplicatesIgnored: 0, failureRate: 0, medianLatencyMs: 100, p95LatencyMs: 200, p99LatencyMs: 300, maxLatencyMs: 400, oldestUnprocessedAgeMs: null, topFailingTypes: [], latencyNote: '' },
      { failedRenewals: 0, shopsAffected: 0, mrrAtRisk: 59, pastDueCount: 1, gracePeriodCount: 0, recovered: 0 },
      { active: 0, expiringIn1Day: 0, expiringIn3Days: 0, expiredUnconverted: 0, converted: 0, conversionRate: null, avgDaysToConversion: null, cohortNote: '' },
      { logoRate: 0, revenueRate: 0, cancelledThisPeriod: 0, scheduledCancel: 0, lostMrr: 0, sampleSize: 10, insufficient: false, note: '' },
      { count: 0, totalAmount: 0, currency: 'USD', refundRate: null, byPlan: {}, avgDaysToRefund: null },
    );
    expect(warnings.some((w: string) => w.includes('MRR at risk'))).toBe(true);
  });
});
