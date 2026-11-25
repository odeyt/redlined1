/**
 * The totals printed on an emailed estimate or invoice (PDF and email body).
 *
 * They were computed inline in app/api/send-document/route.ts by adding up
 * EVERY line, whatever its currency, so an estimate in THB with one USD part
 * showed a subtotal, tax and total that added baht and dollars together. The
 * staff screens never did: they total only the lines in the document's own
 * currency. A customer could be emailed a different total from the one the
 * advisor saw.
 *
 * These use the screens' own arithmetic, so the two cannot disagree:
 *
 *   Estimates  calculateEstimateTotals (lib/domain/estimateMath): lines in the
 *              estimate's currency only; legacy shop_supplies ignored, as the
 *              screen has ignored them since the "phantom $10" fix.
 *   Invoices   calculateTotals / getEffectiveTotal (lib/domain/invoiceMath):
 *              lines in the invoice's currency; an invoice whose lines are
 *              all in ONE other currency is totalled in that currency, as the
 *              invoice list and print view show it.
 *
 * Lines in another currency are still listed, each in its own currency; they
 * are only left out of the totals.
 *
 * One deliberate difference from the screens: a missing tax_rate reads as 0,
 * as the email always did. (mapInvoiceRow defaults a null rate to 0.08, a
 * US sales-tax guess this must not start charging customers in Laos.)
 */
import { calculateEstimateTotals } from '@/lib/domain/estimateMath';
import { calculateTotals, getEffectiveTotal, mapInvoiceRow } from '@/lib/domain/invoiceMath';

export interface EmailTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** The currency the totals are in; the document's, unless all-foreign. */
  currency: string;
}

type Row = Record<string, unknown>;

/**
 * To the cent, as both the screen and the email display them. The screens'
 * arithmetic is unrounded (3000 × 0.07 is 210.00000000000003); rounding here
 * changes no displayed figure and keeps float noise out of the document.
 */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

function rounded(t: EmailTotals): EmailTotals {
  return { ...t, subtotal: cents(t.subtotal), discount: cents(t.discount), tax: cents(t.tax), total: cents(t.total) };
}

/** The route's own line reading, so the listed lines and the totals agree. */
function lineValues(d: Row, docCurrency: string) {
  return ((d.lines ?? []) as Row[]).map(l => ({
    qty: Number(l.qty ?? 1),
    rate: Number(l.rate ?? 0),
    currency: (l.currency as string) || docCurrency,
  }));
}

export function estimateEmailTotals(d: Row): EmailTotals {
  const currency = (d.currency as string) || 'USD';
  const t = calculateEstimateTotals({
    currency,
    lines: lineValues(d, currency),
    discount: Number(d.discount ?? 0),
    taxRate: Number(d.tax_rate ?? 0),
  });
  return rounded({ subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total, currency });
}

export function invoiceEmailTotals(d: Row): EmailTotals {
  const currency = (d.currency as string) || 'USD';
  const inv = {
    ...mapInvoiceRow(d),
    currency,
    taxRate: Number(d.tax_rate ?? 0),
    lines: lineValues(d, currency).map(l => ({ ...l, description: '', note: '' })),
  };
  const t = calculateTotals(inv);
  const effective = getEffectiveTotal(inv);

  if (effective.currency !== currency) {
    // Every line is in one other currency: total in that currency, exactly
    // as getEffectiveTotal does (tax rounded to a whole unit there).
    const subtotal = t.byCurrency[effective.currency] ?? 0;
    const taxable = Math.max(subtotal - inv.discount, 0) + inv.shopSupplies;
    return rounded({
      subtotal,
      discount: inv.discount,
      tax: Math.round(taxable * inv.taxRate),
      total: effective.amount,
      currency: effective.currency,
    });
  }
  return rounded({ subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total, currency });
}
