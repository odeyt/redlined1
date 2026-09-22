/**
 * lib/billing/creemPlan.ts
 * Which plan did this event buy? Answered from what the event says, checked against the plans Redlined1 actually
 * sells, and NEVER defaulted. A missing, unknown or contradictory answer is an unresolved event for the owner; it
 * is not "Professional", and it is not any other paid plan.
 *
 * This is now a thin adapter over lib/billing/providerPlan.ts, so the webhook this module serves
 * (app/api/billing/webhook/creem), Option B's authoritative read, the lib provider and the commercial provider
 * all answer the same question the same way. It used to carry its own copy of the rule, and the two disagreed in
 * one case: with a product mapping configured and an event that named NO product, this copy accepted the metadata
 * plan on its own, while providerPlan refused. Now both refuse — once a mapping exists the product is the fact the
 * plan rests on, and our own metadata is a cross-check, not a substitute.
 *
 * What it keeps is the webhook's fixed vocabulary: the reason is one of plan_missing / plan_unknown / plan_conflict,
 * which Billing Health and /api/admin/billing-health/unresolved already understand.
 *
 * Pure apart from reading the existing CREEM_<PLAN>_<INTERVAL>_PRODUCT_ID variables, which config/plans already
 * requires for checkout. Nothing here changes or adds configuration.
 */
import type { UnresolvedReason } from '@/lib/billing/creemEvent';
import { resolveProviderPlan, SELLABLE_PLANS } from '@/lib/billing/providerPlan';

export type PlanResolution =
  | { kind: 'plan'; planKey: string }
  | { kind: 'unresolved'; reason: Extract<UnresolvedReason, 'plan_missing' | 'plan_unknown' | 'plan_conflict'> };

const REASON = { missing: 'plan_missing', unknown: 'plan_unknown', conflict: 'plan_conflict' } as const;

/**
 * `meta` is the single metadata source the webhook already resolved (resolveEventMetadata), so it is passed through
 * rather than re-read from the event — the plan must come from the same place as the buyer and the shop.
 */
export function resolvePlan(meta: Record<string, string>, data: Record<string, unknown>): PlanResolution {
  const result = resolveProviderPlan(data, SELLABLE_PLANS, { meta });
  return result.kind === 'plan'
    ? { kind: 'plan', planKey: result.plan }
    : { kind: 'unresolved', reason: REASON[result.code] };
}
