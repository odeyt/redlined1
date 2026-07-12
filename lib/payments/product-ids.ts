/**
 * Creem product ID helpers and startup validation.
 *
 * The env var pattern for Creem product IDs:
 *   CREEM_{PLAN_ID}_{INTERVAL}_PRODUCT_ID
 *
 * Examples:
 *   CREEM_STARTER_MONTHLY_PRODUCT_ID=prod_test_abc123
 *   CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID=prod_test_def456
 *
 * Enterprise has no annual product (custom/contact-sales only).
 *
 * Call validateCreemProductIds() at app startup (or in a server action)
 * when NEXT_PUBLIC_BILLING_ENABLED=true to surface missing vars early.
 */

import type { RedlinedPlanId, BillingInterval } from './types';

export const PAID_PLANS: RedlinedPlanId[] = ['solo', 'starter', 'professional', 'business'];

export const BILLING_INTERVALS: BillingInterval[] = ['monthly', 'annual'];

/** The expected env var name for a given plan + interval. */
export function productIdEnvKey(planId: RedlinedPlanId, interval: BillingInterval): string {
  return `CREEM_${planId.toUpperCase()}_${interval.toUpperCase()}_PRODUCT_ID`;
}

/** All required product ID env vars (4 paid plans × 2 intervals = 8). */
export const REQUIRED_PRODUCT_ID_VARS: string[] = PAID_PLANS.flatMap(plan =>
  BILLING_INTERVALS.map(interval => productIdEnvKey(plan, interval)),
);

export interface ProductIdValidationResult {
  ok: boolean;
  missing: string[];
  present: string[];
}

/**
 * Validates that all required Creem product ID env vars are set.
 * Server-side only — never call from client code.
 */
export function validateCreemProductIds(): ProductIdValidationResult {
  const missing: string[] = [];
  const present: string[] = [];

  for (const key of REQUIRED_PRODUCT_ID_VARS) {
    if (process.env[key]) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }

  return { ok: missing.length === 0, missing, present };
}

/**
 * Asserts all product IDs are present. Throws with a clear list of missing vars.
 * Use at the top of billing-related route handlers in test/staging environments.
 */
export function assertCreemProductIds(): void {
  const result = validateCreemProductIds();
  if (!result.ok) {
    throw new Error(
      `[billing] Missing Creem product ID environment variables:\n` +
      result.missing.map(k => `  - ${k}`).join('\n') +
      `\n\nSet these in .env.local using your Creem test-mode product IDs.`,
    );
  }
}
