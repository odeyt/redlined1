/**
 * API v1 estimates and invoices: query parsing and the public shapes.
 *
 * Pure (no database) so every rule below is unit-tested directly.
 *
 * What the public shape leaves out, on purpose:
 *   - line `cost` and `markup`: the shop's internal margin. A bot drafting
 *     for a customer must never be able to read or leak it.
 *   - `partsSource`: procurement metadata.
 *   - `shop_id`: tenancy belongs to the key, not the document.
 * Totals are computed here from the same functions the staff screens use
 * (estimateMath, invoiceMath), never read from the caller or stored.
 */
import { ApiError } from './errors';
import { calculateEstimateTotals } from '@/lib/domain/estimateMath';
import { calculateTotals, getEffectiveTotal } from '@/lib/domain/invoiceMath';
import type { EstimateRecord } from '@/lib/domain/estimates';
import type { InvoiceRecord } from '@/lib/domain/invoices';
import type { DomainPayment } from '@/lib/domain/payments';
import type { DocumentPageQuery } from '@/lib/domain/documentQuery';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

/** API status → the value stored in the table. PLAN.md §4. */
export const ESTIMATE_STATUSES: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  declined: 'Declined',
  converted: 'Converted',
  void: 'Void',
};

export const INVOICE_STATUSES: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  refunded: 'Refunded',
  void: 'Void',
};

/** Stored status → API status: lower case, spaces as underscores. */
export function apiStatus(stored: string): string {
  return (stored || 'Draft').trim().toLowerCase().replace(/\s+/g, '_');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/**
 * A customer id as the app makes them. NOT a uuid: lib/domain/customers.ts
 * creates `C-${Date.now()}` (e.g. C-1789703178771), and demo and imported
 * rows carry other text ids. Letters, digits, `-` and `_`, up to 64.
 * Shape-checked only, so a malformed id is a 422 rather than a database
 * error; whether it exists in the key's shop is the domain's question.
 */
export const CUSTOMER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function isCustomerId(value: string): boolean {
  return CUSTOMER_ID.test(value);
}

function invalid(reason: string): never {
  throw new ApiError('VALIDATION_FAILED', { reason });
}

/**
 * `?status=&customer_id=&created_since=&page=&page_size=` → a domain query.
 *
 * Bad values are refused (422) rather than ignored: a bot that misspells a
 * status and gets every document back would act on the wrong set.
 */
export function parseDocumentListQuery(url: URL, statuses: Record<string, string>): DocumentPageQuery {
  const p = url.searchParams;

  // Agreed in the plan, but the tables have no updated_at column to filter
  // on. Said plainly instead of silently ignored, so a poller is not handed
  // the full list every time.
  if (p.has('updated_since')) {
    invalid('updated_since is not supported yet. Use created_since, or poll a document by id for changes.');
  }

  const out: DocumentPageQuery = { page: 1, pageSize: DEFAULT_PAGE_SIZE };

  const page = p.get('page');
  if (page !== null) {
    const n = Number(page);
    if (!Number.isInteger(n) || n < 1) invalid('page must be a whole number of 1 or more.');
    out.page = n;
  }

  const size = p.get('page_size');
  if (size !== null) {
    const n = Number(size);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE_SIZE) invalid(`page_size must be between 1 and ${MAX_PAGE_SIZE}.`);
    out.pageSize = n;
  }

  const status = p.get('status');
  if (status !== null) {
    const stored = statuses[status.trim().toLowerCase()];
    if (!stored) invalid(`status must be one of: ${Object.keys(statuses).join(', ')}.`);
    out.status = stored;
  }

  const customerId = p.get('customer_id');
  if (customerId !== null) {
    if (!isCustomerId(customerId.trim())) invalid('customer_id must be a customer id, such as C-1789703178771.');
    out.customerId = customerId.trim();
  }

  const since = p.get('created_since');
  if (since !== null) {
    const t = Date.parse(since);
    if (!since.trim() || Number.isNaN(t)) invalid('created_since must be an ISO 8601 date or timestamp.');
    out.createdSince = new Date(t).toISOString();
  }

  return out;
}

export function pageMeta(q: DocumentPageQuery, total: number) {
  return {
    page: q.page,
    page_size: q.pageSize,
    total,
    has_more: q.page * q.pageSize < total,
  };
}

