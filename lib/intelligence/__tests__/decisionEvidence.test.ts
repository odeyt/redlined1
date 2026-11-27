import {
  buildDecision, isDecisionKey, vehicleLabel, estimateTotal, daysAgoIso,
  selectUnpaidInvoices, selectStaleEstimates, selectApprovedEstimates,
  selectDeclinedEstimates, selectCompletedNotInvoiced, selectStuckJobs,
  selectLowInventory, summarizeUnpaid, MAX_RECORDS,
} from '../decisionEvidence';
import { mapInvoiceRow } from '@/lib/domain/invoiceMath';
import { mapPaymentRow } from '@/lib/domain/payments';

const NOW = new Date('2026-11-27T10:00:00Z');
const TODAY = '2026-11-27';
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function invoice(number: string, amount: number, extra: Record<string, unknown> = {}) {
  return mapInvoiceRow({
    number, customer: `Customer ${number}`, vehicle: 'Toyota Hilux', status: 'Sent',
    lines: [{ description: 'Work', note: '', qty: 1, rate: amount }],
    discount: 0, shop_supplies: 0, tax_rate: 0, currency: 'THB', due_date: TODAY, ...extra,
  });
}
function payment(invoiceNumber: string, amount: number, currency = 'THB') {
  return mapPaymentRow({ id: `p-${invoiceNumber}-${amount}`, invoice_number: invoiceNumber, amount, currency, status: 'Recorded' });
}

describe('selectUnpaidInvoices', () => {
  it('lists only invoices with a balance, overdue first, with the balance net of payments', () => {
    const records = selectUnpaidInvoices([
      invoice('INV-1', 1000, { due_date: '2026-11-20' }),           // 7 days overdue, part paid
      invoice('INV-2', 500, { due_date: '2026-11-07' }),            // 20 days overdue
      invoice('INV-3', 800),                                         // due today
      invoice('INV-4', 300),                                         // fully paid
      invoice('INV-5', 900, { status: 'Draft' }),                    // drafts are not owed
    ], [payment('INV-1', 400), payment('INV-4', 300)], TODAY);

    expect(records.map(r => [r.label, r.amount, r.ageDays])).toEqual([
      ['INV-2', 500, 20],
      ['INV-1', 600, 7],
      ['INV-3', 800, 0],
    ]);
    expect(records[0].note).toBe('20 days overdue');
    expect(records[2].note).toBe(`due ${TODAY}`);
    expect(records[0].currency).toBe('THB');
  });
});

describe('summarizeUnpaid', () => {
  it('counts, totals per currency, and finds the most overdue and the largest balance per currency', () => {
    const records = selectUnpaidInvoices([
      invoice('INV-1', 1000, { due_date: '2026-11-20' }),            // 600 owed after payment, 7 days overdue
      invoice('INV-2', 500, { due_date: '2026-11-07' }),             // 20 days overdue
      invoice('INV-3', 800),                                          // due today
      invoice('INV-4', 40, { currency: 'USD', due_date: '2026-11-25' }),
      invoice('INV-5', 900, { status: 'Draft' }),                     // never owed
    ], [payment('INV-1', 400)], TODAY);

    const s = summarizeUnpaid(records);
    expect(s.count).toBe(4);
    expect(s.overdueCount).toBe(3);
    expect(s.totals).toEqual({ THB: 1900, USD: 40 });
    expect(s.oldestOverdue?.label).toBe('INV-2');
    expect(s.largestByCurrency.map(r => [r.label, r.amount, r.currency])).toEqual([
      ['INV-3', 800, 'THB'],
      ['INV-4', 40, 'USD'],
    ]);
  });

  it('reports no overdue invoice when none is past due', () => {
    const s = summarizeUnpaid(selectUnpaidInvoices([invoice('INV-1', 100)], [], TODAY));
    expect(s.overdueCount).toBe(0);
    expect(s.oldestOverdue).toBeNull();
  });
});

describe('estimates', () => {
  const rows = [
    { id: 'a', estimate_number: 'EST-1', customer_name: 'Somchai', status: 'Draft', created_at: daysBefore(10), lines: [{ qty: 2, rate: 1500 }], currency: 'THB' },
    { id: 'b', estimate_number: 'EST-2', customer_name: 'Noy', status: 'Sent', created_at: daysBefore(1), lines: [{ qty: 1, rate: 100 }], currency: 'USD' },
    { id: 'c', estimate_number: 'EST-3', customer_name: 'Bounmy', status: 'Pending', created_at: daysBefore(5), lines: [{ qty: 1, rate: 200 }], currency: 'USD' },
    { id: 'd', estimate_number: 'EST-4', status: 'Approved', created_at: daysBefore(9), approved_date: daysBefore(4), lines: [] },
    { id: 'e', estimate_number: 'EST-5', status: 'Declined', created_at: daysBefore(30), lines: [{ qty: 1, rate: 50 }] },
    { id: 'f', estimate_number: 'EST-6', status: 'Declined', created_at: daysBefore(2), lines: [{ qty: 1, rate: 70 }] },
  ];

  it('stale: open estimates older than the cutoff, oldest first', () => {
    const records = selectStaleEstimates(rows, NOW);
    expect(records.map(r => r.label)).toEqual(['EST-1', 'EST-3']);
    expect(records[0]).toMatchObject({ amount: 3000, currency: 'THB', ageDays: 10, customer: 'Somchai' });
    expect(records[0].note).toBe('Draft, 10 days without an answer');
  });

  it('approved: measured from the approval date', () => {
    const records = selectApprovedEstimates(rows, NOW);
    expect(records.map(r => [r.label, r.ageDays])).toEqual([['EST-4', 4]]);
    expect(records[0].amount).toBeNull();
  });

  it('declined: most recent first', () => {
    expect(selectDeclinedEstimates(rows, NOW).map(r => r.label)).toEqual(['EST-6', 'EST-5']);
  });

  it('totals an estimate the way the Estimates screen does (no shop supplies, own-currency lines only)', () => {
    expect(estimateTotal({
      currency: 'USD', discount: 10, tax_rate: 0.1,
      lines: [{ qty: 1, rate: 100 }, { qty: 1, rate: 5000, currency: 'THB' }],
    })).toEqual({ amount: 99, currency: 'USD' });
  });
});

