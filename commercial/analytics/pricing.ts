/**
 * commercial/analytics/pricing.ts
 * Pure plan-price table and monthly-equivalent helper (USD). No I/O, so both the
 * Billing Health analytics and the owner-portal commercial snapshot can depend
 * on it without importing each other.
 *
 * `enterprise` is priced at 0 on purpose: its recurring value is a negotiated
 * contract this codebase does not know. It contributes $0 and is reported as
 * "unpriced" rather than being given an invented figure.
 */
import { PLANS } from '@/config/plans';

export const PLAN_MONTHLY_PRICE: Record<string, number> = {
  solo:         PLANS.solo?.monthlyPrice         ?? 24,
  starter:      PLANS.starter?.monthlyPrice      ?? 49,
  professional: PLANS.professional?.monthlyPrice ?? 99,
  business:     PLANS.business?.monthlyPrice     ?? 179,
  enterprise:   0,
  trial:        0,
  internal:     0,
};

export const PLAN_ANNUAL_MONTHLY: Record<string, number> = {
  solo:         (PLANS.solo?.annualPrice         ?? 240)  / 12,
  starter:      (PLANS.starter?.annualPrice      ?? 490)  / 12,
  professional: (PLANS.professional?.annualPrice ?? 990)  / 12,
  business:     (PLANS.business?.annualPrice     ?? 1790) / 12,
  enterprise:   0,
  trial:        0,
  internal:     0,
};

/**
 * Checkout only ever produces 'monthly' or 'annual' (BillingInterval in lib/payments/types.ts).
 *   missing       nothing recorded: assumed monthly, and counted/reported by the caller
 *   monthly|annual  recognised (matched case-insensitively, ignoring surrounding spaces)
 *   unrecognised  anything else: its price is UNKNOWN, so it is never priced
 */
export type IntervalKind = 'monthly' | 'annual' | 'missing' | 'unrecognised';

export function classifyInterval(raw: string | null | undefined): IntervalKind {
  if (raw === null || raw === undefined || String(raw).trim() === '') return 'missing';
  const v = String(raw).trim().toLowerCase();
  return v === 'monthly' || v === 'annual' ? v : 'unrecognised';
}

/**
 * Monthly-equivalent price in USD. An unrecognised interval yields 0 — never the annual
 * rate as a guess — so it cannot inflate or shrink revenue; callers that need to say WHY
 * it contributed nothing use classifyInterval().
 */
export function normalizedMonthlyRevenue(planKey: string, billingInterval: string | null): number {
  switch (classifyInterval(billingInterval)) {
    case 'unrecognised': return 0;
    case 'annual': return PLAN_ANNUAL_MONTHLY[planKey] ?? 0;
    default: return PLAN_MONTHLY_PRICE[planKey] ?? 0; // monthly, or missing (assumed monthly)
  }
}

/** True when this codebase knows a recurring price for the plan. */
export function isPricedPlan(planKey: string): boolean {
  return (PLAN_MONTHLY_PRICE[planKey] ?? 0) > 0;
}
