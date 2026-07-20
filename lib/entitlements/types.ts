/**
 * lib/entitlements/types.ts
 *
 * Typed entitlement result — the Entitlement Engine always returns this shape.
 *
 * UI must branch on `allowed`, `reasonCode`, or `upgradeRequired` — never on
 * human-readable `userMessage` strings, which may change.
 */

import type { PlanKey } from './planRegistry';
import type { FeatureKey, UsageMetricKey } from './featureRegistry';

// ─── Reason codes ─────────────────────────────────────────────────────────────

export type EntitlementReasonCode =
  | 'ALLOWED'                        // fully allowed
  | 'FEATURE_INCLUDED'               // plan includes this feature
  | 'FEATURE_NOT_INCLUDED'           // plan does not include this feature
  | 'LIMIT_AVAILABLE'                // usage below limit
  | 'PLAN_LIMIT_REACHED'             // monthly or total limit hit
  | 'STORAGE_LIMIT_REACHED'          // storage-specific limit
  | 'SUBSCRIPTION_INACTIVE'          // paid plan subscription lapsed / cancelled
  | 'BILLING_DISABLED'               // BILLING_ENABLED=false — enforcement off
  | 'INTERNAL_OVERRIDE'              // D1 internal shop — always allowed
  | 'COMPLIMENTARY_ACCESS'           // explicitly granted access outside subscription
  | 'PERMISSION_DENIED'              // correct plan but user role disallows action
  | 'INVALID_PLAN_STATE'             // plan data is inconsistent or missing
  | 'ENFORCEMENT_DISABLED'           // subscription_enforcement flag is off
  | 'ENTITLEMENT_CHECK_UNAVAILABLE'; // infrastructure error — cannot verify; creation actions blocked

// ─── Result shape ─────────────────────────────────────────────────────────────

export interface EntitlementResult {
  allowed: boolean;
  workspaceId: string;
  effectivePlanKey: PlanKey;
  featureKey?: FeatureKey;
  metricKey?: UsageMetricKey;
  /** null = unlimited */
  limit: number | null;
  used: number | null;
  remaining: number | null;
  /** ISO string — null for unlimited or total-resource metrics */
  resetAt: string | null;
  reasonCode: EntitlementReasonCode;
  userMessage: string;
  upgradeRequired: boolean;
  recommendedPlanKey: PlanKey | null;
  /**
   * true when denied due to an infrastructure failure rather than a plan limit.
   * UI should show "try again" rather than an upgrade prompt.
   */
  retryable?: boolean;
}

/** Result returned by reserveUsage() */
export interface UsageReservation {
  reservationId: string;
  workspaceId: string;
  metricKey: UsageMetricKey;
  quantity: number;
  idempotencyKey: string;
  /** ISO timestamp after which this reservation expires if not completed */
  expiresAt: string;
  /** true when this idempotency key was already reserved (no new unit consumed) */
  idempotent: boolean;
}

// ─── Usage snapshot ───────────────────────────────────────────────────────────

export interface WorkspaceUsageSnapshot {
  workspaceId: string;
  yearMonth: string;    // 'YYYY-MM'
  resetAt: string;      // first day of next month, ISO

  // Total-resource metrics
  customersTotal: number;
  vehiclesTotal: number;
  usersTotal: number;
  techniciansTotal: number;
  locationsTotal: number;
  storageMb: number;

  // Monthly counters
  completedJobs: number;
  aiCases: number;
  vinLookups: number;
  appointments: number;
  dvi: number;
  sms: number;
}

// ─── Workspace entitlement bundle ─────────────────────────────────────────────

export interface WorkspaceEntitlements {
  workspaceId: string;
  effectivePlanKey: PlanKey;
  isInternal: boolean;
  features: Record<FeatureKey, boolean>;
  limits: Record<UsageMetricKey, number | null>;
  usage: Partial<Record<UsageMetricKey, number>>;
}

// ─── Upgrade recommendation ───────────────────────────────────────────────────

export interface UpgradeRecommendation {
  upgradeRequired: boolean;
  currentPlanKey: PlanKey;
  recommendedPlanKey: PlanKey | null;
  reason: string;
  benefitsUnlocked: string[];
  pricingPageUrl: string;
  checkoutEligible: boolean;
  isContactSales: boolean;
  monthlyCost: number | null;
  annualCost: number | null;
}
