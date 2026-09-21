/**
 * lib/billing/providerPlan.ts
 *
 * Which plan does this provider data describe? ONE answer for every billing path that has to turn a Creem
 * checkout, subscription or event into a plan: the lib provider's getSubscription, the lib checkout extractor on
 * /api/webhooks/creem, and the commercial provider's webhook handler.
 *
 * The rule, in order:
 *   1. The PRODUCT Creem is billing is authoritative — it is what the card is charged for. It is mapped through
 *      the configured CREEM_<PLAN>_<INTERVAL>_PRODUCT_ID variables, the same ones checkout uses to create the
 *      charge, and nothing else. No display name, no tier order, no default.
 *   2. Metadata (plan_key / plan_id, set by our own checkout) is a cross-check. It must not contradict the
 *      product, and its two keys must not contradict each other.
 *   3. Only when NO product mapping is configured at all is validated metadata accepted on its own — there is
 *      then nothing to compare against. A configured mapping that does not know the product is a refusal.
 *
 * Everything else is `unusable` with a reason, never a plan. What this replaces:
 *   commercial/providers/creemProvider.ts  `meta.plan_key ?? 'professional'`
 *   commercial/billing/billingService.ts   `update.planKey ?? 'professional'`
 *   lib/payments/providers/creem-provider  `metadata.plan_id ?? 'starter'` (already replaced; now delegates here)
 *
 * Reasons carry no customer data — at most a plan name, which is our own vocabulary.
 */
import { PLANS, PLAN_ORDER } from '@/config/plans';
import type { RedlinedPlanId } from '@/lib/payments/types';

export type ProviderPlan<P extends string> =
  | { kind: 'plan'; plan: P }
  | { kind: 'unusable'; reason: string };

/** Plans checkout actually sells: both prices set. Enterprise is sold by conversation and has no product. */
export const SELLABLE_PLANS: readonly RedlinedPlanId[] =
  PLAN_ORDER.filter(p => PLANS[p].monthlyPrice !== null && PLANS[p].annualPrice !== null);

const INTERVALS = ['MONTHLY', 'ANNUAL'] as const;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Creem returns ids bare in some payloads and nested as `{ id }` in others. */
export function readProviderId(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (isRecord(v) && typeof v.id === 'string') return v.id.trim();
  return '';
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');

export function resolveProviderPlan<P extends string>(
  data: Record<string, unknown>,
  allowed: readonly P[],
): ProviderPlan<P> {
  const unusable = (reason: string): ProviderPlan<P> => ({ kind: 'unusable', reason });
  const nested = isRecord(data.subscription) ? data.subscription : {};

  // The product, from the object or its nested subscription. Two different ones is not a choice we make.
  const outer = readProviderId(data.product) || readProviderId(data.product_id);
  const inner = readProviderId(nested.product) || readProviderId(nested.product_id);
  if (outer && inner && outer !== inner) return unusable('the event names two different products');
  const productId = outer || inner;

  // product id -> the allowed plan(s) it is configured for.
  const byProduct = new Map<string, Set<P>>();
  let mappingConfigured = false;
  for (const plan of allowed) {
    for (const interval of INTERVALS) {
      const id = process.env[`CREEM_${plan.toUpperCase()}_${interval}_PRODUCT_ID`]?.trim();
      if (!id) continue;
      mappingConfigured = true;
      if (!byProduct.has(id)) byProduct.set(id, new Set());
      byProduct.get(id)!.add(plan);
    }
  }

  // Metadata from the object, or from its nested subscription when the object carries none.
  const meta = isRecord(data.metadata) ? data.metadata : isRecord(nested.metadata) ? nested.metadata : {};
  const key = text(meta.plan_key);
  const id = text(meta.plan_id);
  if (key && id && key !== id) return unusable('the metadata names two different plans');
  const claimed = key || id;
  const claimedPlan = (allowed as readonly string[]).includes(claimed) ? (claimed as P) : null;

  // A configured mapping makes the product REQUIRED. Without one, metadata is the only thing to read; with one,
  // an event that names no product is missing the fact the plan rests on — our own metadata is not a substitute.
  if (!productId && mappingConfigured) return unusable('the provider data names no product to map to a plan');

  if (productId) {
    const plans = byProduct.get(productId);
    if (plans && plans.size > 1) return unusable('the product is configured for more than one plan');
    if (plans && plans.size === 1) {
      const plan = [...plans][0];
      if (claimed && claimedPlan !== plan) {
        return unusable('the plan in the metadata disagrees with the product being billed');
      }
      return { kind: 'plan', plan };
    }
    if (mappingConfigured) return unusable('the product being billed is not a plan this integration sells');
    // No mapping configured anywhere: nothing to check the product against. Fall through to metadata.
  }

  if (claimedPlan) return { kind: 'plan', plan: claimedPlan };
  if (claimed) return unusable(`the metadata names a plan this integration does not sell: ${claimed}`);
  return unusable(productId
    ? 'the provider data names no plan, and no product-to-plan mapping is configured'
    : 'the provider data names no plan and no product');
}
