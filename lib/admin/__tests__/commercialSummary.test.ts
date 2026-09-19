import { deriveAccountStatus, type AccountStatusInput } from '../accountStatus';
import { summarizeCommercial, type CommercialShop } from '../commercialSummary';
import { PLAN_MONTHLY_PRICE, PLAN_ANNUAL_MONTHLY } from '@/commercial/analytics/pricing';

const sub = (status: string, o: Partial<NonNullable<AccountStatusInput['subscription']>> = {}) =>
  ({ status, billingProvider: 'creem', hasProviderReference: true, cancelAtPeriodEnd: false, ...o });

let n = 0;
function shop(
  input: Partial<AccountStatusInput>,
  o: { plan?: string | null; interval?: string | null; archived?: boolean } = {},
): CommercialShop {
  const subscription = input.subscription ?? null;
  return {
    shopId: `s-${++n}`,
    archived: !!o.archived,
    result: deriveAccountStatus({ plan: null, trialEndsAt: null, billingStatus: null, isInternal: false, subscription: null, ...input }),
    planKey: o.plan === undefined ? (subscription ? 'solo' : null) : o.plan,
    billingInterval: o.interval ?? null,
    subscriptionStatus: subscription?.status ?? null,
  };
}

const paidSolo = (o: Parameters<typeof shop>[1] = {}, s = sub('active')) =>
  shop({ plan: 'solo', billingStatus: 'active', subscription: s }, { plan: 'solo', ...o });

