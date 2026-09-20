/**
 * lib/billing/creemPlan.ts
 * Which plan did this event buy? Answered from what the event says, checked against the plans Redlined1 actually
 * sells, and NEVER defaulted. A missing, unknown or contradictory answer is an unresolved event for the owner; it
 * is not "Professional", and it is not any other paid plan.
 *
 * Pure apart from reading the existing CREEM_<PLAN>_<INTERVAL>_PRODUCT_ID variables, which config/plans already
 * requires for checkout. Nothing here changes or adds configuration.
 */
import { PLANS, PLAN_ORDER } from '@/config/plans';
import { asId } from '@/lib/billing/creemEvent';
import type { UnresolvedReason } from '@/lib/billing/creemEvent';

export type PlanResolution =
  | { kind: 'plan'; planKey: string }
  | { kind: 'unresolved'; reason: Extract<UnresolvedReason, 'plan_missing' | 'plan_unknown' | 'plan_conflict'> };

/** Plans that can be bought through checkout: the ones with a price. Enterprise is sold by conversation. */
const SELLABLE_PLANS: ReadonlySet<string> = new Set(
  PLAN_ORDER.filter(p => PLANS[p].monthlyPrice !== null && PLANS[p].annualPrice !== null),
);

/** product id -> the plan(s) it is configured for, from the environment checkout already uses. */
function productPlanMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const plan of SELLABLE_PLANS) {
    for (const interval of ['MONTHLY', 'ANNUAL']) {
      const id = process.env[`CREEM_${plan.toUpperCase()}_${interval}_PRODUCT_ID`]?.trim();
      if (!id) continue;
      if (!map.has(id)) map.set(id, new Set());
      map.get(id)!.add(plan);
    }
  }
  return map;
}

export function resolvePlan(meta: Record<string, string>, data: Record<string, unknown>): PlanResolution {
  const key = (meta.plan_key ?? '').toLowerCase();
  const id = (meta.plan_id ?? '').toLowerCase();
  if (!key && !id) return { kind: 'unresolved', reason: 'plan_missing' };
  if (key && id && key !== id) return { kind: 'unresolved', reason: 'plan_conflict' };

  const planKey = key || id;
  if (!SELLABLE_PLANS.has(planKey)) return { kind: 'unresolved', reason: 'plan_unknown' };

  // The product actually purchased, where the event says. Checkout puts it on the object, and on the nested
  // subscription. If the event names one, it must agree with the plan in the metadata: a renewal whose metadata
  // still says the old plan after the customer changed product must not be written back as the old plan.
  const nested = data.subscription && typeof data.subscription === 'object' && !Array.isArray(data.subscription)
    ? (data.subscription as Record<string, unknown>) : {};
  const products = [...new Set([asId(data.product), asId(nested.product)].filter(Boolean))];
  if (products.length > 1) return { kind: 'unresolved', reason: 'plan_conflict' };

  if (products.length === 1) {
    const map = productPlanMap();
    // With no product ids configured there is nothing to compare against; the validated metadata stands.
    if (map.size > 0) {
      const plans = map.get(products[0]);
      if (!plans) return { kind: 'unresolved', reason: 'plan_unknown' };
      if (plans.size !== 1 || !plans.has(planKey)) return { kind: 'unresolved', reason: 'plan_conflict' };
    }
  }
  return { kind: 'plan', planKey };
}
