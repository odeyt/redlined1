/**
 * The customer portal's money must match the shop's screens.
 *
 * It read columns nothing writes (invoices subtotal/tax/invoice_number/
 * amount_paid, estimates line_items/total), so every total came out $0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { portalInvoicesFrom, portalEstimatesFrom, portalRepairOrdersFrom } from '../portalMoney';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const invoiceRow = (over: Record<string, unknown> = {}) => ({
  number: 'INV-0001', customer: 'Pat', customer_id: 'c1', vehicle: '2015 Civic',
  status: 'Sent', lines: [{ description: 'Brakes', qty: 1, rate: 635 }],
  discount: 0, shop_supplies: 0, tax_rate: 0.0635, notes: '', due_date: '2026-11-01',
  paid_date: null, created_at: '2026-10-12T10:00:00Z', currency: 'USD',
  ...over,
});

const payment = (amount: number, over: Record<string, unknown> = {}) => ({
  id: 'p' + amount, invoice_number: 'INV-0001', amount, currency: 'USD', entry_type: amount < 0 ? 'reversal' : 'payment',
  ...over,
});

describe('portal invoices', () => {
  it('totals $635 at 6.35% as $675.32, with $40.32 tax', () => {
    const [inv] = portalInvoicesFrom([invoiceRow()], []);
    expect(inv.subtotal).toBe(635);
    expect(inv.tax).toBe(40.32);
    expect(inv.total).toBe(675.32);
    expect(inv.balance).toBe(675.32);
    expect(inv.invoiceNumber).toBe('INV-0001');
    expect(inv.date).toBe('2026-10-12T10:00:00Z');
  });

  it('nets payments and reversals into the balance', () => {
    const [inv] = portalInvoicesFrom([invoiceRow()], [payment(500), payment(100), payment(-100)]);
    expect(inv.amountPaid).toBe(500);
    expect(inv.balance).toBe(175.32);
  });

  it('ignores payments against other invoices or in another currency', () => {
    const [inv] = portalInvoicesFrom([invoiceRow()], [
      payment(200, { invoice_number: 'INV-0002' }),
      payment(300, { currency: 'THB' }),
    ]);
    expect(inv.amountPaid).toBe(0);
  });

  it('shows nothing owed on draft or paid invoices, and hides void ones', () => {
    const rows = [
      invoiceRow({ number: 'A', status: 'Draft' }),
      invoiceRow({ number: 'B', status: 'Paid' }),
      invoiceRow({ number: 'C', status: 'Void' }),
    ];
    const out = portalInvoicesFrom(rows, []);
    expect(out.map(i => i.invoiceNumber)).toEqual(['A', 'B']);
    expect(out.every(i => i.balance === 0)).toBe(true);
  });

  it('reports an all-baht invoice in baht', () => {
    const [inv] = portalInvoicesFrom([invoiceRow({
      currency: 'USD', tax_rate: 0, lines: [{ description: 'Service', qty: 1, rate: 12000, currency: 'THB' }],
    })], []);
    expect(inv.currency).toBe('THB');
    expect(inv.total).toBe(12000);
  });
});

describe('portal estimates', () => {
  it('totals from stored lines and the tax fraction', () => {
    const [est] = portalEstimatesFrom([{
      id: 'e1', estimate_number: 'EST-0001', status: 'Sent', vehicle: 'Civic', currency: 'USD',
      lines: [{ description: 'Pads', qty: 2, rate: 50 }, { description: 'Labor', qty: 1, rate: 100 }],
      discount: 0, tax_rate: 0.0635, created_at: '2026-10-12T10:00:00Z',
    }]);
    expect(est.subtotal).toBe(200);
    expect(est.tax).toBe(12.7);
    expect(est.total).toBe(212.7);
    expect(est.lineItems).toHaveLength(2);
    expect(est.lineItems[0]).toMatchObject({ description: 'Pads', qty: 2, unitPrice: 50, total: 100, currency: 'USD' });
  });
});

describe('portal repair orders', () => {
  it('uses the live parts list like the staff screen', () => {
    const [ro] = portalRepairOrdersFrom([{
      ro_number: 'RO-1', labor_hours: 2, labor_rate: 100, parts_total: 999,
      parts: [{ qty: 2, unitCost: 25 }], currency: 'USD',
    }]);
    expect(ro.laborTotal).toBe(200);
    expect(ro.partsTotal).toBe(50);
    expect(ro.total).toBe(250);
  });
});

describe('portal page', () => {
  it('loads the customer shop settings, not a single-tenant row', () => {
    const src = read('app/portal/[token]/page.tsx');
    expect(src).not.toMatch(/\.eq\('id', 1\)/);
    expect(src).toMatch(/\.eq\('shop_id', custData\.shop_id\)/);
    expect(src).not.toMatch(/order\('date'/);
  });

  it('never shows a VIN', () => {
    expect(read('app/portal/[token]/page.tsx')).not.toMatch(/\bvin\b/);
    expect(read('app/portal/[token]/PortalClient.tsx')).not.toMatch(/\bvin\b|VIN:/);
  });
});
