/**
 * Command Center money figures: unpaid, overdue, revenue, stale estimates.
 *
 * Regression tests for the defects behind a wrong "Overdue Invoices" figure:
 *   - draft invoices (never issued) were counted as owed and overdue;
 *   - payments were ignored, so part-paid invoices showed their full total and
 *     fully paid invoices still in 'Sent' showed as overdue;
 *   - totals added THB to USD and displayed the sum as the shop currency.
 * The rule is now lib/domain/receivables, the one the Invoices screen uses.
 *
 * Runs the real MetricsBuilder against an in-memory database.
 */
import { createMemoryDb } from '@/lib/demo-seed/__tests__/support/memoryDb';
import type { MetricCalculationContext } from '@/intelligence/metrics/types';

type Row = Record<string, unknown>;
let mockDb = createMemoryDb({});
jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => mockDb }));

import {
  calculateInvoiceMetrics, calculateRevenueMetrics, calculateEstimateMetrics,
  calculateShopMetrics, isFresh, METRICS_CACHE_MAX_AGE_MS,
} from '@/intelligence/metrics/MetricsBuilder';

const SHOP = '11111111-1111-4111-8111-111111111111';
const OTHER_SHOP = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-09-24T12:00:00Z');
const TODAY = '2026-09-24';
const YESTERDAY = '2026-09-23';

function ctx(over: Partial<MetricCalculationContext> = {}): MetricCalculationContext {
  return {
    shopId: SHOP, now: NOW,
    todayStart: `${TODAY}T00:00:00.000Z`,
    yesterdayStart: `${YESTERDAY}T00:00:00.000Z`,
    yesterdayEnd: `${YESTERDAY}T23:59:59.999Z`,
    staleThresholdDays: 3, stuckThresholdDays: 2,
    currency: 'USD',
    ...over,
  };
}

/** An invoice worth `amount` in one line, no tax/discount. */
function inv(number: string, amount: number, over: Row = {}): Row {
  return {
    number, shop_id: SHOP, status: 'Sent', due_date: '2026-09-01',
    lines: [{ description: 'Labor', qty: 1, rate: amount }],
    discount: 0, shop_supplies: 0, tax_rate: 0, currency: 'USD',
    customer: 'Test Customer', ...over,
  };
}

function pay(invoiceNumber: string, amount: number, over: Row = {}): Row {
  return {
    id: `p-${invoiceNumber}-${amount}-${Math.random()}`, shop_id: SHOP,
    invoice_number: invoiceNumber, amount, currency: 'USD',
    status: 'Recorded', entry_type: 'payment', payment_date: TODAY, ...over,
  };
}

async function invoiceMetrics(invoices: Row[], payments: Row[] = [], c = ctx()) {
  mockDb = createMemoryDb({ invoices, payments });
  const warnings: string[] = [];
  const result = await calculateInvoiceMetrics(c, warnings);
  return { ...result, warnings };
}