/** Two decimals, so float noise (0.1 + 0.2) never reaches a caller. */
export function money(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

interface AnyLine {
  description: string;
  laoDescription?: string;
  note: string;
  qty: number;
  rate: number;
  currency?: string;
}

/** The public line. An allowlist: anything not named here never leaves. */
export function presentLine(l: AnyLine, documentCurrency: string) {
  return {
    description: l.description ?? '',
    lao_description: l.laoDescription ?? '',
    note: l.note ?? '',
    qty: Number(l.qty) || 0,
    rate: Number(l.rate) || 0,
    currency: l.currency || documentCurrency,
    amount: money((Number(l.qty) || 0) * (Number(l.rate) || 0)),
  };
}

/**
 * Line amounts summed per currency.
 *
 * A document's subtotal counts only lines in its own currency (that is how
 * the staff screens total a mixed THB/USD estimate), so the other
 * currencies are reported here rather than dropped.
 */
export function lineTotalsByCurrency(lines: readonly AnyLine[], documentCurrency: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) {
    const c = l.currency || documentCurrency;
    out[c] = money((out[c] ?? 0) + (Number(l.qty) || 0) * (Number(l.rate) || 0));
  }
  return out;
}

export function presentEstimate(e: EstimateRecord) {
  const currency = e.currency || 'USD';
  const t = calculateEstimateTotals({ currency, lines: e.lines, discount: e.discount, taxRate: e.taxRate });
  return {
    id: e.id,
    number: e.estimateNumber,
    status: apiStatus(e.status),
    customer_id: e.customerId || null,
    customer_name: e.customerName,
    vehicle: e.vehicle,
    currency,
    lines: e.lines.map(l => presentLine(l, currency)),
    discount: money(e.discount),
    tax_rate: e.taxRate,
    totals: {
      subtotal: money(t.subtotal),
      discount: money(t.discount),
      tax: money(t.tax),
      total: money(t.total),
      line_totals_by_currency: lineTotalsByCurrency(e.lines, currency),
    },
    notes: e.notes,
    valid_until: e.validUntil || null,
    approved_at: e.approvedDate || null,
    created_at: e.createdAt || null,
    created_via: e.provenance.createdVia === 'api' ? 'api' : 'app',
  };
}

export interface Settlement {
  amount_paid: number;
  balance_due: number;
  overpaid: number;
  /** Payments in another currency: not converted, not counted. Look at these. */
  currency_mismatches: { currency: string; amount: number }[];
}

/**
 * What has been paid against an invoice, by the receivables report's rule:
 * reversals are negative entries, so a plain sum is already net; a payment
 * in a different currency is reported, never converted or added.
 */
export function settlementFor(
  total: { amount: number; currency: string },
  entries: readonly DomainPayment[],
): Settlement {
  let paid = 0;
  const mismatches = new Map<string, number>();
  for (const e of entries) {
    if (e.currency === total.currency) paid += e.amount;
    else mismatches.set(e.currency, money((mismatches.get(e.currency) ?? 0) + e.amount));
  }
  paid = money(paid);
  const raw = money(total.amount - paid);
  return {
    amount_paid: paid,
    balance_due: Math.max(0, raw),
    overpaid: raw < 0 ? money(-raw) : 0,
    currency_mismatches: [...mismatches.entries()].map(([currency, amount]) => ({ currency, amount })),
  };
}

export function presentInvoice(inv: InvoiceRecord, entries: readonly DomainPayment[]) {
  const currency = inv.currency || 'USD';
  const t = calculateTotals(inv);
  const effective = getEffectiveTotal(inv);
  return {
    number: inv.invoiceNumber,
    status: apiStatus(inv.status),
    customer_id: inv.customerId || null,
    customer_name: inv.customerName,
    vehicle: inv.vehicle,
    currency,
    lines: inv.lines.map(l => presentLine(l, currency)),
    discount: money(inv.discount),
    tax_rate: inv.taxRate,
    totals: {
      subtotal: money(t.subtotal),
      discount: money(t.discount),
      shop_supplies: money(t.shopSupplies),
      tax: money(t.tax),
      total: money(t.total),
      line_totals_by_currency: lineTotalsByCurrency(inv.lines, currency),
    },
    /** The single figure the staff screens show for this invoice. */
    amount_due: { amount: money(effective.amount), currency: effective.currency },
    ...settlementFor(effective, entries.filter(e => e.invoiceNumber === inv.invoiceNumber)),
    due_date: inv.dueDate || null,
    paid_date: inv.paidDate || null,
    notes: inv.notes,
    repair_order_id: inv.repairOrderId ?? null,
    estimate_id: inv.sourceEstimateId,
    created_at: inv.createdAt || null,
    created_via: inv.provenance.createdVia === 'api' ? 'api' : 'app',
  };
}
