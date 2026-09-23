/**
 * Reconciliation: the seeded records, counted by the app's own code, give the
 * numbers the Command Center shows — nothing is hard-coded in between.
 *
 * The dataset is loaded into an in-memory database and run through the real
 * intelligence/metrics/MetricsBuilder (every card that comes from
 * /api/intelligence/metrics), the real RuleRegistry (Critical, High Priority,
 * Open Recs, Top Priorities), and the real invoice math the browser uses for
 * Revenue Today (lib/domain/invoiceMath, which useOperationalStats mirrors).
 *
 * The server runs in UTC on Vercel, so this file simulates a UTC host: the
 * three local-time Date methods MetricsBuilder uses (setHours, getDate,
 * setDate) are pointed at their UTC twins. Setting process.env.TZ at runtime
 * is not enough — Node on Windows ignores it — and without this the test
 * would compute "today" from the developer's own time zone.
 */
function simulateUtcHost() {
  const p = Date.prototype;
  const spies = [
    jest.spyOn(p, 'setHours').mockImplementation(function (this: Date, h: number, m?: number, s?: number, ms?: number) {
      return p.setUTCHours.apply(this, [h, m, s, ms].filter(v => v !== undefined) as [number]);
    }),
    jest.spyOn(p, 'getDate').mockImplementation(function (this: Date) { return p.getUTCDate.call(this); }),
    jest.spyOn(p, 'setDate').mockImplementation(function (this: Date, d: number) { return p.setUTCDate.call(this, d); }),
  ];
  return () => spies.forEach(s => s.mockRestore());
}

import { buildSummitDataset, expectedTotals, lineTotal, SUMMIT, type SummitDataset } from '../summitDataset';
import { localDateString } from '../clock';
import { createMemoryDb } from './support/memoryDb';

const SHOP = '00000000-0000-4000-8000-00000000d3e0';

let mockDb = createMemoryDb({});
jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => mockDb }));

import { calculateShopMetrics } from '@/intelligence/metrics/MetricsBuilder';
import { extractSignalsFromMetrics } from '@/intelligence/signals/SignalExtractor';
import { ALL_RULES } from '@/intelligence/rules/RuleRegistry';
import { getEffectiveTotal, mapInvoiceRow } from '@/lib/domain/invoiceMath';

function load(d: SummitDataset) {
  const inShop = <T extends object>(rows: T[]) => rows.map(r => ({ ...r, shop_id: SHOP }) as Record<string, unknown>);
  mockDb = createMemoryDb({
    customers: inShop(d.customers),
    vehicles: inShop(d.vehicles),
    technicians: inShop(d.technicians),
    parts: inShop(d.parts),
    job_cards: inShop(d.jobCards),
    closed_jobs: inShop(d.closedJobs),
    repair_orders: inShop(d.repairOrders),
    invoices: inShop(d.invoices),
    estimates: inShop(d.estimates),
    payments: inShop(d.payments),
    repair_cases: inShop(d.repairCases),
    shop_users: [],
  });
}

/** Revenue Today exactly as the browser computes it: Paid invoices whose paid_date is today, local time. */
function browserRevenueToday(d: SummitDataset, now: Date): Record<string, number> {
  const today = localDateString(now);
  const out: Record<string, number> = {};
  for (const inv of d.invoices.filter(i => i.status === 'Paid')) {
    const paidLocal = localDateString(new Date(inv.paid_date as string));
    if (paidLocal !== today) continue;
    const { amount, currency } = getEffectiveTotal(mapInvoiceRow({ ...inv }));
    out[currency] = (out[currency] ?? 0) + amount;
  }
  return out;
}

// Moments the seed may run: mid-month midday, the 1st of a month, early morning,
// late afternoon, across both DST regimes, and a month-end.
const RUN_TIMES = [
  '2026-09-23T17:00:00Z', // Wed noon CDT
  '2026-10-01T14:30:00Z', // 1st of the month, 09:30 CDT
  '2026-09-30T22:30:00Z', // month-end, 17:30 CDT
  '2027-01-14T13:00:00Z', // winter, 07:00 CST
  '2027-03-01T20:00:00Z', // 1st, CST
];

