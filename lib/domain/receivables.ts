/**
 * What customers still owe, and how overdue it is.
 *
 * ## No new tables
 *
 * This is arithmetic over `invoices` and `payments`, which M2 already made
 * trustworthy: payments are append-only, a reversal is a negative entry
 * pointing at the entry it cancels, and every payment carries the invoice
 * number it belongs to. A balance is therefore the invoice total minus the sum
 * of its payments — and because reversals are negative, that sum is correct
 * without any special handling.
 *
 * The M0 audit reached the same conclusion: "Receivable aging — NEW (view) —
 * derived from AR; no table needed." A stored balance would be a second copy
 * of a sum that can drift from its parts, which is the bug this avoids rather
 * than the feature it lacks.
 *
 * ## Capabilities
 *
 * Gated on invoices.read AND payments.read rather than a separate
 * receivables.read. Anyone who can read both could compute this themselves, so
 * a third capability would suggest a boundary that does not exist. The
 * catalogue keeps receivables.read marked 'planned' and unused, rather than
 * enforcing something that adds nothing.
 *
 * ## Currency
 *
 * A payment in a different currency from its invoice is NOT converted and NOT
 * silently added. It is reported as a mismatch, because the alternatives are
 * to invent an exchange rate or to quietly understate what a customer owes.
 */
import type { DomainDeps } from './db';
import { requireCapability } from './context';
import { createInvoiceDomain } from './invoices';
import { createPaymentDomain } from './payments';
import { getEffectiveTotal, type InvoiceFull } from './invoiceMath';
import type { DomainPayment } from './payments';

export interface Receivable {
  invoiceNumber: string;
  customerName: string;
  customerId: string;
  vehicle: string;
  currency: string;
  /** What the invoice is worth. */
  total: number;
  /** Payments and reversals against it, netted. */
  paid: number;
  /** total − paid. Never negative; see `overpaid`. */
  balance: number;
  /** Anything paid beyond the total — a deposit, or a mistake worth seeing. */
  overpaid: number;
  dueDate: string;
  /** Days past due. Zero when not yet due or no due date is set. */
  daysOverdue: number;
  status: string;
  /**
   * Payments recorded against this invoice in some other currency, which are
   * therefore excluded from `paid`. Non-empty means the balance is unreliable
   * and a person needs to look.
   */
  currencyMismatches: { currency: string; amount: number }[];
}

export type AgingBucket = 'Not due' | '1–30' | '31–60' | '61–90' | '90+';

export const AGING_BUCKETS: readonly AgingBucket[] = ['Not due', '1–30', '31–60', '61–90', '90+'];

