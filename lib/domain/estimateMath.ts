/**
 * Estimate arithmetic. Pure — no database, no browser client.
 *
 * Moved out of services/estimateService.ts (which re-exports it) so the
 * customer portal, a server component, can total an estimate the same way
 * the staff screen does without importing the browser Supabase client.
 */
export interface EstimateMathInput {
  currency: string;
  lines: ReadonlyArray<{ qty: number; rate: number; currency?: string }>;
  discount: number;
  /** A fraction: 0.0635 is 6.35%. */
  taxRate: number;
}

export interface EstimateTotals {
  subtotal: number;
  discount: number;
  shopSupplies: number;
  tax: number;
  total: number;
}

export function calculateEstimateTotals(est: EstimateMathInput): EstimateTotals {
  const mainCur = est.currency || 'USD';
  const subtotal = est.lines
    .filter(l => !l.currency || l.currency === mainCur)
    .reduce((s, l) => s + l.qty * l.rate, 0);
  const afterDiscount = Math.max(subtotal - est.discount, 0);
  // shopSupplies removed from UI — exclude from calculation regardless of DB value
  const tax = afterDiscount * est.taxRate;
  const total = afterDiscount + tax;
  return { subtotal, discount: est.discount, shopSupplies: 0, tax, total };
}
