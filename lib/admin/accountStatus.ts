/**
 * lib/admin/accountStatus.ts
 * THE canonical commercial-state resolver for the owner portal. Pure — no
 * database access — so it is unit-testable and can be shared by every consumer:
 * the Owner Overview, Accounts, Account detail, the reconciliation list and the
 * Billing Health subscription/revenue figures. Nothing else may re-derive "what
 * state is this shop in commercially".
 *
 * Entitlement is NOT decided here. `planState` is always exactly
 * lib/planGate getPlanStatus(plan, trialEndsAt) — the function that gates the
 * product (profiles.plan / profiles.trial_ends_at). This module only describes
 * how that entitlement relates to the provider-synced billing record
 * (shop_subscriptions), which is enrichment, never the entitlement source.
 *
 * ── Primary states (exactly one per shop) ───────────────────────────────────
 *   internal                  explicit INTERNAL_SHOP_IDS marker only
 *   free                      entitlement free (an expired stored trial is still free)
 *   trialing                  entitlement trial ("Trial access": profile trial)
 *   active_paid               paid entitlement + active subscription, records agree
 *   cancel_scheduled          as active_paid, but cancel_at_period_end is set
 *   past_due                  payment failed
 *   cancelled_access_retained cancelled billing, paid entitlement kept (documented policy)
 *   expired                   subscription expired and entitlement is free
 *   paid_unverified           paid entitlement the billing record does not confirm
 *                             (unverifiedReason: no_billing_record | unrecognised_subscription_status)
 *   billing_mismatch          the records contradict each other (mismatchKind says how)
 *
 * ── Precedence ──────────────────────────────────────────────────────────────
 *   1. internal always wins and is excluded from every commercial total.
 *   2. Contradictory evidence FAILS CLOSED to billing_mismatch: it is never
 *      presented as confirmed paid revenue, and never resolved by guessing which
 *      record is right.
 *   3. Paid entitlement without confirming billing evidence is paid_unverified,
 *      not revenue. A plan label alone is not payment.
 *   4. Only active_paid / cancel_scheduled with a real provider reference are
 *      `revenueVerified`; nothing else contributes to MRR/ARR/ARPA.
 *
 * "Paid access, no billing record" records only what the data shows. It does not
 * say the account is a customer, complimentary, internal or a billing failure —
 * no persisted field distinguishes those. There is no "complimentary" field, and
 * a `manual` billing provider is not proof of complimentary access.
 */
import { getPlanStatus, trialDaysLeft as computeTrialDaysLeft, type PlanStatus } from '@/lib/planGate';
import { TRIAL_ACCESS_LABEL, PAID_NO_BILLING_RECORD_LABEL } from '@/lib/admin/terminology';

export type AccountStatus =
  | 'internal'
  | 'free'
  | 'trialing'
  | 'active_paid'
  | 'cancel_scheduled'
  | 'past_due'
  | 'cancelled_access_retained'
  | 'expired'
  | 'paid_unverified'
  | 'billing_mismatch';

export type MismatchKind =
  | 'free_plan_active_subscription'
  | 'billing_trial_free_entitlement'
  | 'trial_entitlement_active_subscription'
  | 'billing_status_disagrees'
  | 'paid_access_after_expiry';

export type UnverifiedReason = 'no_billing_record' | 'unrecognised_subscription_status';

export interface SubscriptionSnapshot {
  status: string;
  billingProvider: string | null;
  /** shop_subscriptions.cancel_at_period_end */
  cancelAtPeriodEnd?: boolean;
  /** A provider subscription id is recorded. The id itself never enters this module. */
  hasProviderReference?: boolean;
}

export interface AccountStatusInput {
  /** profiles.plan */
  plan: string | null;
  /** profiles.trial_ends_at */
  trialEndsAt: string | null;
  /** profiles.billing_status — a secondary copy kept in sync by the Creem webhook; not authoritative on its own. */
  billingStatus: string | null;
  /** True only for a shop in INTERNAL_SHOP_IDS — excluded from billing framing entirely. */
  isInternal: boolean;
  /** Most recent shop_subscriptions row for this profile's shop, if any. */
  subscription: SubscriptionSnapshot | null;
}