describe.each(RUN_TIMES)('seeded at %s', iso => {
  const now = new Date(iso);
  let d: SummitDataset;
  let restoreHost: () => void;

  beforeAll(() => {
    jest.useFakeTimers({ now, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    restoreHost = simulateUtcHost();
    d = buildSummitDataset(now);
    load(d);
  });
  afterAll(() => { restoreHost(); jest.useRealTimers(); });

  it('can be seeded at this time (today in Chicago and UTC overlap)', () => {
    expect(d.window.usable).toBe(true);
  });

  it('MetricsBuilder counts the requested demo figures from the records', async () => {
    const { metrics, warnings, errors } = await calculateShopMetrics(SHOP);
    expect(warnings).toEqual([]);
    expect(errors).toEqual([]);

    expect(metrics.paymentsToday).toBe(6);
    expect(metrics.revenueToday).toBe(5240);          // payments recorded today
    expect(metrics.unpaidInvoiceCount).toBe(4);
    expect(metrics.overdueInvoiceCount).toBe(2);
    expect(metrics.overdueInvoiceTotal).toBe(1480);   // requested ≈ $1,475
    expect(metrics.staleEstimateCount).toBe(3);
    expect(metrics.staleEstimateTotal).toBe(4250);
    expect(metrics.openEstimateCount).toBe(4);
    expect(metrics.openJobCount).toBe(8);
    expect(metrics.stuckJobCount).toBe(1);
    expect(metrics.completedNotInvoicedCount).toBe(2);
    expect(metrics.lowInventoryCount).toBe(4);
    expect(metrics.repairCasesToday).toBe(5);
    expect(metrics.revenueOpportunityTotal).toBe(2890 + 4250);
  });

  it('agrees with the expectation derived from the dataset itself', async () => {
    const { metrics } = await calculateShopMetrics(SHOP);
    const e = expectedTotals(d);
    expect(metrics.paymentsToday).toBe(e.paymentsToday);
    expect(metrics.revenueToday).toBe(e.paymentsTodayTotal);
    expect(metrics.unpaidInvoiceCount).toBe(e.unpaidInvoices);
    expect(metrics.unpaidInvoiceTotal).toBe(e.unpaidTotal);
    expect(metrics.overdueInvoiceCount).toBe(e.overdueInvoices);
    expect(metrics.overdueInvoiceTotal).toBe(e.overdueTotal);
    expect(metrics.staleEstimateCount).toBe(e.staleEstimates);
    expect(metrics.staleEstimateTotal).toBe(e.staleTotal);
    expect(metrics.openJobCount).toBe(e.openJobs);
    expect(metrics.stuckJobCount).toBe(e.stuckJobs);
    expect(metrics.completedNotInvoicedCount).toBe(e.completedNotInvoiced);
    expect(metrics.lowInventoryCount).toBe(e.lowInventory);
    expect(metrics.repairCasesToday).toBe(e.repairCasesToday);
  });

  it('Revenue Today (browser, invoices paid today) is $3,860 in USD only', () => {
    expect(browserRevenueToday(d, now)).toEqual({ USD: 3860 });
    expect(expectedTotals(d).revenueToday).toBe(3860);
  });

  it('the not-yet-invoiced completed jobs are worth $2,180 at the shop labor rate', () => {
    expect(expectedTotals(d).completedNotInvoicedValue).toBe(2180);
  });

  it('shop health is what the existing rule computes — reported, not tuned', async () => {
    const { metrics } = await calculateShopMetrics(SHOP);
    // 100 − overdue 10 − stale 10 − stuck 15 − not invoiced 15 − low stock 10.
    expect(metrics.shopHealthScore).toBe(40);
  });

  it('the existing rules produce 5 open recommendations: 0 critical, 2 high, 3 medium', async () => {
    const { metrics } = await calculateShopMetrics(SHOP);
    const signals = extractSignalsFromMetrics(metrics);
    const recs = ALL_RULES.map(r => r.evaluate({ shopId: SHOP, now, signals, rawData: {} })).filter(Boolean);
    const byKey = Object.fromEntries(recs.map(r => [r!.recommendationKey, r!.priority]));
    expect(byKey).toEqual({
      unpaid_invoices: 'high',
      completed_job_not_invoiced: 'high',
      stale_estimates: 'medium',
      low_inventory: 'medium',
      stuck_repair_order: 'medium',
    });
    expect(recs.filter(r => r!.priority === 'critical')).toHaveLength(0);
  });
});

describe('volumes requested for the demo', () => {
  const d = buildSummitDataset(new Date(RUN_TIMES[0]));
  const e = expectedTotals(d);

  it('has 12–18 customers, 15–25 vehicles, 4 technicians plus an owner/manager', () => {
    expect(e.customers).toBeGreaterThanOrEqual(12);
    expect(e.customers).toBeLessThanOrEqual(18);
    expect(e.vehicles).toBeGreaterThanOrEqual(15);
    expect(e.vehicles).toBeLessThanOrEqual(25);
    expect(d.technicians.filter(t => /manager/i.test(t.role))).toHaveLength(1);
    expect(d.technicians.filter(t => !/manager/i.test(t.role))).toHaveLength(4);
  });

  it('has 5 jobs completed this month, 2 high-priority job cards, and 1 stuck repair order', () => {
    expect(e.completedThisMonth).toBe(5);
    expect(e.highPriorityJobs).toBe(2);
    expect(d.repairOrders.filter(r => r.status === 'Pending Parts')).toHaveLength(1);
  });

  it('prices every document in USD, with totals that are whole multiples of $10', () => {
    // services/invoiceService formatMoney rounds UP to the nearest 10 on the
    // invoice and payment screens; round totals read identically everywhere.
    for (const doc of [...d.invoices, ...d.estimates]) {
      expect(doc.currency).toBe('USD');
      expect(lineTotal(doc.lines) % 10).toBe(0);
    }
    for (const p of d.payments) {
      expect(p.currency).toBe('USD');
      expect(p.amount % 10).toBe(0);
    }
    expect(d.parts.every(p => p.currency === SUMMIT.currency)).toBe(true);
  });
});
