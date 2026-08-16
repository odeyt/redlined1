/**
 * Invoice shape and arithmetic. Pure — no database, no tenancy, no browser.
 *
 * Moved here from services/invoiceService.ts so that the domain layer, a route
 * handler and a future AI tool can compute an invoice total without importing
 * the browser Supabase client. The service re-exports every name below, so
 * every existing import keeps working and there remains exactly ONE
 * implementation of these totals.
 *
 * Multi-currency is the subtle part: each line may carry its own currency, the
 * invoice-level subtotal counts only lines in the base currency, and
 * getEffectiveTotal picks the single number to display when an invoice is
 * entirely in one foreign currency. Changing any of that changes what
 * customers are billed.
 */
export interface InvoiceLine {
  note: string;
  description: string;
  laoDescription?: string;
  qty: number;
  rate: number;
  cost?: number;
  markup?: number;
  currency?: string;
}

export interface InvoiceFull {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerId: string;
  vehicle: string;
  jobCardId: string;
  /**
   * The repair order this was raised from, when it was one.
   *
   * Carries the database's one-invoice-per-repair-order guarantee: a unique
   * index on this column is what stops two sessions each billing the same job
   * under different numbers. Optional because estimates and parts quotations
   * also produce invoices, and those have no repair order.
   */
  repairOrderId?: string;
  status: string;
  lines: InvoiceLine[];
  discount: number;
  shopSupplies: number;
  taxRate: number;
  notes: string;
  dueDate: string;
  paidDate: string | null;
  createdAt: string;
  currency: string;
}

export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  shopSupplies: number;
  tax: number;
  total: number;
  /** Subtotals keyed by currency — each line's rate is in its own currency */
  byCurrency: Record<string, number>;
}

/** Database row → domain shape. Pure; the invoice PK is `number`, not `id`. */
export function mapInvoiceRow(r: Record<string, unknown>): InvoiceFull {
  return {
    id: r.number as string,
    invoiceNumber: (r.number as string) || '',
    customerName: (r.customer as string) || '',
    customerId: (r.customer_id as string) || '',
    vehicle: (r.vehicle as string) || '',
    jobCardId: (r.job_card as string) || '',
    repairOrderId: (r.repair_order_id as string) || undefined,
    status: (r.status as string) || 'Draft',
    lines: (r.lines as InvoiceLine[]) || [],
    discount: Number(r.discount ?? 0),
    shopSupplies: Number(r.shop_supplies ?? 0),
    taxRate: Number(r.tax_rate ?? 0.08),
    notes: (r.notes as string) || '',
    dueDate: (r.due_date as string) || '',
    paidDate: (r.paid_date as string) || null,
    createdAt: (r.created_at as string) || '',
    currency: (r.currency as string) || 'USD',
  };
}

export function calculateTotals(inv: InvoiceFull): InvoiceTotals {
  // Group line totals by their own currency
  const byCurrency: Record<string, number> = {};
  for (const l of inv.lines) {
    const lc = l.currency || inv.currency;
    byCurrency[lc] = (byCurrency[lc] ?? 0) + l.qty * l.rate;
  }
  // Subtotal / total are in the invoice's base currency only;
  // cross-currency lines are shown inline and in byCurrency breakdown.
  const subtotal = byCurrency[inv.currency] ?? 0;
  const afterDiscount = Math.max(subtotal - inv.discount, 0);
  const taxable = afterDiscount + inv.shopSupplies;
  const tax = taxable * inv.taxRate;
  const total = taxable + tax;
  return { subtotal, discount: inv.discount, shopSupplies: inv.shopSupplies, tax, total, byCurrency };
}

/**
 * Returns the effective total amount and its display currency.
 * When all lines are in a single foreign currency (and no base-currency lines exist),
 * returns that currency's net amount. Otherwise returns the base-currency total.
 * Use this everywhere a single "how much is this invoice worth" number is needed.
 */
export function getEffectiveTotal(inv: InvoiceFull): { amount: number; currency: string } {
  const t = calculateTotals(inv);
  const foreignCurs = Object.keys(t.byCurrency).filter(c => c !== inv.currency);
  if (t.subtotal === 0 && foreignCurs.length === 1) {
    const fc = foreignCurs[0];
    const gross = t.byCurrency[fc];
    const afterDiscount = Math.max(gross - inv.discount, 0);
    const taxable = afterDiscount + inv.shopSupplies;
    const tax = Math.round(taxable * inv.taxRate);
    return { amount: taxable + tax, currency: fc };
  }
  return { amount: t.total, currency: inv.currency };
}