describe('job cards', () => {
  const rows = [
    { id: 'JC-1', customer: 'A', status: 'Completed', check_in_date: daysBefore(6), invoice: null },
    { id: 'JC-2', customer: 'B', status: 'Closed', check_in_date: daysBefore(3), invoice: 'INV-9' },
    { id: 'JC-3', customer: 'C', status: 'In Progress', check_in_date: daysBefore(5), invoice: null },
    { id: 'JC-4', customer: 'D', status: 'Waiting', check_in_date: daysBefore(1), invoice: null },
    { id: 'JC-5', customer: 'E', status: 'Invoiced', check_in_date: daysBefore(8), invoice: '' },
  ];

  it('completed not invoiced: closed statuses with no invoice, oldest first', () => {
    expect(selectCompletedNotInvoiced(rows, NOW).map(r => r.label)).toEqual(['JC-5', 'JC-1']);
  });

  it('stuck: active jobs checked in before the cutoff', () => {
    const records = selectStuckJobs(rows, NOW);
    expect(records.map(r => r.label)).toEqual(['JC-3']);
    expect(records[0].note).toBe('In Progress, 5 days in the shop');
  });

  it('uses the same midnight cutoff as MetricsBuilder', () => {
    const cutoff = new Date(daysAgoIso(NOW, 2));
    expect(cutoff.getHours()).toBe(0);
    expect(cutoff.getMinutes()).toBe(0);
  });
});

describe('selectLowInventory', () => {
  it('compares with each part threshold, 5 when unset, emptiest first', () => {
    const records = selectLowInventory([
      { part_number: 'BP-1', description: 'Brake pads', quantity: 3, low_stock_threshold: 2 },   // fine
      { part_number: 'OF-1', description: 'Oil filter', quantity: 4, low_stock_threshold: null }, // 4 <= 5
      { part_number: 'SP-1', description: 'Spark plug', quantity: 0, low_stock_threshold: 10 },
    ]);
    expect(records.map(r => [r.label, r.detail, r.note])).toEqual([
      ['SP-1', 'Spark plug', '0 left, reorder at 10'],
      ['OF-1', 'Oil filter', '4 left, reorder at 5'],
    ]);
  });
});

describe('vehicleLabel', () => {
  it('removes a VIN wherever it appears', () => {
    expect(vehicleLabel('2018 Toyota Hilux (MR0FZ29G601234567)')).toBe('2018 Toyota Hilux');
    expect(vehicleLabel('JTDKN3DU5A0123456')).toBeNull();
    expect(vehicleLabel('Ford Ranger · ກຂ 1234')).toBe('Ford Ranger · ກຂ 1234');
    expect(vehicleLabel(null)).toBeNull();
  });
});

describe('buildDecision', () => {
  it('counts and totals every record but lists only the first few', () => {
    const invoices = Array.from({ length: 7 }, (_, i) => invoice(`INV-${i + 1}`, 100 * (i + 1)));
    invoices.push(invoice('INV-USD', 40, { currency: 'USD' }));
    const records = selectUnpaidInvoices(invoices, [], TODAY);
    const d = buildDecision('unpaid_invoices', records, NOW);

    expect(d.recordCount).toBe(8);
    expect(d.records).toHaveLength(MAX_RECORDS);
    expect(d.totals).toEqual({ THB: 2800, USD: 40 });
    expect(d.impact).toContain('Collecting all 8 invoices brings in');
    expect(d.impact).toContain('$40.00');
    expect(d.actions.map(a => a.module)).toEqual(['receivables', 'invoices']);
    expect(d.asOf).toBe(NOW.toISOString());
  });

  it('names the overdue invoices to chase first', () => {
    const records = selectUnpaidInvoices([invoice('INV-1', 100, { due_date: '2026-11-01' })], [], TODAY);
    expect(buildDecision('unpaid_invoices', records, NOW).nextStep)
      .toBe('Call about the 1 overdue invoice first, starting with INV-1 (Customer INV-1).');
  });

  it('says so plainly when nothing matches any more', () => {
    const d = buildDecision('stuck_repair_order', [], NOW);
    expect(d.recordCount).toBe(0);
    expect(d.impact).toBe('No records found.');
  });

  it('only backs the recommendation keys it knows', () => {
    expect(isDecisionKey('low_inventory')).toBe(true);
    expect(isDecisionKey('revenue_dip')).toBe(false);
  });
});
