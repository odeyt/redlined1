/**
 * Feature gates — server-side.
 *
 * These functions check what the user's plan allows.
 * They depend on billing-service.getUserPlan(), NOT on any payment provider directly.
 *
 * Provider can be replaced without changing a single gate.
 */

import { getUserPlan, getCurrentSubscription } from './billing-service';
import { PLANS } from '@/config/plans';
import type { RedlinedPlanId } from '@/lib/payments/types';

// ─── Individual feature gates ─────────────────────────────────────────────────

export async function canUseAIAdvisor(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan.features.aiAdvisor;
}

export async function canCreateUnlimitedInvoices(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan.features.unlimitedInvoices;
}

export async function canAddTechnicians(userId: string, currentCount: number): Promise<boolean> {
  const plan = await getUserPlan(userId);
  const max = plan.features.maxTechnicians;
  if (max === null) return true; // unlimited
  return currentCount < max;
}

export async function canUseSMS(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan.features.smsCredits !== 0;
}

export async function canAccessReports(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan.features.reports;
}

export async function canUseMultiLocation(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan.features.multiLocation;
}

export async function canUseRepairIntelligence(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan.features.repairIntelligence;
}

export async function canUseSmartIntake(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan.features.smartIntake;
}

export async function canUseTriage(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan.features.triage;
}

// ─── Batch gate check ─────────────────────────────────────────────────────────

export type FeatureGateMap = {
  aiAdvisor: boolean;
  unlimitedInvoices: boolean;
  sms: boolean;
  reports: boolean;
  multiLocation: boolean;
  repairIntelligence: boolean;
  smartIntake: boolean;
  triage: boolean;
  maxTechnicians: number | null;
};

/** Returns all feature gates for a user in a single DB round-trip. */
export async function getFeatureGates(userId: string): Promise<FeatureGateMap> {
  const plan = await getUserPlan(userId);
  return {
    aiAdvisor:           plan.features.aiAdvisor,
    unlimitedInvoices:   plan.features.unlimitedInvoices,
    sms:                 plan.features.smsCredits !== 0,
    reports:             plan.features.reports,
    multiLocation:       plan.features.multiLocation,
    repairIntelligence:  plan.features.repairIntelligence,
    smartIntake:         plan.features.smartIntake,
    triage:              plan.features.triage,
    maxTechnicians:      plan.features.maxTechnicians,
  };
}

// ─── Plan comparison helper ───────────────────────────────────────────────────

/** Returns true if planA is strictly higher tier than planB. */
export function isPlanHigherThan(planA: RedlinedPlanId, planB: RedlinedPlanId): boolean {
  const order: RedlinedPlanId[] = ['solo', 'starter', 'professional', 'business', 'enterprise'];
  return order.indexOf(planA) > order.indexOf(planB);
}

/** Returns the plan config the user would need to unlock a feature. */
export function requiredPlanForFeature(
  featureKey: keyof typeof PLANS.starter.features,
): RedlinedPlanId | null {
  const order: RedlinedPlanId[] = ['solo', 'starter', 'professional', 'business', 'enterprise'];
  for (const planId of order) {
    const value = PLANS[planId].features[featureKey];
    const unlocks =
      typeof value === 'boolean' ? value :
      typeof value === 'number' ? value !== 0 :
      false;
    if (unlocks) return planId;
  }
  return null;
}