/** Invoice statuses that are not owed: nothing to chase. */
export const SETTLED_STATUSES: ReadonlySet<string> = new Set(['Paid', 'Cancelled', 'Void', 'Draft']);

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Whole days between two ISO dates, positive when `date` is in the past. */
export function daysBetween(date: string, today: string): number {
  const a = new Date(date + 'T00:00:00Z').getTime();
  const b = new Date(today + 'T00:00:00Z').getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function bucketFor(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'Not due';
  if (daysOverdue <= 30) return '1–30';
  if (daysOverdue <= 60) return '31–60';
  if (daysOverdue <= 90) return '61–90';
  return '90+';
}

/**
 * Turn invoices and payments into outstanding balances.
 *
 * Draft invoices are excluded deliberately: a draft has not been issued, so
 * nobody owes it. Including them would inflate what the business is owed by
 * work it has not billed for — and there were 26 stranded drafts in this
 * database from the August payment outage alone.
 */
export function receivablesFrom(
  invoices: readonly InvoiceFull[],
  payments: readonly DomainPayment[],
  today: string,
): Receivable[] {
  const byInvoice = new Map<string, DomainPayment[]>();
  for (const payment of payments) {
    if (!payment.invoiceNumber) continue;   // unallocated money; not a balance
    const list = byInvoice.get(payment.invoiceNumber) ?? [];
    list.push(payment);
    byInvoice.set(payment.invoiceNumber, list);
  }

  const out: Receivable[] = [];

  for (const invoice of invoices) {
    if (SETTLED_STATUSES.has(invoice.status)) continue;

    const { amount: total, currency } = getEffectiveTotal(invoice);
    const against = byInvoice.get(invoice.invoiceNumber) ?? [];

    // Reversals are negative entries, so a plain sum is already net of them.
    let paid = 0;
    const mismatches = new Map<string, number>();
    for (const payment of against) {
      if (payment.currency === currency) {
        paid += payment.amount;
      } else {
        mismatches.set(payment.currency, money((mismatches.get(payment.currency) ?? 0) + payment.amount));
      }
    }
    paid = money(paid);

    const rawBalance = money(total - paid);
    const daysOverdue = invoice.dueDate ? Math.max(0, daysBetween(invoice.dueDate, today)) : 0;

    out.push({
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      customerId: invoice.customerId,
      vehicle: invoice.vehicle,
      currency,
      total,
      paid,
      balance: Math.max(0, rawBalance),
      overpaid: rawBalance < 0 ? money(-rawBalance) : 0,
      dueDate: invoice.dueDate,
      daysOverdue,
      status: invoice.status,
      currencyMismatches: [...mismatches.entries()].map(([c, amount]) => ({ currency: c, amount })),
    });
  }

  // Fully settled invoices whose status was never updated still net to zero,
  // and nobody needs to chase them. An overpayment is kept: the balance is
  // zero, so it would otherwise disappear from the only screen that could
  // show it — and money taken beyond an invoice is either a deposit somebody
  // needs to allocate or a mistake somebody needs to refund.
  return out.filter(r =>
    r.balance > 0 || r.overpaid > 0 || r.currencyMismatches.length > 0);
}

/** Aging totals, per currency and per bucket. Never summed across currencies. */
export function agingSummary(
  receivables: readonly Receivable[],
): { currency: string; buckets: Record<AgingBucket, number>; total: number }[] {
  const byCurrency = new Map<string, Record<AgingBucket, number>>();

  for (const r of receivables) {
    const buckets = byCurrency.get(r.currency) ?? {
      'Not due': 0, '1–30': 0, '31–60': 0, '61–90': 0, '90+': 0,
    };
    const bucket = bucketFor(r.daysOverdue);
    buckets[bucket] = money(buckets[bucket] + r.balance);
    byCurrency.set(r.currency, buckets);
  }

  return [...byCurrency.entries()].map(([currency, buckets]) => ({
    currency,
    buckets,
    total: money(AGING_BUCKETS.reduce((sum, b) => sum + buckets[b], 0)),
  }));
}

/** What each customer owes, worst first. */
export function byCustomer(
  receivables: readonly Receivable[],
): { customerName: string; currency: string; balance: number; oldestDays: number; invoices: number }[] {
  // JSON rather than joining with a separator: a customer called "John USD"
  // would otherwise collide with John's USD row, and the resulting merged
  // total would look entirely plausible.
  const key = (r: Receivable) => JSON.stringify([r.customerName, r.currency]);
  const totals = new Map<string, { customerName: string; currency: string; balance: number; oldestDays: number; invoices: number }>();

  for (const r of receivables) {
    const current = totals.get(key(r)) ?? {
      customerName: r.customerName, currency: r.currency,
      balance: 0, oldestDays: 0, invoices: 0,
    };
    current.balance = money(current.balance + r.balance);
    current.oldestDays = Math.max(current.oldestDays, r.daysOverdue);
    current.invoices += 1;
    totals.set(key(r), current);
  }

  return [...totals.values()].sort((a, b) => b.oldestDays - a.oldestDays || b.balance - a.balance);
}

export function createReceivablesDomain(deps: DomainDeps) {
  const { context } = deps;

  /**
   * Every unpaid invoice with what is still owed on it.
   *
   * `today` is passed in rather than read from the clock so the result is
   * reproducible: a report that quietly depends on when it ran cannot be
   * tested, and two people opening it either side of midnight would disagree.
   */
  async function list(today?: string): Promise<Receivable[]> {
    requireCapability(context, 'invoices.read', 'see what customers owe');
    requireCapability(context, 'payments.read', 'see what customers owe');

    const invoiceDomain = createInvoiceDomain(deps);
    const paymentDomain = createPaymentDomain(deps);

    const [invoices, payments] = await Promise.all([
      invoiceDomain.list(),
      paymentDomain.list(),
    ]);

    return receivablesFrom(invoices, payments, today ?? new Date().toISOString().slice(0, 10));
  }

  return { list };
}