export interface AccountStatusResult {
  status: AccountStatus;
  /** The raw planGate classification this status was built from. Never altered by billing evidence. */
  planState: PlanStatus;
  trialDaysLeft: number | null;
  /** The stored plan is 'trial' but its end date has passed. Entitlement is Free; this is only history. */
  trialExpired: boolean;
  /**
   * The shop needs an owner's review: its records contradict each other, or its
   * paid access is unverified. True exactly when mismatchKind or unverifiedReason is set.
   */
  billingMismatch: boolean;
  /** Set exactly when status is billing_mismatch. */
  mismatchKind: MismatchKind | null;
  /** Set exactly when status is paid_unverified. */
  unverifiedReason: UnverifiedReason | null;
  mismatchReason: string | null;
  /** Set for expected-but-noteworthy states (e.g. cancelled-with-access-retained) — not a defect, just something the owner may want to review. */
  policyNote: string | null;
  /**
   * True only for a confirmed, recurring, provider-backed subscription:
   * active_paid or cancel_scheduled, with a recorded provider reference and a
   * real (non-manual, non-internal) provider. The only states that may count as revenue.
   */
  revenueVerified: boolean;
}

const CANCELLED_POLICY_NOTE =
  'Billing cancelled — access retained. The Creem webhook intentionally does not revoke profiles.plan on cancellation. This is current product policy, verified against the webhook source. May still warrant owner review.';

const NON_RECURRING_PROVIDERS = new Set(['manual', 'internal']);

type Extra = Partial<Omit<AccountStatusResult, 'status' | 'planState' | 'revenueVerified'>>;

function result(status: AccountStatus, planState: PlanStatus, extra: Extra = {}, sub: SubscriptionSnapshot | null = null): AccountStatusResult {
  const base: AccountStatusResult = {
    status, planState, trialDaysLeft: null, trialExpired: false,
    billingMismatch: false, mismatchKind: null, unverifiedReason: null,
    mismatchReason: null, policyNote: null, revenueVerified: false,
    ...extra,
  };
  const confirmed = status === 'active_paid' || status === 'cancel_scheduled';
  base.revenueVerified = confirmed
    && !!sub?.hasProviderReference
    && !!sub.billingProvider
    && !NON_RECURRING_PROVIDERS.has(sub.billingProvider);
  return base;
}

function mismatch(kind: MismatchKind, reason: string): Extra {
  return { billingMismatch: true, mismatchKind: kind, mismatchReason: reason };
}

function unverified(reason: UnverifiedReason, text: string): Extra {
  return { billingMismatch: true, unverifiedReason: reason, mismatchReason: text };
}