describe('summarizeCommercial — revenue counts verified subscriptions only', () => {
  it('zero paid shops: zero revenue, reconciled, and no division by zero', () => {
    const c = summarizeCommercial([shop({}), shop({ plan: 'free' })]);
    expect(c.revenue.mrr).toBe(0);
    expect(c.revenue.arr).toBe(0);
    expect(c.revenue.arpa).toBe(0);
    expect(c.revenue.pricedRecurringShops).toBe(0);
    expect(c.reconciliation).toBe('reconciled');
    expect(summarizeCommercial([]).reconciliation).toBe('reconciled');
  });

  it('a verified monthly subscription contributes its plan price; ARR is MRR x 12; ARPA is per verified shop', () => {
    const c = summarizeCommercial([paidSolo(), paidSolo()]);
    expect(c.revenue.mrr).toBe(PLAN_MONTHLY_PRICE.solo * 2);
    expect(c.revenue.arr).toBe(PLAN_MONTHLY_PRICE.solo * 2 * 12);
    expect(c.revenue.arpa).toBe(PLAN_MONTHLY_PRICE.solo);
    expect(c.revenue.pricedRecurringShops).toBe(2);
    expect(c.revenue.mrrByPlan).toEqual({ solo: PLAN_MONTHLY_PRICE.solo * 2 });
    expect(c.subscriptions.active).toBe(2);
  });

  it('an annual subscription contributes its monthly equivalent', () => {
    const c = summarizeCommercial([paidSolo({ interval: 'annual' })]);
    expect(c.revenue.mrr).toBe(Math.round(PLAN_ANNUAL_MONTHLY.solo * 100) / 100);
    expect(c.revenue.assumedMonthlyInterval).toBe(0);
  });

  it.each(['quarterly', 'weekly', 'yearly', 'biweekly', '12', 'annually', 'monthly-ish'])(
    'an unrecognised billing interval (%s) is not priced — not as annual, not as monthly — and is reported',
    interval => {
      const c = summarizeCommercial([paidSolo({ interval })]);
      expect(c.revenue.mrr).toBe(0);
      expect(c.revenue.arr).toBe(0);
      expect(c.revenue.arpa).toBe(0);
      expect(c.revenue.pricedRecurringShops).toBe(0);
      expect(c.revenue.excluded.unrecognisedInterval).toBe(1);
      expect(c.revenue.excluded.unpriced).toBe(0); // its plan has a price; it is the interval that is unknown
      expect(c.revenue.assumedMonthlyInterval).toBe(0);
      expect(c.subscriptions.active).toBe(1); // still a confirmed subscription, just not valued
    },
  );

  it('an unrecognised interval does not disturb the shops that are valued', () => {
    const c = summarizeCommercial([paidSolo(), paidSolo({ interval: 'quarterly' }), paidSolo({ interval: 'annual' })]);
    expect(c.revenue.mrr).toBe(Math.round((PLAN_MONTHLY_PRICE.solo + PLAN_ANNUAL_MONTHLY.solo) * 100) / 100);
    expect(c.revenue.pricedRecurringShops).toBe(2);
    expect(c.revenue.excluded.unrecognisedInterval).toBe(1);
    expect(c.revenue.arpa).toBe(c.revenue.mrr / 2);
  });

  it('a cancel-scheduled subscription with an unrecognised interval is neither MRR nor revenue at risk', () => {
    const c = summarizeCommercial([paidSolo({ interval: 'weekly' }, sub('active', { cancelAtPeriodEnd: true }))]);
    expect(c.revenue.mrr).toBe(0);
    expect(c.revenue.revenueAtRisk).toBe(0);
    expect(c.revenue.excluded.unrecognisedInterval).toBe(1);
    expect(c.subscriptions.cancelScheduled).toBe(1);
  });

  it('a past-due subscription with an unrecognised interval adds nothing to revenue at risk', () => {
    const past = shop({ plan: 'solo', billingStatus: 'past_due', subscription: sub('past_due') }, { plan: 'solo', interval: 'weekly' });
    const c = summarizeCommercial([past]);
    expect(c.revenue.revenueAtRisk).toBe(0);
    expect(c.revenue.pastDueRevenue).toBe(0);
    expect(c.subscriptions.pastDue).toBe(1);
  });

  it('recognises the two real intervals regardless of case or surrounding spaces', () => {
    expect(summarizeCommercial([paidSolo({ interval: 'Monthly' })]).revenue.mrr).toBe(PLAN_MONTHLY_PRICE.solo);
    const annual = summarizeCommercial([paidSolo({ interval: '  ANNUAL ' })]).revenue;
    expect(annual.mrr).toBe(Math.round(PLAN_ANNUAL_MONTHLY.solo * 100) / 100);
    expect(annual.excluded.unrecognisedInterval).toBe(0);
  });

  it('an empty interval string is "not recorded" (assumed monthly and reported), not "unrecognised"', () => {
    const c = summarizeCommercial([paidSolo({ interval: '' })]);
    expect(c.revenue.mrr).toBe(PLAN_MONTHLY_PRICE.solo);
    expect(c.revenue.assumedMonthlyInterval).toBe(1);
    expect(c.revenue.excluded.unrecognisedInterval).toBe(0);
  });

  it('a missing billing interval is assumed monthly and reported, not hidden', () => {
    const c = summarizeCommercial([paidSolo({ interval: null })]);
    expect(c.revenue.mrr).toBe(PLAN_MONTHLY_PRICE.solo);
    expect(c.revenue.assumedMonthlyInterval).toBe(1);
  });

  it('cancel_scheduled still counts toward MRR and is also revenue at risk', () => {
    const c = summarizeCommercial([paidSolo({}, sub('active', { cancelAtPeriodEnd: true }))]);
    expect(c.revenue.mrr).toBe(PLAN_MONTHLY_PRICE.solo);
    expect(c.revenue.revenueAtRisk).toBe(PLAN_MONTHLY_PRICE.solo);
    expect(c.subscriptions.active).toBe(1);
    expect(c.subscriptions.cancelScheduled).toBe(1);
  });

  it('pastDueRevenue counts only resolver-confirmed past_due shops — not cancel_scheduled, and not a free-plan shop with a past_due row', () => {
    const past = shop({ plan: 'solo', billingStatus: 'past_due', subscription: sub('past_due') }, { plan: 'solo' });
    const cancelling = paidSolo({}, sub('active', { cancelAtPeriodEnd: true }));
    // Free entitlement + a past_due billing row is a contradiction (billing_mismatch), not a past-due customer.
    const contradiction = shop({ plan: 'free', billingStatus: 'inactive', subscription: sub('past_due') }, { plan: 'solo' });
    expect(contradiction.result.status).toBe('billing_mismatch');
    const c = summarizeCommercial([past, cancelling, contradiction]);
    expect(c.subscriptions.pastDue).toBe(1);
    expect(c.revenue.pastDueRevenue).toBe(PLAN_MONTHLY_PRICE.solo);
    expect(c.revenue.revenueAtRisk).toBe(PLAN_MONTHLY_PRICE.solo * 2); // past-due + scheduled cancel
  });

  it('past_due is revenue at risk but not MRR', () => {
    const past = shop({ plan: 'solo', billingStatus: 'past_due', subscription: sub('past_due') }, { plan: 'solo' });
    const c = summarizeCommercial([past]);
    expect(c.revenue.mrr).toBe(0);
    expect(c.revenue.revenueAtRisk).toBe(PLAN_MONTHLY_PRICE.solo);
    expect(c.subscriptions.pastDue).toBe(1);
  });

  it('cancelled-with-access-retained is not revenue', () => {
    const cancelled = shop({ plan: 'solo', billingStatus: 'cancelled', subscription: sub('cancelled') }, { plan: 'solo' });
    const c = summarizeCommercial([cancelled]);
    expect(c.revenue.mrr).toBe(0);
    expect(c.subscriptions.cancelled).toBe(1);
  });

  it('expired subscriptions are not revenue', () => {
    const expired = shop({ plan: 'free', subscription: sub('expired') }, { plan: 'solo' });
    const c = summarizeCommercial([expired]);
    expect(c.revenue.mrr).toBe(0);
    expect(c.subscriptions.expired).toBe(1);
  });

  it('an unverified paid record (no subscription row) is excluded and never revenue, but is reported', () => {
    const unverified = shop({ plan: 'pro', billingStatus: 'inactive' }, { plan: null });
    const c = summarizeCommercial([unverified, paidSolo()]);
    expect(c.revenue.mrr).toBe(PLAN_MONTHLY_PRICE.solo);
    expect(c.revenue.excluded.unverified).toBe(1);
    expect(c.subscriptions.unverified).toBe(1);
    expect(c.reconciliation).toBe('unverified');
  });

  it('contradictory shop-plan and billing states are excluded from revenue and fail the reconciliation closed', () => {
    const payingButFree = shop({ plan: 'free', subscription: sub('active') }, { plan: 'solo' });
    const disagreeing = shop({ plan: 'solo', billingStatus: 'past_due', subscription: sub('active') }, { plan: 'solo' });
    const c = summarizeCommercial([payingButFree, disagreeing, paidSolo()]);
    expect(c.revenue.mrr).toBe(PLAN_MONTHLY_PRICE.solo); // only the verified one
    expect(c.revenue.excluded.mismatch).toBe(2);
    expect(c.subscriptions.mismatch).toBe(2);
    expect(c.reconciliation).toBe('mismatch');
  });

  it('internal shops are excluded from every commercial figure, even with an active subscription', () => {
    const internal = shop({ plan: 'professional', isInternal: true, subscription: sub('active') }, { plan: 'professional' });
    const c = summarizeCommercial([internal]);
    expect(c.revenue.mrr).toBe(0);
    expect(c.subscriptions.total).toBe(0);
    expect(c.subscriptions.active).toBe(0);
    expect(c.subscriptions.internalShops).toBe(1);
    expect(c.reconciliation).toBe('reconciled');
  });

  it('a manual-provider or reference-less active subscription is not provider-backed recurring revenue', () => {
    const manual = paidSolo({}, sub('active', { billingProvider: 'manual' }));
    const noRef = paidSolo({}, sub('active', { hasProviderReference: false }));
    const c = summarizeCommercial([manual, noRef]);
    expect(c.revenue.mrr).toBe(0);
    expect(c.revenue.excluded.notProviderBacked).toBe(2);
  });

  it('an enterprise plan has no known recurring price: it contributes $0 and is reported as unpriced, never invented', () => {
    const enterprise = shop({ plan: 'enterprise', billingStatus: 'active', subscription: sub('active') }, { plan: 'enterprise' });
    const c = summarizeCommercial([enterprise, paidSolo()]);
    expect(c.revenue.mrr).toBe(PLAN_MONTHLY_PRICE.solo);
    expect(c.revenue.excluded.unpriced).toBe(1);
    expect(c.revenue.arpa).toBe(PLAN_MONTHLY_PRICE.solo); // unpriced shop is not in the denominator
  });

  it('billing-provider trials are counted separately from profile trial access', () => {
    const profileTrial = shop({ plan: 'trial', trialEndsAt: new Date(Date.now() + 3 * 86400000).toISOString() });
    const billingTrial = shop({ plan: 'trial', trialEndsAt: new Date(Date.now() + 3 * 86400000).toISOString(), subscription: sub('trialing') }, { plan: 'professional' });
    const c = summarizeCommercial([profileTrial, billingTrial]);
    expect(c.subscriptions.trialing).toBe(1); // only the row-backed one
    expect(c.subscriptions.total).toBe(1);
  });

  it('archived shops with a verified subscription still count: money is money', () => {
    const c = summarizeCommercial([paidSolo({ archived: true })]);
    expect(c.revenue.mrr).toBe(PLAN_MONTHLY_PRICE.solo);
  });
});
