/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import { BillingHealthDashboard } from '../billing-health/BillingHealthDashboard';
import type { BillingOverview } from '@/commercial/analytics/BillingAnalyticsService';
import {
  BILLING_PROVIDER_TRIALS_LABEL, BILLING_PROVIDER_TRIALS_EXPLANATION, TRIAL_COUNTS_MAY_DIFFER, TRIAL_ACCESS_LABEL,
} from '@/lib/admin/terminology';

// Synthetic overview — no production data, no network.
const overview: BillingOverview = {
  range: { from: '2026-08-19T00:00:00.000Z', to: '2026-09-18T00:00:00.000Z' },
  subscriptions: { total: 1, active: 1, trialing: 4, pastDue: 0, cancelled: 0, expired: 0, suspended: 0, byPlan: { solo: 1 }, internalShops: 0, cancelScheduled: 0, unverified: 1, mismatch: 0 },
  revenue: { mrr: 24, arr: 288, arpa: 24, currency: 'USD', mrrByPlan: { solo: 24 }, revenueAtRisk: 0, verifiedRecurringShops: 1, excluded: { unverified: 1, mismatch: 0, notProviderBacked: 0, unrecognisedInterval: 0, unpriced: 0 }, assumedMonthlyInterval: 1, note: 'note' },
  trials: { active: 3, expiringIn1Day: 0, expiringIn3Days: 1, expiredUnconverted: 0, converted: 0, conversionRate: null, avgDaysToConversion: null, cohortNote: 'cohort note' },
  churn: { logoRate: null, revenueRate: null, cancelledThisPeriod: 0, scheduledCancel: 0, lostMrr: 0, sampleSize: 0, insufficient: true, note: 'churn note' },
  webhook: {
    received: 2, processed: 2, failed: 0, duplicatesIgnored: 0, failureRate: 0, medianLatencyMs: 1, p95LatencyMs: 1, p99LatencyMs: 1,
    maxLatencyMs: 1, oldestUnprocessedAgeMs: null, topFailingTypes: [], latencyNote: 'latency note',
  },
  renewals: { failedRenewals: 0, shopsAffected: 0, mrrAtRisk: 0, pastDueCount: 0, gracePeriodCount: 0, recovered: 0 },
  value: { arpa: 24, monthlyChurnRate: null, estimatedLtv: null, cac: null, ltvToCacRatio: null, paybackPeriodMonths: null, ltvNote: 'ltv', cacNote: 'cac' },
  warnings: [],
  reconciliation: 'unverified',
  orphanSubscriptions: 0,
  generatedAt: '2026-09-18T00:00:00.000Z',
};

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ overview, dataQuality: [] }) })) as unknown as typeof fetch;
});

async function renderLoaded() {
  render(<BillingHealthDashboard />);
  await screen.findByText(/Subscription Health/i);
}

describe('BillingHealthDashboard — trial terminology', () => {
  it('labels subscription-based trials "Billing-provider trials", never a bare "Trials" or "Trialing"', async () => {
    await renderLoaded();
    expect(screen.getAllByText(BILLING_PROVIDER_TRIALS_LABEL).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Trials')).toBeNull();
    expect(screen.queryByText('Trialing')).toBeNull();
    expect(screen.queryByText('Active Trials')).toBeNull();
    expect(screen.queryByText('Trial Funnel')).toBeNull();
  });

  it('does not use the Owner Overview label for a different definition', async () => {
    await renderLoaded();
    expect(screen.queryByText(TRIAL_ACCESS_LABEL)).toBeNull();
  });

  it('explains where the figure comes from and why it can differ from Trial access', async () => {
    await renderLoaded();
    const note = screen.getByTestId('trial-terminology-note').textContent ?? '';
    expect(note).toContain(BILLING_PROVIDER_TRIALS_EXPLANATION);
    expect(note).toContain(TRIAL_COUNTS_MAY_DIFFER);
    expect(note).toContain(TRIAL_ACCESS_LABEL);
    expect(within(screen.getByTestId('trial-terminology-note')).getByText('Owner Overview').closest('a')?.getAttribute('href')).toBe('/admin');
  });

  it('keeps the funnel figures under the Billing-provider trials heading', async () => {
    await renderLoaded();
    const section = screen.getByTestId('billing-provider-trials');
    expect(section.textContent).toMatch(/Billing-provider trials/);
    expect(section.textContent).toMatch(/Expiring in 3d/);
  });
});

describe('BillingHealthDashboard — reconciliation indicator', () => {
  it('shows the same reconciliation state as the Owner Overview, with what was excluded from revenue', async () => {
    await renderLoaded();
    const el = screen.getByTestId('bh-reconciliation');
    expect(el.textContent).toContain('Billing reconciliation: Unverified');
    expect(el.textContent).toMatch(/Verified subscriptions counted: 1/);
    expect(el.textContent).toMatch(/unverified: 1, contradictory: 0, not provider-backed: 0, unrecognised billing interval: 0, unpriced: 0/);
    expect(within(el).getByText('Owner Overview').closest('a')?.getAttribute('href')).toBe('/admin');
  });
});