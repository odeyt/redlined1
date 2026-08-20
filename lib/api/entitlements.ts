/**
 * Plan rights for an API principal.
 *
 * M13.1 left this as the open architecture gap: `feature-gates.ts` resolves a
 * plan from a **user** — `subscriptions.user_id` — and an API key has no user.
 * It has an organization. Nothing bridged the two, so an API route could not
 * ask "may this tenant do that" without inventing an answer.
 *
 * The chain this establishes:
 *
 *   API key → organization → its shops → the owners of those shops
 *           → their subscriptions → canonical plan → feature key → decision
 *
 * ## Why the highest tier among owners wins
 *
 * A subscription belongs to a person, and an organization can have more than
 * one owner across its shops — D1 Imports has two locations. If one owner pays
 * for Business and a co-owner is on Starter, denying the organization the
 * Business feature would be charging for something and then refusing it. The
 * generous reading is the correct one here: somebody in this organization is
 * paying for it.
 *
 * That is a genuine product decision and it is written down rather than buried
 * in a route. If billing later moves to an organization-level subscription,
 * this is the single function that changes.
 *
 * ## What this does NOT do
 *
 * It does not hardcode a plan name. Routes ask for a FEATURE KEY from the
 * canonical registry in `config/plans.ts`; `if (plan === 'business')` inside a
 * route handler is exactly what this exists to prevent.
 */
import { PLANS, type PlanConfig } from '@/config/plans';
import type { RedlinedPlanId } from '@/lib/payments/types';
import { ApiError } from './errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Cheapest first. Used to pick the most generous plan an organization holds. */
const TIER_ORDER: readonly RedlinedPlanId[] = [
  'solo', 'starter', 'professional', 'business', 'enterprise',
];

function tierIndex(id: RedlinedPlanId): number {
  const i = TIER_ORDER.indexOf(id);
  return i === -1 ? 0 : i;
}

/**
 * The plan an organization is entitled to.
 *
 * Falls back to the registry's default when nothing is found — an organization
 * with no subscription is on the free tier, which is a real state, not an
 * error. Failing closed here would lock out every unpaid tenant from read
 * endpoints that cost nothing.
 */
export async function resolveOrganizationPlan(db: Db, organizationId: string): Promise<PlanConfig> {
  const fallback: PlanConfig = PLANS.starter;

  const { data: shops } = await db.from('shops').select('id').eq('organization_id', organizationId);
  const shopIds = (shops ?? []).map((s: { id: string }) => s.id);
  if (!shopIds.length) return fallback;

  const { data: owners } = await db
    .from('shop_users')
    .select('user_id')
    .in('shop_id', shopIds)
    .eq('role', 'owner');

  const userIds = [...new Set((owners ?? []).map((o: { user_id: string }) => o.user_id))];
  if (!userIds.length) return fallback;

  const { data: subs } = await db
    .from('subscriptions')
    .select('plan_id, status')
    .in('user_id', userIds)
    .in('status', ['active', 'trialing', 'past_due']);

  let best: PlanConfig = fallback;
  for (const sub of subs ?? []) {
    const planId = sub.plan_id as RedlinedPlanId;
    const plan = PLANS[planId];
    if (!plan) continue;
    if (tierIndex(planId) > tierIndex(best.id)) best = plan;
  }
  return best;
}

/**
 * Refuse the operation unless the organization's plan grants the feature.
 *
 * A numeric feature (a cap) is treated as granted when non-zero; a cap's
 * remaining headroom is a count the caller has to supply, so that check stays
 * with whoever knows the count.
 */
export async function requireFeature(
  db: Db,
  organizationId: string,
  featureKey: keyof PlanConfig['features'],
): Promise<void> {
  const plan = await resolveOrganizationPlan(db, organizationId);
  const value = plan.features[featureKey];

  const granted = typeof value === 'boolean' ? value : typeof value === 'number' ? value !== 0 : false;
  if (!granted) throw new ApiError('ENTITLEMENT_DENIED', { feature: featureKey, plan: plan.id });
}

/**
 * Refuse when a capped feature is already at its limit.
 *
 * `null` means unlimited in the registry, which is why this cannot simply
 * compare numbers.
 */
export async function requireCapacity(
  db: Db,
  organizationId: string,
  featureKey: keyof PlanConfig['features'],
  currentCount: number,
): Promise<void> {
  const plan = await resolveOrganizationPlan(db, organizationId);
  const cap = plan.features[featureKey];
  if (cap === null || cap === undefined) return;
  if (typeof cap !== 'number') return;
  if (currentCount >= cap) {
    throw new ApiError('ENTITLEMENT_DENIED', { feature: featureKey, plan: plan.id, cap, currentCount });
  }
}

/**
 * Resources with no entitlement key in config/plans.ts.
 *
 * Recorded so the next person does not have to re-derive it: the canonical
 * registry gates unlimitedInvoices, maxTechnicians, aiAdvisor, smsCredits,
 * digitalInspections, smartIntake, multiLocation, reports, repairIntelligence,
 * triage and prioritySupport. Customers and vehicles appear nowhere in it, on
 * any plan, so neither is plan-limited and neither calls requireFeature.
 *
 * An endpoint for something that IS in that list — invoices under
 * unlimitedInvoices, technicians under maxTechnicians — must call one of the
 * guards above before it ships.
 */
export const UNGATED_RESOURCES = ['customers', 'vehicles'] as const;
