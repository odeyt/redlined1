/**
 * lib/admin/activationRules.ts
 * The ONE place that defines when a shop counts as "activated" and how a shop's
 * onboarding stage is derived. Pure — no I/O — so the definition is unit-tested
 * and can be adjusted here without touching any query.
 *
 * ── Definition of an activated shop ─────────────────────────────────────────
 * A non-internal shop that has created a customer AND a vehicle AND at least one
 * repair order / job card OR estimate. (ACTIVATION_DEFINITION below.)
 *
 * ── Milestones are derived from existing records only ───────────────────────
 * "Has a customer/vehicle/job/estimate/invoice/technician" is the existence of a
 * row for the shop in the table that already holds it. No analytics event system
 * exists or is added. A milestone that cannot be read is `null` ("unknown"),
 * never `false`: an unreadable table must not make a healthy shop look inactive.
 *
 * NOT derivable from any existing record, and therefore not reported:
 *   - first customer communication (the `messages` table exists but is unused)
 *   - upgrade page viewed
 *   - checkout started (billing_events only records provider webhooks after the fact)
 *
 * ── Stage (exclusive, in this order) ────────────────────────────────────────
 *   paid               verified paid subscription (see lib/admin/accountStatus.ts)
 *   activated          meets the definition above
 *   operational_data   has at least one operational record, but not activated yet
 *   onboarding_started the shop profile has been filled in (business name set)
 *   signed_up_only     none of the above
 *   unknown            milestone data could not be read
 */

export const ACTIVATION_DEFINITION =
  'A non-internal shop that has created a customer and a vehicle, and at least one repair order/job or estimate.';

/** A shop created within this many days that is still signed_up_only is "new and needs onboarding". */
export const NEW_SHOP_WINDOW_DAYS = 14;

/**
 * Free Forever limits. These mirror the database triggers in
 * supabase/migrations/free_tier_usage_limits.sql (asserted by a test), which are
 * the actual enforcement; they are repeated here only so the owner portal can
 * say which shops are close to a limit.
 */
export const FREE_TIER_LIMITS = { customers: 10, vehicles: 10, jobsPerMonth: 5 } as const;

/** A free shop at or above this share of a limit is "approaching" it. */
export const APPROACHING_LIMIT_SHARE = 0.8;

export const ACTIVATION_STAGES = ['signed_up_only', 'onboarding_started', 'operational_data', 'activated', 'paid', 'unknown'] as const;
export type ActivationStage = typeof ACTIVATION_STAGES[number];

export const ACTIVATION_STAGE_LABELS: Record<ActivationStage, string> = {
  signed_up_only: 'Signed up only',
  onboarding_started: 'Onboarding started',
  operational_data: 'Operational data created',
  activated: 'Activated (first workflow completed)',
  paid: 'Paid',
  unknown: 'Unknown (data unavailable)',
};

/** true/false when known; null when the underlying table could not be read. */
export interface ShopMilestones {
  onboardingStarted: boolean | null;
  hasCustomer: boolean | null;
  hasVehicle: boolean | null;
  hasJobOrRepairOrder: boolean | null;
  hasEstimate: boolean | null;
  hasInvoice: boolean | null;
  hasTechnician: boolean | null;
}

/**
 * true only when every part of the definition is known to be met; false as soon as
 * one part is known to be missing; null when it cannot be decided from what was read.
 */
export function isActivatedShop(m: ShopMilestones): boolean | null {
  const workflow = orOf(m.hasJobOrRepairOrder, m.hasEstimate);
  const parts = [m.hasCustomer, m.hasVehicle, workflow];
  if (parts.some(p => p === false)) return false;
  if (parts.every(p => p === true)) return true;
  return null;
}

function orOf(a: boolean | null, b: boolean | null): boolean | null {
  if (a === true || b === true) return true;
  if (a === null || b === null) return null;
  return false;
}

export function activationStage(m: ShopMilestones, paidVerified: boolean): ActivationStage {
  if (paidVerified) return 'paid';
  const activated = isActivatedShop(m);
  if (activated === true) return 'activated';

  const operational = [m.hasCustomer, m.hasVehicle, m.hasJobOrRepairOrder, m.hasEstimate, m.hasInvoice, m.hasTechnician];
  if (operational.some(v => v === true)) return 'operational_data';
  if (m.onboardingStarted === true) return 'onboarding_started';

  // Nothing is known to be present. "Signed up only" is a claim that every answer
  // was read and was "no"; if any could not be read, say so instead of guessing.
  const allKnown = operational.every(v => v !== null) && m.onboardingStarted !== null;
  return allKnown ? 'signed_up_only' : 'unknown';
}

/** A free shop counts as approaching a limit at APPROACHING_LIMIT_SHARE of it. */
export function approachingFreeLimit(counts: { customers: number; vehicles: number; jobsThisMonth: number }): boolean {
  const near = (n: number, limit: number) => n >= Math.ceil(limit * APPROACHING_LIMIT_SHARE);
  return near(counts.customers, FREE_TIER_LIMITS.customers)
    || near(counts.vehicles, FREE_TIER_LIMITS.vehicles)
    || near(counts.jobsThisMonth, FREE_TIER_LIMITS.jobsPerMonth);
}

/** Whole-day gap between account creation and last sign-in; "returned" means a sign-in on a later day. */
export function returnedAfterFirstSession(createdAt: string | undefined, lastSignInAt: string | null | undefined): boolean | null {
  if (!createdAt) return null;
  if (!lastSignInAt) return false;
  const gap = new Date(lastSignInAt).getTime() - new Date(createdAt).getTime();
  if (!Number.isFinite(gap)) return null;
  return gap >= 86400000;
}
