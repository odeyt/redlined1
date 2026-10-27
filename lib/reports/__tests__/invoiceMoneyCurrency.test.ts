/**
 * Reports → invoice and payment totals must not add baht to dollars.
 *
 * Revenue, Outstanding, Payments, the monthly chart and customer spend added
 * every amount into one number shown with "$". Invoice value also came from
 * the `subtotal` and `tax` columns, which the app never writes (invoices store
 * lines), so invoice-based figures were near zero. Both are now per currency,
 * and an invoice's value is getEffectiveTotal, as on the Invoices screen.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  INVOICE_REPORT_COLUMNS, averagePaymentByCurrency, currenciesIn, hasMoney, invoiceValue,
  sumInvoices, sumPayments,
} from '../invoiceMoney';
import { formatMoneyTotals } from '@/lib/currencies';

const norm = (s: string) => s.replace(/[  \s]/g, '');

const thbInvoice = {
  number: 'INV-1', customer: 'A', status: 'Sent', currency: 'THB', discount: 0, shop_supplies: 0, tax_rate: 0,
  lines: [{ description: 'Brake pads', qty: 2, rate: 1500 }],
  // What the old code read: never written by the app.
  subtotal: null, tax: null,
};
const usdInvoice = {
  number: 'INV-2', customer: 'B', status: 'Sent', currency: 'USD', discount: 10, shop_supplies: 0, tax_rate: 0,
  lines: [{ description: 'Labor', qty: 1, rate: 110 }],
};

describe('invoice value', () => {
  it('comes from the lines, not the unwritten subtotal column', () => {
    expect(invoiceValue(thbInvoice)).toEqual({ amount: 3000, currency: 'THB' });
    expect(invoiceValue(usdInvoice)).toEqual({ amount: 100, currency: 'USD' });
  });

  it('follows lines priced entirely in another currency, as the Invoices screen does', () => {
    const v = invoiceValue({ ...usdInvoice, discount: 0, lines: [{ qty: 1, rate: 2500, currency: 'THB' }] });
    expect(v).toEqual({ amount: 2500, currency: 'THB' });
  });

  it('totals THB and USD invoices separately', () => {
    const t = sumInvoices([thbInvoice, usdInvoice, thbInvoice]);
    expect(t).toEqual({ THB: 6000, USD: 100 });
    expect(norm(formatMoneyTotals(t))).toBe('THB6,000.00+$100.00');
  });
});

describe('payments', () => {
  const pays = [
    { amount: 3000, currency: 'THB' },
    { amount: 1000, currency: 'THB' },
    { amount: 100, currency: 'USD' },
    { amount: 50, currency: null },
  ];

  it('totals each currency separately; no currency counts as USD', () => {
    expect(sumPayments(pays)).toEqual({ THB: 4000, USD: 150 });
  });

  it('averages within each currency', () => {
    expect(averagePaymentByCurrency(pays)).toEqual({ THB: 2000, USD: 75 });
  });
});

describe('helpers', () => {
  it('hasMoney and currenciesIn ignore zero amounts', () => {
    expect(hasMoney({})).toBe(false);
    expect(hasMoney({ THB: 0 })).toBe(false);
    expect(hasMoney({ USD: 5 })).toBe(true);
    expect(currenciesIn([{ USD: 5, THB: 0 }, { THB: 1, LAK: 0 }])).toEqual(['THB', 'USD']);
  });

  it('selects every column getEffectiveTotal needs', () => {
    for (const c of ['lines', 'discount', 'shop_supplies', 'tax_rate', 'currency', 'status', 'customer', 'created_at']) {
      expect(INVOICE_REPORT_COLUMNS).toContain(c);
    }
  });
});

describe('Reports screen wiring', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../../features/reports/ReportsView.tsx'), 'utf8');

  it('no longer reads the unwritten invoice subtotal and tax columns', () => {
    expect(src).not.toMatch(/subtotal/);
    expect(src).not.toMatch(/calcInvTotal/);
  });

  it('no longer formats money with a hardcoded dollar sign', () => {
    expect(src).not.toMatch(/'\$' \+/);
    expect(src).toMatch(/const fmtMoney = formatMoneyTotals;/);
  });
});
