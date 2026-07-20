/**
 * lib/entitlements/upgradeEngine.ts
 *
 * Upgrade Recommendation Engine.
 *
 * Converts entitlement denials into structured upgrade guidance.
 * UI renders the returned data — upgrade messages are never hardcoded
 * directly in UI components.
 */

import {
  PLAN_REGISTRY,
  PLAN_ORDER,
  comparePlans,
  annualSavingsPct,
  type PlanKey,
  type PlanDefinition,
} from './planRegistry';
import { FEATURE_REGISTRY, type FeatureKey, type UsageMetricKey } from './featureRegistry';
import type { EntitlementResult, UpgradeRecommendation } from './types';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds an UpgradeRecommendation from an EntitlementResult denial.
 * Returns null when the action was allowed (no upgrade needed).
 */
export function buildUpgradeRecommendation(
  denial: EntitlementResult,
): UpgradeRecommendation | null {
  if (denial.allowed) return null;

  const currentPlan = PLAN_REGISTRY[denial.effectivePlanKey];
  const recommendedKey = denial.recommendedPlanKey ?? findMinimumUpgrade(denial);
  const recommendedPlan = recommendedKey ? PLAN_REGISTRY[recommendedKey] : null;

  const isContactSales = recommendedPlan?.billingMode === 'custom';
  const checkoutEligible =
    !!recommendedPlan &&
    recommendedPlan.requiresCheckout &&
    !isContactSales;

  const benefitsUnlocked = recommendedPlan
    ? buildBenefitsList(denial.effectivePlanKey, recommendedPlan.key, denial.metricKey, denial.featureKey)
    : [];

  const reason = buildReason(denial);

  return {
    upgradeRequired: true,
    currentPlanKey: denial.effectivePlanKey,
    recommendedPlanKey: recommendedKey,
    reason,
    benefitsUnlocked,
    pricingPageUrl: '/subscriptions',
    checkoutEligible,
    isContactSales,
    monthlyCost: recommendedPlan?.monthlyPrice ?? null,
    annualCost: recommendedPlan?.annualPrice ?? null,
  };
}

/**
 * Returns the recommended plan for a context without a prior EntitlementResult.
 * Useful for pre-emptive upgrade prompts (e.g. "what plan lets me do X?").
 */
export function recommendPlanForFeature(featureKey: FeatureKey): UpgradeRecommendation {
  const featureDef = FEATURE_REGISTRY[featureKey];
  for (const key of PLAN_ORDER) {
    const plan = PLAN_REGISTRY[key];
    if (plan.features[featureKey as keyof typeof plan.features]) {
      return {
        upgradeRequired: true,
        currentPlanKey: 'free',
        recommendedPlanKey: key,
        reason: featureDef?.upgradeDescription ?? `Upgrade to access ${featureDef?.name ?? featureKey}`,
        benefitsUnlocked: buildBenefitsList('free', key, undefined, featureKey),
        pricingPageUrl: '/subscriptions',
        checkoutEligible: plan.requiresCheckout,
        isContactSales: plan.billingMode === 'custom',
        monthlyCost: plan.monthlyPrice,
        annualCost: plan.annualPrice,
      };
    }
  }
  // Enterprise-only
  return {
    upgradeRequired: true,
    currentPlanKey: 'free',
    recommendedPlanKey: 'enterprise',
    reason: featureDef?.upgradeDescription ?? 'Contact sales',
    benefitsUnlocked: [],
    pricingPageUrl: '/subscriptions',
    checkoutEligible: false,
    isContactSales: true,
    monthlyCost: null,
    annualCost: null,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function findMinimumUpgrade(denial: EntitlementResult): PlanKey | null {
  for (const key of PLAN_ORDER) {
    if (comparePlans(key, denial.effectivePlanKey) <= 0) continue;
    const plan = PLAN_REGISTRY[key];

    if (denial.featureKey) {
      const has = plan.features[denial.featureKey as keyof typeof plan.features];
      if (has) return key;
    } else if (denial.metricKey) {
      const needed = (denial.used ?? 0) + 1;
      const limit = getMetricLimit(plan, denial.metricKey);
      if (limit === null || limit >= needed) return key;
    }
  }
  return 'enterprise';
}

function getMetricLimit(
  plan: PlanDefinition,
  metricKey: UsageMetricKey,
): number | null {
  const p = plan as unknown as { limits: Record<string, number | null> };
  const keyMap: Record<UsageMetricKey, string> = {
    customers_total:   'customersTotal',
    vehicles_total:    'vehiclesTotal',
    users_total:       'usersTotal',
    technicians_total: 'techniciansTotal',
    locations_total:   'locationsTotal',
    storage_mb:        'storageMb',
    completed_jobs:    'completedJobsPerMonth',
    ai_cases:          'aiCasesPerMonth',
    vin_lookups:       'vinLookupsPerMonth',
    appointments:      'appointmentsPerMonth',
    dvi:               'dviPerMonth',
    sms:               'smsPerMonth',
  };
  return p.limits[keyMap[metricKey]] ?? null;
}

function buildBenefitsList(
  fromKey: PlanKey,
  toKey: PlanKey,
  metricKey?: UsageMetricKey,
  featureKey?: FeatureKey,
): string[] {
  const toPlan = PLAN_REGISTRY[toKey];
  const savings = annualSavingsPct(toPlan);
  const benefits: string[] = [];

  if (metricKey) {
    const limit = getMetricLimit(toPlan as never, metricKey);
    const labelMap: Partial<Record<UsageMetricKey, string>> = {
      completed_jobs:    'completed jobs/mo',
      ai_cases:          'AI cases/mo',
      vin_lookups:       'VIN lookups/mo',
      appointments:      'appointments/mo',
      dvi:               'digital inspections/mo',
      customers_total:   'customers',
      vehicles_total:    'vehicles',
    };
    const label = labelMap[metricKey] ?? metricKey;
    benefits.push(limit === null ? `Unlimited ${label}` : `${limit.toLocaleString()} ${label}`);
  }

  if (featureKey) {
    const fd = FEATURE_REGISTRY[featureKey];
    if (fd) benefits.push(fd.name);
  }

  // Add a couple of the plan's key selling points
  const upgradedFeatures = Object.entries(toPlan.features as unknown as Record<string, boolean>)
    .filter(([k, v]) => v === true && !(PLAN_REGISTRY[fromKey].features as unknown as Record<string, boolean>)[k])
    .slice(0, 3);

  for (const [fk] of upgradedFeatures) {
    const fd = FEATURE_REGISTRY[fk as FeatureKey];
    if (fd && !benefits.includes(fd.name)) benefits.push(fd.name);
  }

  if (savings) benefits.push(`Save ${savings}% with annual billing`);

  return benefits;
}

function buildReason(denial: EntitlementResult): string {
  const plan = PLAN_REGISTRY[denial.effectivePlanKey];

  if (denial.metricKey) {
    const labelMap: Partial<Record<UsageMetricKey, string>> = {
      completed_jobs: 'completed jobs',
      ai_cases: 'AI cases',
      vin_lookups: 'VIN lookups',
      appointments: 'appointments',
      dvi: 'digital inspections',
      customers_total: 'customers',
      vehicles_total: 'vehicles',
    };
    const label = labelMap[denial.metricKey] ?? denial.metricKey;
    return `${plan.name} plan limit reached for ${label}`;
  }

  if (denial.featureKey) {
    const fd = FEATURE_REGISTRY[denial.featureKey];
    return `${fd?.name ?? denial.featureKey} requires a higher plan`;
  }

  return `Upgrade from ${plan.name} to continue`;
}