describe('overdue and unpaid invoices', () => {
  it('a draft past its due date is neither unpaid nor overdue', async () => {
    const m = await invoiceMetrics([inv('D-1', 500, { status: 'Draft' })]);
    expect(m).toMatchObject({ unpaidInvoiceCount: 0, overdueInvoiceCount: 0, overdueInvoiceTotal: 0 });
  });

  it('a part-paid overdue invoice counts once, at its remaining balance', async () => {
    const m = await invoiceMetrics(
      [inv('INV-1', 1000)],
      [pay('INV-1', 300), pay('INV-1', 200)],   // two payments must not double the count
    );
    expect(m).toMatchObject({
      unpaidInvoiceCount: 1, unpaidInvoiceTotal: 500,
      overdueInvoiceCount: 1, overdueInvoiceTotal: 500,
    });
  });

  it('a fully paid invoice whose status was never updated is not overdue', async () => {
    const m = await invoiceMetrics([inv('INV-2', 400)], [pay('INV-2', 400)]);
    expect(m).toMatchObject({ unpaidInvoiceCount: 0, overdueInvoiceCount: 0 });
  });

  it('a reversed payment puts the balance back', async () => {
    const m = await invoiceMetrics(
      [inv('INV-3', 400)],
      [pay('INV-3', 400), pay('INV-3', -400, { entry_type: 'reversal' })],
    );
    expect(m).toMatchObject({ overdueInvoiceCount: 1, overdueInvoiceTotal: 400 });
  });

  it('Paid, Void and Cancelled invoices are excluded', async () => {
    const m = await invoiceMetrics([
      inv('P-1', 100, { status: 'Paid' }),
      inv('V-1', 100, { status: 'Void' }),
      inv('C-1', 100, { status: 'Cancelled' }),
    ]);
    expect(m.unpaidInvoiceCount).toBe(0);
  });

  it('due today is not overdue; due yesterday is', async () => {
    const m = await invoiceMetrics([
      inv('T-1', 100, { due_date: TODAY }),
      inv('Y-1', 250, { due_date: YESTERDAY }),
      inv('F-1', 50, { due_date: '2026-10-15' }),
    ]);
    expect(m).toMatchObject({
      unpaidInvoiceCount: 3, unpaidInvoiceTotal: 400,
      overdueInvoiceCount: 1, overdueInvoiceTotal: 250,
    });
  });

  it('an invoice with no due date is unpaid but never overdue', async () => {
    const m = await invoiceMetrics([inv('N-1', 100, { due_date: null })]);
    expect(m).toMatchObject({ unpaidInvoiceCount: 1, overdueInvoiceCount: 0 });
  });

  it("ignores another shop's invoices, and its payments on a same-numbered invoice", async () => {
    const m = await invoiceMetrics(
      [inv('INV-9', 800), inv('INV-9', 800, { shop_id: OTHER_SHOP })],
      [pay('INV-9', 800, { shop_id: OTHER_SHOP })],
    );
    expect(m).toMatchObject({ unpaidInvoiceCount: 1, overdueInvoiceCount: 1, overdueInvoiceTotal: 800 });
  });

  it('counts an overdue THB invoice but keeps it out of the USD total', async () => {
    const m = await invoiceMetrics([
      inv('USD-1', 100),
      inv('THB-1', 35000, { currency: 'THB' }),
    ]);
    expect(m).toMatchObject({
      unpaidInvoiceCount: 2, unpaidInvoiceTotal: 100,
      overdueInvoiceCount: 2, overdueInvoiceTotal: 100,
    });
    expect(m.warnings.join(' ')).toMatch(/1 overdue invoice\(s\) in another currency/);
  });

  it('a THB shop totals its THB invoices', async () => {
    const m = await invoiceMetrics(
      [inv('USD-1', 100), inv('THB-1', 35000, { currency: 'THB' })],
      [],
      ctx({ currency: 'THB' }),
    );
    expect(m).toMatchObject({ overdueInvoiceCount: 2, overdueInvoiceTotal: 35000 });
  });

  it('a payment in another currency does not reduce the balance', async () => {
    const m = await invoiceMetrics([inv('INV-4', 100)], [pay('INV-4', 3500, { currency: 'THB' })]);
    expect(m).toMatchObject({ overdueInvoiceCount: 1, overdueInvoiceTotal: 100 });
  });

  it('finds payments for more invoices than one query batch holds', async () => {
    const invoices = Array.from({ length: 320 }, (_, i) => inv(`B-${i}`, 100));
    const payments = invoices.map(r => pay(r.number as string, 40));
    const m = await invoiceMetrics(invoices, payments);
    expect(m).toMatchObject({ overdueInvoiceCount: 320, overdueInvoiceTotal: 320 * 60 });
  });

  it('a failed read reports a warning and zeros, never throws', async () => {
    mockDb = { from: () => { throw new Error('db down'); } } as unknown as typeof mockDb;
    const warnings: string[] = [];
    await expect(calculateInvoiceMetrics(ctx(), warnings)).resolves.toMatchObject({ overdueInvoiceCount: 0 });
    expect(warnings[0]).toMatch(/^invoices: /);
  });
});

describe('other Command Center money figures stay in the shop currency', () => {
  it('Revenue Today adds only shop-currency payments; the count includes all', async () => {
    mockDb = createMemoryDb({
      payments: [pay('A', 120), pay('B', 3500, { currency: 'THB' }), pay('C', 80, { status: 'Void' })],
    });
    const r = await calculateRevenueMetrics(ctx(), []);
    expect(r).toMatchObject({ revenueToday: 120, paymentsToday: 2 });
  });

  it('the stale-estimate total excludes estimates in another currency', async () => {
    const old = '2026-09-10T00:00:00.000Z';
    const est = (id: string, rate: number, currency: string) => ({
      id, shop_id: SHOP, status: 'Sent', created_at: old, currency,
      lines: [{ qty: 1, rate }], discount: 0, shop_supplies: 0, tax_rate: 0,
    });
    mockDb = createMemoryDb({ estimates: [est('E1', 900, 'USD'), est('E2', 40000, 'THB')] });
    const r = await calculateEstimateMetrics(ctx(), []);
    expect(r).toMatchObject({ staleEstimateCount: 2, staleEstimateTotal: 900 });
  });

  it('calculateShopMetrics reads the currency from shop_settings', async () => {
    mockDb = createMemoryDb({
      shop_settings: [{ shop_id: SHOP, default_currency: 'THB' }],
      invoices: [inv('USD-1', 100), inv('THB-1', 35000, { currency: 'THB' })],
    });
    const { metrics } = await calculateShopMetrics(SHOP);
    expect(metrics.overdueInvoiceTotal).toBe(35000);
    expect(metrics.overdueInvoiceCount).toBe(2);
  });
});

describe('metrics cache freshness', () => {
  const t0 = Date.parse('2026-09-24T10:00:00Z');
  it('serves a row calculated under five minutes ago', () => {
    expect(isFresh(new Date(t0).toISOString(), t0 + METRICS_CACHE_MAX_AGE_MS - 1)).toBe(true);
  });
  it('recalculates at five minutes, and for missing, invalid or future times', () => {
    expect(isFresh(new Date(t0).toISOString(), t0 + METRICS_CACHE_MAX_AGE_MS)).toBe(false);
    expect(isFresh(undefined, t0)).toBe(false);
    expect(isFresh('not a date', t0)).toBe(false);
    expect(isFresh(new Date(t0 + 60_000).toISOString(), t0)).toBe(false);
  });
});
