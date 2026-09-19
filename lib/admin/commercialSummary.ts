/**
 * lib/admin/commercialSummary.ts
 * Pure portfolio-level commercial figures computed from already-classified shops.
 * The Owner Overview and Billing Health both call summarizeCommercial() on the
 * output of the one resolver (lib/admin/accountStatus.ts), so they cannot report
 * different subscription counts, revenue or reconciliation for the same data.
 *
 * Revenue rules (owner-visible, so they are stated here once):
 *  - Internal shops are excluded from everything.
 *  - MRR counts only `revenueVerified` subscriptions: active_paid or
 *    cancel_scheduled, with a real provider reference. Unverified, mismatched,
 *    manual-provider and unpriced subscriptions never contribute.
 *  - cancel_scheduled still pays this period, so it counts toward MRR and also
 *    toward revenue-at-risk. past_due is at risk but not MRR.
 *  - A missing billing interval is assumed monthly and reported, never hidden. An interval
 *    that is present but not 'monthly' or 'annual' is NOT priced: the subscription is
 *    excluded from MRR and counted under excluded.unrecognisedInterval.
 *  - ARR is run-rate: MRR × 12, not booked revenue.
 *  - A plan with no known recurring price (enterprise contracts) contributes $0
 *    and is counted as unpriced; no figure is invented.
 */
import {
  reconciliationOf, type AccountStatus, type AccountStatusResult, type ReconciliationState,
} from '@/lib/admin/accountStatus';
import { classifyInterval, normalizedMonthlyRevenue } from '@/commercial/analytics/pricing';

export interface CommercialShop {
  /** Opaque key for the shop; never displayed. */
  shopId: string;
  archived: boolean;
  result: AccountStatusResult;
  /** shop_subscriptions.plan_key of the latest subscription row, if any. */
  planKey: string | null;
  /** shop_subscriptions.metadata.billing_interval, if recorded. */
  billingInterval: string | null;
  /** shop_subscriptions.status of the latest row, or null when there is no row. */
  subscriptionStatus: string | null;
}

export interface VerifiedRevenue {
  mrr: number;
  arr: number;
  arpa: number;
  mrrByPlan: Record<string, number>;
  revenueAtRisk: number;
  /** Monthly value of subscriptions the resolver classifies as past_due. A subset of revenueAtRisk's causes; cancel_scheduled is not included. */
  pastDueRevenue: number;
  /** Shops whose subscription is verified AND priced — the ARPA denominator. */
  pricedRecurringShops: number;
  excluded: {
    /** paid_unverified shops: paid plan, billing record missing or unrecognised. */
    unverified: number;
    /** billing_mismatch shops: records contradict each other. */
    mismatch: number;
    /** Confirmed-looking subscriptions without a real provider reference, or on a manual provider. */
    notProviderBacked: number;
    /** Verified subscriptions whose recorded billing interval is neither monthly nor annual: the price is unknown, so none is guessed. */
    unrecognisedInterval: number;
    /** Verified subscriptions on a plan with no known recurring price. */
    unpriced: number;
  };
  /** Verified subscriptions with no recorded billing interval, counted as monthly. */
  assumedMonthlyInterval: number;
}

export interface SubscriptionCounts {
  /** Non-internal shops with a subscription row. */
  total: number;
  /** Confirmed active subscriptions: active_paid + cancel_scheduled. */
  active: number;
  cancelScheduled: number;
  /** Billing-provider trials: subscription rows with a trialing status. Not "Trial access". */
  trialing: number;
  pastDue: number;
  cancelled: number;
  expired: number;
  suspended: number;
  byPlan: Record<string, number>;
  /** Internal shops that have a subscription row (excluded from every figure above). */
  internalShops: number;
  /** Shops whose paid access the billing record does not confirm. */
  unverified: number;
  /** Shops whose records contradict each other. */
  mismatch: number;
}

