/**
 * Which plans checkout will accept.
 *
 * Enterprise is priced by negotiation and has no Creem product, correctly. But
 * the route listed it as a valid planId, so a request for it passed validation
 * and reached getProductId(), which threw
 * "Missing environment variable: CREEM_ENTERPRISE_MONTHLY_PRODUCT_ID" — a 500
 * naming a variable only the operator can set, shown to a customer.
 *
 * The UI never posts it (PricingCards renders "Contact Sales" for that card),
 * so this is about direct API calls and about the list not going stale: the
 * valid set is now derived from the catalogue rather than restated, and the
 * rule is "has a price" rather than a hardcoded exclusion of one plan.
 */
import { PLANS, PLAN_ORDER, getProductId } from '../../config/plans';
import type { RedlinedPlanId } from '../payments/types';

/** Mirrors the guard in app/api/billing/checkout/route.ts. */
function rejectionFor(planId: string): 'unknown-plan' | 'not-self-service' | null {
  if (!PLAN_ORDER.includes(planId as RedlinedPlanId)) return 'unknown-plan';
  const plan = PLANS[planId as RedlinedPlanId];
  if (plan.monthlyPrice === null || plan.annualPrice === null) return 'not-self-service';
  return null;
}

describe('plans checkout accepts', () => {
  it.each(['solo', 'starter', 'professional', 'business'])('accepts %s, which has a price', id => {
    expect(rejectionFor(id)).toBeNull();
  });

  it('refuses enterprise before it can reach getProductId', () => {
    expect(rejectionFor('enterprise')).toBe('not-self-service');
  });

  it('refuses a plan that does not exist', () => {
    expect(rejectionFor('platinum')).toBe('unknown-plan');
  });

  it('refuses the free tier being "bought"', () => {
    // 'free' is not a catalogue plan at all — it is the absence of one.
    expect(rejectionFor('free')).toBe('unknown-plan');
  });
});

describe('the rule tracks the catalogue rather than a hardcoded list', () => {
  it('every priced plan is purchasable, and every unpriced one is not', () => {
    for (const id of PLAN_ORDER) {
      const priced = PLANS[id].monthlyPrice !== null && PLANS[id].annualPrice !== null;
      expect(rejectionFor(id)).toBe(priced ? null : 'not-self-service');
    }
  });

  it('confirms the case that caused the 500: enterprise has no configured product', () => {
    // Proves the guard is load-bearing — without it this is what the customer got.
    expect(() => getProductId('creem', 'enterprise', 'monthly')).toThrow(/Missing environment variable/);
  });
});
