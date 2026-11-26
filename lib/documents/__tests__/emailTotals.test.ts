/**
 * Emailed estimate/invoice totals must equal what the staff screens show.
 */
import { estimateEmailTotals, invoiceEmailTotals } from '../emailTotals';
import { calculateEstimateTotals } from '@/lib/domain/estimateMath';
import { getEffectiveTotal, mapInvoiceRow } from '@/lib/domain/invoiceMath';
import { taxAmount } from '@/lib/taxRate';

/** What the route computed before this fix, kept here to show the bug. */
function previousRouteTotals(d: Record<string, unknown>) {
  const lines = ((d.lines ?? []) as Record<string, unknown>[]).map(l => ({ qty: Number(l.qty ?? 1), rate: Number(l.rate ?? 0) }));
  const subtotal = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const discount = Number(d.discount ?? 0);
  const shopSupplies = Number(d.shop_supplies ?? 0);
  const tax = taxAmount(subtotal - discount + shopSupplies, Number(d.tax_rate ?? 0));
  return { subtotal, discount, tax, total: subtotal - discount + shopSupplies + tax };
}

const mixed = {
  currency: 'THB', discount: 0, tax_rate: 0.07, shop_supplies: 0,
  lines: [
    { description: 'Brake pads', qty: 2, rate: 1500 },                   // THB 3,000
    { description: 'Imported sensor', qty: 1, rate: 45, currency: 'USD' }, // USD 45
  ],
};

describe('a THB document with a USD line', () => {
  it('used to add the dollars into the baht total (the bug)', () => {
    expect(previousRouteTotals(mixed).subtotal).toBe(3045);
  });

  it('estimate: totals only the THB lines, as the screen does', () => {
    const t = estimateEmailTotals(mixed);
    expect(t).toEqual({ subtotal: 3000, discount: 0, tax: 210, total: 3210, currency: 'THB' });
    expect(t.total).toBe(calculateEstimateTotals({ currency: 'THB', lines: mixed.lines, discount: 0, taxRate: 0.07 }).total);
  });

  it('invoice: totals only the THB lines, as the screen does', () => {
    const t = invoiceEmailTotals(mixed);
    expect(t).toEqual({ subtotal: 3000, discount: 0, tax: 210, total: 3210, currency: 'THB' });
    expect(t.total).toBe(getEffectiveTotal({ ...mapInvoiceRow(mixed), taxRate: 0.07 }).amount);
  });
});

describe('an invoice whose lines are all in one other currency', () => {
  const allUsd = { currency: 'THB', discount: 0, tax_rate: 0.1, shop_supplies: 0,
    lines: [{ description: 'Part', qty: 2, rate: 40, currency: 'USD' }] };

  it('is totalled in that currency, as the invoice list shows it', () => {
    expect(invoiceEmailTotals(allUsd)).toEqual({ subtotal: 80, discount: 0, tax: 8, total: 88, currency: 'USD' });
    expect(getEffectiveTotal({ ...mapInvoiceRow(allUsd), taxRate: 0.1 })).toEqual({ amount: 88, currency: 'USD' });
  });

  it('used to print the dollar amount labelled as baht', () => {
    expect(previousRouteTotals(allUsd).total).toBe(88); // the number, formatted as THB 88.00
  });
});

describe('single-currency documents come out as before', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['no tax, no discount', { currency: 'USD', discount: 0, tax_rate: 0, lines: [{ qty: 2, rate: 125.5 }, { qty: 1, rate: 80 }] }],
    ['with tax', { currency: 'THB', discount: 0, tax_rate: 0.07, lines: [{ qty: 3, rate: 1000 }] }],
    ['with discount and tax', { currency: 'USD', discount: 50, tax_rate: 0.1, lines: [{ qty: 1, rate: 500 }, { qty: 2, rate: 25 }] }],
    ['lines naming the document currency', { currency: 'LAK', discount: 0, tax_rate: 0, lines: [{ qty: 1, rate: 250000, currency: 'LAK' }] }],
    ['no lines', { currency: 'USD', discount: 0, tax_rate: 0, lines: [] }],
  ];

  it.each(cases)('estimate: %s', (_name, d) => {
    const { currency, ...t } = estimateEmailTotals(d);
    expect(t).toEqual(previousRouteTotals(d));
    expect(currency).toBe(d.currency);
  });

  it.each(cases)('invoice: %s', (_name, d) => {
    const { currency, ...t } = invoiceEmailTotals({ ...d, shop_supplies: 0 });
    expect(t).toEqual(previousRouteTotals(d));
    expect(currency).toBe(d.currency);
  });
});

describe('deliberate single-currency differences, all toward the screens', () => {
  it('an estimate no longer adds legacy shop_supplies (the "phantom $10")', () => {
    const d = { currency: 'USD', discount: 0, tax_rate: 0, shop_supplies: 10, lines: [{ qty: 1, rate: 100 }] };
    expect(previousRouteTotals(d).total).toBe(110);
    expect(estimateEmailTotals(d).total).toBe(100);
  });

  it('an invoice keeps shop_supplies in its total, as the invoice screen does', () => {
    const d = { currency: 'USD', discount: 0, tax_rate: 0, shop_supplies: 10, lines: [{ qty: 1, rate: 100 }] };
    expect(invoiceEmailTotals(d).total).toBe(110);
  });

  it('a discount larger than the work stops at zero instead of going negative', () => {
    const d = { currency: 'USD', discount: 150, tax_rate: 0, lines: [{ qty: 1, rate: 100 }] };
    expect(previousRouteTotals(d).total).toBe(-50);
    expect(estimateEmailTotals(d).total).toBe(0);
  });

  it('a missing tax rate is still no tax (not the mapper\'s 8% default)', () => {
    expect(invoiceEmailTotals({ currency: 'USD', lines: [{ qty: 1, rate: 100 }] }).tax).toBe(0);
  });
});