export interface CommercialSummary {
  reconciliation: ReconciliationState;
  subscriptions: SubscriptionCounts;
  revenue: VerifiedRevenue;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarizeCommercial(shops: ReadonlyArray<CommercialShop>): CommercialSummary {
  const external = shops.filter(s => s.result.status !== 'internal');

  const subscriptions: SubscriptionCounts = {
    total: 0, active: 0, cancelScheduled: 0, trialing: 0, pastDue: 0, cancelled: 0, expired: 0, suspended: 0,
    byPlan: {}, internalShops: 0, unverified: 0, mismatch: 0,
  };
  const revenue: VerifiedRevenue = {
    mrr: 0, arr: 0, arpa: 0, mrrByPlan: {}, revenueAtRisk: 0, pastDueRevenue: 0, pricedRecurringShops: 0,
    excluded: { unverified: 0, mismatch: 0, notProviderBacked: 0, unrecognisedInterval: 0, unpriced: 0 },
    assumedMonthlyInterval: 0,
  };

  for (const s of shops) {
    if (s.result.status === 'internal' && s.subscriptionStatus) subscriptions.internalShops++;
  }

  for (const s of external) {
    const status: AccountStatus = s.result.status;
    const subStatus = s.subscriptionStatus;

    if (subStatus) {
      subscriptions.total++;
      if (s.planKey) subscriptions.byPlan[s.planKey] = (subscriptions.byPlan[s.planKey] ?? 0) + 1;
      if (subStatus === 'trialing') subscriptions.trialing++;
      else if (subStatus === 'cancelled' || subStatus === 'canceled') subscriptions.cancelled++;
      else if (subStatus === 'expired') subscriptions.expired++;
      else if (subStatus === 'suspended') subscriptions.suspended++;
    }
    if (status === 'active_paid' || status === 'cancel_scheduled') subscriptions.active++;
    if (status === 'cancel_scheduled') subscriptions.cancelScheduled++;
    if (status === 'past_due') subscriptions.pastDue++;
    if (status === 'paid_unverified') { subscriptions.unverified++; revenue.excluded.unverified++; }
    if (status === 'billing_mismatch') { subscriptions.mismatch++; revenue.excluded.mismatch++; }

    const monthly = s.planKey ? normalizedMonthlyRevenue(s.planKey, s.billingInterval) : 0;

    if (status === 'past_due') {
      revenue.revenueAtRisk += monthly;
      revenue.pastDueRevenue += monthly;
      continue;
    }
    if (status !== 'active_paid' && status !== 'cancel_scheduled') continue;

    if (!s.result.revenueVerified) { revenue.excluded.notProviderBacked++; continue; }
    // A billing interval we do not recognise has no known price. Excluded and reported, never guessed.
    if (classifyInterval(s.billingInterval) === 'unrecognised') { revenue.excluded.unrecognisedInterval++; continue; }
    if (monthly <= 0) { revenue.excluded.unpriced++; continue; }

    revenue.mrr += monthly;
    revenue.pricedRecurringShops++;
    const plan = s.planKey as string;
    revenue.mrrByPlan[plan] = (revenue.mrrByPlan[plan] ?? 0) + monthly;
    if (!s.billingInterval) revenue.assumedMonthlyInterval++;
    if (status === 'cancel_scheduled') revenue.revenueAtRisk += monthly;
  }

  revenue.mrr = round2(revenue.mrr);
  revenue.arr = round2(revenue.mrr * 12);
  revenue.arpa = revenue.pricedRecurringShops > 0 ? round2(revenue.mrr / revenue.pricedRecurringShops) : 0;
  revenue.revenueAtRisk = round2(revenue.revenueAtRisk);
  revenue.pastDueRevenue = round2(revenue.pastDueRevenue);
  for (const k of Object.keys(revenue.mrrByPlan)) revenue.mrrByPlan[k] = round2(revenue.mrrByPlan[k]);

  return {
    reconciliation: reconciliationOf(external.map(s => s.result)),
    subscriptions,
    revenue,
  };
}
