/**
 * What the customer portal shows for money. Pure: rows in, portal shapes out.
 *
 * The portal used to read columns that nothing in the app writes — invoices
 * `subtotal`, `tax`, `invoice_number`, `amount_paid`; estimates `line_items`,
 * `total` — so every total, balance and line item came out as $0 or empty.
 * It also hardcoded "$" whatever the document's currency.
 *
 * These now go through the same arithmetic the staff screens use
 * (invoiceMath, estimateMath, repairOrderMath) and the same payment netting
 * as receivables, so the portal cannot disagree with the shop about what a
 * customer owes.
 */
import { mapInvoiceRow, calculateTotals, getEffectiveTotal } from '@/lib/domain/invoiceMath';
import { mapPaymentRow } from '@/lib/domain/payments';
import { SETTLED_STATUSES } from '@/lib/domain/receivables';
import { calculateEstimateTotals } from '@/lib/domain/estimateMath';
import { calcROTotal } from '@/lib/domain/repairOrderMath';
import { SHOP_PRICING_DEFAULTS } from '@/lib/shopPricingDefaults';
import type { PortalInvoice, PortalEstimate, PortalLineItem, PortalRO } from '@/services/portalService';

type Row = Record<string, unknown>;

/** Statuses a customer should not see at all. */
const HIDDEN_INVOICE_STATUSES = new Set(['Void', 'Cancelled']);

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function portalInvoicesFrom(invoiceRows: readonly Row[], paymentRows: readonly Row[]): PortalInvoice[] {
  // invoice number → currency → net paid. Reversals are negative entries, so
  // a plain sum is already net of them.
  const paid = new Map<string, Map<string, number>>();
  for (const p of paymentRows.map(mapPaymentRow)) {
    if (!p.invoiceNumber) continue;
    const byCur = paid.get(p.invoiceNumber) ?? new Map<string, number>();
    byCur.set(p.currency, (byCur.get(p.currency) ?? 0) + p.amount);
    paid.set(p.invoiceNumber, byCur);
  }

  return invoiceRows
    .map(mapInvoiceRow)
    .filter(inv => !HIDDEN_INVOICE_STATUSES.has(inv.status))
    .map(inv => {
      const t = calculateTotals(inv);
      const { amount: total, currency } = getEffectiveTotal(inv);
      // An invoice entirely in one foreign currency is worth that currency's
      // lines; getEffectiveTotal already picked them.
      const allForeign = currency !== inv.currency;
      const subtotal = allForeign ? t.byCurrency[currency] ?? 0 : t.subtotal;
      const beforeTax = Math.max(subtotal - inv.discount, 0) + inv.shopSupplies;
      const amountPaid = money(paid.get(inv.invoiceNumber)?.get(currency) ?? 0);
      // Draft, Paid, Cancelled and Void are not owed — the same rule the
      // shop's receivables screen uses.
      const owed = !SETTLED_STATUSES.has(inv.status);
      return {
        id: inv.invoiceNumber,
        invoiceNumber: inv.invoiceNumber,
        date: inv.createdAt,
        dueDate: inv.dueDate,
        status: inv.status,
        vehicle: inv.vehicle,
        currency,
        subtotal: money(subtotal),
        tax: money(total - beforeTax),
        discount: inv.discount,
        shopSupplies: inv.shopSupplies,
        total: money(total),
        amountPaid,
        balance: owed ? Math.max(0, money(total - amountPaid)) : 0,
        notes: inv.notes,
      };
    });
}

export function portalEstimatesFrom(rows: readonly Row[]): PortalEstimate[] {
  return rows.map(r => {
    const currency = (r.currency as string) || 'USD';
    const lines = (Array.isArray(r.lines) ? r.lines : []) as Row[];
    const parsed = lines.map(l => ({
      description: String(l.description ?? ''),
      qty: Number(l.qty ?? 1),
      rate: Number(l.rate ?? 0),
      currency: (l.currency as string) || currency,
    }));
    const t = calculateEstimateTotals({
      currency,
      lines: parsed,
      discount: Number(r.discount ?? 0),
      taxRate: Number(r.tax_rate ?? 0),
    });
    const lineItems: PortalLineItem[] = parsed.map(l => ({
      description: l.description,
      qty: l.qty,
      unitPrice: l.rate,
      total: money(l.qty * l.rate),
      currency: l.currency,
    }));
    return {
      id: r.id as string,
      estimateNumber: (r.estimate_number as string) || '',
      date: (r.created_at as string) || '',
      status: (r.status as string) || '',
      vehicle: (r.vehicle as string) || '',
      currency,
      subtotal: money(t.subtotal),
      tax: money(t.tax),
      total: money(t.total),
      notes: (r.notes as string) || '',
      lineItems,
    };
  });
}

export function portalRepairOrdersFrom(rows: readonly Row[]): PortalRO[] {
  return rows.map(r => {
    const laborHours = Number(r.labor_hours ?? 0);
    const laborRate = Number(r.labor_rate ?? SHOP_PRICING_DEFAULTS.laborRate);
    const parts = Array.isArray(r.parts) ? (r.parts as { qty: number; unitCost: number }[]) : [];
    const laborTotal = laborHours * laborRate;
    const total = calcROTotal({ laborHours, laborRate, partsTotal: Number(r.parts_total ?? 0), parts });
    return {
      roNumber: (r.ro_number as string) || '',
      date: (r.opened_date as string) || '',
      status: (r.status as string) || '',
      vehicle: (r.vehicle as string) || '',
      concern: (r.concern as string) || '',
      cause: (r.cause as string) || '',
      correction: (r.correction as string) || '',
      currency: (r.currency as string) || 'USD',
      laborTotal: money(laborTotal),
      partsTotal: money(total - laborTotal),
      total: money(total),
    };
  });
}
