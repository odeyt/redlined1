/**
 * Invoice and payment money for Reports, kept per currency.
 *
 * Invoices and payments are in THB or USD (D1 works in both), and there are no
 * exchange rates. Reports used to add every amount into one number shown with
 * "$", so baht were reported as dollars.
 *
 * Invoice value also came from the `subtotal` and `tax` columns, which the app
 * never writes: an invoice stores its lines and rates. So invoice-based figures
 * (Outstanding, Voided, paid invoices, customer spend) were near zero or
 * negative. They now use getEffectiveTotal, the same total and currency the
 * Invoices screen, Dashboard and receivables use.
 */
import { addMoney, type MoneyTotals } from '@/lib/currencies';
import { getEffectiveTotal, mapInvoiceRow } from '@/lib/domain/invoiceMath';

/** Columns getEffectiveTotal needs, plus those Reports filters and groups by. */
export const INVOICE_REPORT_COLUMNS =
  'number, customer, status, lines, discount, shop_supplies, tax_rate, currency, created_at';

/** What one `invoices` row is worth, in its own currency. */
export function invoiceValue(row: Record<string, unknown>): { amount: number; currency: string } {
  return getEffectiveTotal(mapInvoiceRow(row));
}

/** Invoice totals per currency. */
export function sumInvoices(rows: readonly Record<string, unknown>[]): MoneyTotals {
  const out: MoneyTotals = {};
  for (const r of rows) {
    const { amount, currency } = invoiceValue(r);
    addMoney(out, currency, amount);
  }
  return out;
}

interface PaymentLike { amount?: unknown; currency?: unknown }

function paymentCurrency(p: PaymentLike): string | null {
  return typeof p.currency === 'string' ? p.currency : null;
}

/** Payment totals per currency. A payment with no currency counts as USD, as payments default to. */
export function sumPayments(rows: readonly PaymentLike[]): MoneyTotals {
  const out: MoneyTotals = {};
  for (const p of rows) addMoney(out, paymentCurrency(p), Number(p.amount ?? 0));
  return out;
}

/** Average payment within each currency: baht payments are averaged with baht only. */
export function averagePaymentByCurrency(rows: readonly PaymentLike[]): MoneyTotals {
  const totals = sumPayments(rows);
  const counts: MoneyTotals = {};
  for (const p of rows) addMoney(counts, paymentCurrency(p), 1);
  const out: MoneyTotals = {};
  for (const [c, total] of Object.entries(totals)) out[c] = counts[c] ? total / counts[c] : 0;
  return out;
}

/** True when any currency has a non-zero amount. */
export function hasMoney(totals: MoneyTotals): boolean {
  return Object.values(totals).some(v => v !== 0);
}

/** Currencies with a non-zero amount in any of these totals, in code order. */
export function currenciesIn(list: readonly MoneyTotals[]): string[] {
  const out = new Set<string>();
  for (const t of list) for (const [c, v] of Object.entries(t)) if (v !== 0) out.add(c);
  return [...out].sort();
}