export function deriveAccountStatus(input: AccountStatusInput): AccountStatusResult {
  if (input.isInternal) {
    return result('internal', 'pro');
  }

  const planState = getPlanStatus(input.plan, input.trialEndsAt);
  const sub = input.subscription;
  const trialExpired = planState === 'free' && input.plan === 'trial';

  // ── No billing record ──────────────────────────────────────────────────────
  if (!sub) {
    if (planState === 'free') return result('free', planState, { trialExpired });
    if (planState === 'trial') return result('trialing', planState, { trialDaysLeft: computeTrialDaysLeft(input.trialEndsAt) });
    // Paid entitlement. profiles.billing_status is the only other signal.
    if (input.billingStatus === 'past_due') return result('past_due', planState);
    if (input.billingStatus === 'cancelled') return result('cancelled_access_retained', planState, { policyNote: CANCELLED_POLICY_NOTE });
    return result('paid_unverified', planState, unverified(
      'no_billing_record',
      'profiles.plan grants paid access but no shop_subscriptions row exists for this shop, and profiles.billing_status does not corroborate active billing.',
    ));
  }

  const st = sub.status;

  // ── Free entitlement with a billing record ─────────────────────────────────
  if (planState === 'free') {
    // Entitlement says free, but the provider-synced record says the shop is
    // being billed. The entitlement stays free (that is what the product grants);
    // the shop must not look like an ordinary free account, and it is not revenue.
    if (st === 'active' || st === 'past_due') {
      return result('billing_mismatch', planState, {
        trialExpired,
        ...mismatch('free_plan_active_subscription',
          `shop_subscriptions.status is "${st}" but profiles.plan grants only free access — this shop may be paying without receiving paid features.`),
      }, sub);
    }
    if (st === 'trialing') {
      return result('billing_mismatch', planState, {
        trialExpired,
        ...mismatch('billing_trial_free_entitlement',
          'shop_subscriptions says this shop is on a billing-provider trial, but profiles.plan/trial_ends_at grant only free access.'),
      }, sub);
    }
    if (st === 'expired') return result('expired', planState, { trialExpired }, sub);
    return result('free', planState, { trialExpired }, sub);
  }

  // ── Profile trial with a billing record ────────────────────────────────────
  if (planState === 'trial') {
    if (st === 'active' || st === 'past_due') {
      return result('billing_mismatch', planState, {
        trialDaysLeft: computeTrialDaysLeft(input.trialEndsAt),
        ...mismatch('trial_entitlement_active_subscription',
          `shop_subscriptions.status is "${st}" but profiles still show a trial rather than a paid plan.`),
      }, sub);
    }
    return result('trialing', planState, { trialDaysLeft: computeTrialDaysLeft(input.trialEndsAt) }, sub);
  }

  // ── Paid entitlement with a billing record ─────────────────────────────────
  // shop_subscriptions is the more current, provider-synced record, so its status
  // decides the branch; profiles.billing_status (written by the same webhook
  // handler) only matters when it disagrees with the status written alongside it.
  const disagreeWith = (expected: string) => !!input.billingStatus && input.billingStatus !== expected;

  if (st === 'past_due') {
    return disagreeWith('past_due')
      ? result('billing_mismatch', planState, mismatch('billing_status_disagrees',
        `shop_subscriptions.status is "past_due" but profiles.billing_status is "${input.billingStatus}" — these are written together by the same webhook handler and should agree.`), sub)
      : result('past_due', planState, {}, sub);
  }

  if (st === 'cancelled') {
    return result('cancelled_access_retained', planState, { policyNote: CANCELLED_POLICY_NOTE }, sub);
  }

  if (st === 'active') {
    if (disagreeWith('active')) {
      return result('billing_mismatch', planState, mismatch('billing_status_disagrees',
        `shop_subscriptions.status is "active" but profiles.billing_status is "${input.billingStatus}" — these are written together by the same webhook handler and should agree.`), sub);
    }
    return result(sub.cancelAtPeriodEnd ? 'cancel_scheduled' : 'active_paid', planState, {}, sub);
  }

  if (st === 'expired') {
    return result('billing_mismatch', planState, mismatch('paid_access_after_expiry',
      'shop_subscriptions.status is "expired" but profiles.plan still grants paid access.'), sub);
  }

  // A subscription row exists but in a status the live Creem webhook does not
  // itself write (trialing/suspended/manual — only produced by the disabled
  // commercial billing path or by hand). It does not confirm the paid plan.
  return result('paid_unverified', planState, unverified(
    'unrecognised_subscription_status',
    `profiles.plan grants paid access but the matching shop_subscriptions row has status "${st}", which the live billing webhook does not itself produce.`,
  ), sub);
}

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  internal: 'Internal (D1)',
  free: 'Free',
  trialing: TRIAL_ACCESS_LABEL,
  active_paid: 'Active paid',
  cancel_scheduled: 'Active — cancellation scheduled',
  past_due: 'Past due',
  cancelled_access_retained: 'Cancelled — access retained',
  expired: 'Subscription expired',
  paid_unverified: 'Paid access, unverified',
  billing_mismatch: 'Billing mismatch',
};

export const UNVERIFIED_REASON_LABELS: Record<UnverifiedReason, string> = {
  no_billing_record: PAID_NO_BILLING_RECORD_LABEL,
  unrecognised_subscription_status: 'Paid access, billing status unrecognised',
};

/** The states that describe an ongoing, confirmed subscription. */
export function isConfirmedSubscription(status: AccountStatus): boolean {
  return status === 'active_paid' || status === 'cancel_scheduled';
}

/**
 * Portfolio-level reconciliation indicator, shared by the Owner Overview and
 * Billing Health so the two can never disagree. Internal shops never count.
 *   mismatch   at least one shop's records contradict each other
 *   unverified none contradict, but at least one paid entitlement is unconfirmed
 *   reconciled every non-internal shop's billing evidence agrees with its entitlement
 */
export type ReconciliationState = 'reconciled' | 'unverified' | 'mismatch';

export function reconciliationOf(results: ReadonlyArray<AccountStatusResult>): ReconciliationState {
  let unverifiedSeen = false;
  for (const r of results) {
    if (r.status === 'internal') continue;
    if (r.status === 'billing_mismatch') return 'mismatch';
    if (r.status === 'paid_unverified') unverifiedSeen = true;
  }
  return unverifiedSeen ? 'unverified' : 'reconciled';
}

/**
 * Login-recency badge. Deliberately NOT a product/feature-activity signal —
 * last_sign_in_at only says the account authenticated, not that any feature
 * was used. Never described as "inactive" (that word is reserved for the
 * billing-record status above) — always as "no login in N+ days".
 */
export const LOGIN_INACTIVITY_THRESHOLD_DAYS = 60;

export function isLoginInactive(lastSignInAt: string | null | undefined): boolean {
  if (lastSignInAt === undefined) return false; // not fetched — unknown, not asserted inactive
  if (lastSignInAt === null) return true; // never signed in
  const ms = Date.now() - new Date(lastSignInAt).getTime();
  return ms > LOGIN_INACTIVITY_THRESHOLD_DAYS * 86400000;
}
