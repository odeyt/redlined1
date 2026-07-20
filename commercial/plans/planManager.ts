/**
 * commercial/plans/planManager.ts
 * Single source of truth for plan definitions and limits.
 * Reads from the in-memory COMMERCIAL_PLANS constant (backed by the DB seed).
 */

import type { BillingPlan, PlanKey, PlanLimits } from '@/commercial/shared/types';

// ─── Static plan definitions (mirrors DB seed) ────────────────────────────────

export const COMMERCIAL_PLANS: BillingPlan[] = [
  {
    id: 'free',
    planKey: 'free',
    name: 'Free Forever',
    description: 'For shops just getting started — no credit card required',
    monthlyPrice: 0,
    annualPrice: 0,
    currency: 'USD',
    limits: {
      maxUsers: 1,
      maxLocations: 1,
      maxVehicles: 10,
      maxJobCardsPerMonth: 5,
      aiCreditsPerMonth: 2,
      storageGb: 0.25,
    },
    isActive: true,
    metadata: { noCheckout: true },
  },
  {
    id: 'starter',
    planKey: 'starter',
    name: 'Starter',
    description: 'Perfect for solo mechanics and small shops',
    monthlyPrice: 49,
    annualPrice: 490,
    currency: 'USD',
    limits: { maxUsers: 2, maxLocations: 1, maxVehicles: 500, maxJobCardsPerMonth: 200, aiCreditsPerMonth: 100, storageGb: 5 },
    isActive: true,
    metadata: {},
  },
  {
    id: 'professional',
    planKey: 'professional',
    name: 'Professional',
    description: 'For growing shops with multiple technicians',
    monthlyPrice: 99,
    annualPrice: 990,
    currency: 'USD',
    limits: { maxUsers: 10, maxLocations: 3, maxVehicles: 2000, maxJobCardsPerMonth: 1000, aiCreditsPerMonth: 500, storageGb: 20 },
    isActive: true,
    metadata: { highlighted: true },
  },
  {
    id: 'business',
    planKey: 'business',
    name: 'Business',
    description: 'Full-featured for established multi-bay operations',
    monthlyPrice: 199,
    annualPrice: 1990,
    currency: 'USD',
    limits: { maxUsers: 25, maxLocations: 10, maxVehicles: null, maxJobCardsPerMonth: null, aiCreditsPerMonth: 2000, storageGb: 100 },
    isActive: true,
    metadata: {},
  },
  {
    id: 'enterprise',
    planKey: 'enterprise',
    name: 'Enterprise',
    description: 'Custom pricing for multi-location operations and fleets',
    monthlyPrice: null,
    annualPrice: null,
    currency: 'USD',
    limits: { maxUsers: null, maxLocations: null, maxVehicles: null, maxJobCardsPerMonth: null, aiCreditsPerMonth: null, storageGb: null },
    isActive: true,
    metadata: {},
  },
];

const PLAN_ORDER: PlanKey[] = ['free', 'starter', 'professional', 'business', 'enterprise'];

// ─── Functions ────────────────────────────────────────────────────────────────

export function getPlans(): BillingPlan[] {
  return COMMERCIAL_PLANS.filter(p => p.isActive);
}

export function getPlan(planKey: string): BillingPlan | null {
  return COMMERCIAL_PLANS.find(p => p.planKey === planKey) ?? null;
}

export function getPlanLimits(planKey: string): PlanLimits {
  const plan = getPlan(planKey);
  if (!plan) {
    // Safe fallback — most restrictive limits
    return { maxUsers: 1, maxLocations: 1, maxVehicles: 50, maxJobCardsPerMonth: 20, aiCreditsPerMonth: 0, storageGb: 1 };
  }
  return plan.limits;
}

export function isPlanActive(planKey: string): boolean {
  return COMMERCIAL_PLANS.some(p => p.planKey === planKey && p.isActive);
}

/**
 * Compare two plans.
 * Returns: 1 if target is higher, -1 if lower, 0 if same.
 */
export function comparePlans(currentPlanKey: string, targetPlanKey: string): -1 | 0 | 1 {
  const currentIdx = PLAN_ORDER.indexOf(currentPlanKey as PlanKey);
  const targetIdx  = PLAN_ORDER.indexOf(targetPlanKey as PlanKey);
  if (targetIdx > currentIdx) return 1;
  if (targetIdx < currentIdx) return -1;
  return 0;
}
