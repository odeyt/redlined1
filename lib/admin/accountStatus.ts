/**
 * lib/admin/accountStatus.ts
 * Pure status-derivation logic for the owner-admin account directory.
 *
 * No database access here — this module only classifies data that has
 * already been read, so it is unit-testable without mocking Supabase.
 *
 * Deliberately reuses getPlanStatus()/trialDaysLeft() from lib/planGate.ts
 * rather than re-deriving "is this shop entitled to paid features" — that
 * function is what actually gates the product today (via profiles.plan and
 * profiles.trial_ends_at), and a second, slightly different definition here
 * would let the admin portal disagree with what customers actually see.
 *
 * shop_subscriptions (the Creem-synced table) is layered on top as
 * enrichment, not as the source of truth for entitlement.
 *
 * `billingMismatch` is reserved for states that genuinely contradict the
 * verified rules — i.e. two fields that are SUPPOSED to move together (per
 * app/api/billing/webhook/creem/route.ts, which writes shop_subscriptions
 * and profiles.billing_status in the same handler) have drifted apart, or a
 * paid plan has no billing record backing it at all. It is NOT used for a
 * cancelled subscription whose profile still grants paid access — that is
 * documented, intentional product policy (see cancelled_access_retained
 * below), not a defect, and is surfaced via `policyNote` instead.
 *
 * There is no "complimentary" field anywhere in the schema. A `manual`
 * billing_provider is not proof of complimentary access — it is not
 * classified as a status here at all; the UI may note it informationally
 * next to the raw subscription record, never as a status/filter bucket.
 */
import { getPlanStatus, trialDaysLeft as computeTrialDaysLeft, type PlanStatus } from '@/lib/planGate';

export type AccountStatus =
  | 'free'
  | 'trialing'
  | 'active_paid'
  | 'past_due'
  | 'cancelled_access_retained'
  | 'paid_billing_unverified'
  | 'internal';

export interface SubscriptionSnapshot {
  status: string;
  billingProvider: string | null;
}

export interface AccountStatusInput {
  /** profiles.plan */
  plan: string | null;
  /** profiles.trial_ends_at */
  trialEndsAt: string | null;
  /** profiles.billing_status — a secondary copy kept in sync by the Creem webhook; not authoritative on its own. */
  billingStatus: string | null;
  /** True for the two hardcoded D1 internal shop IDs — excluded from billing framing entirely. */
  isInternal: boolean;
  /** Most recent shop_subscriptions row for this profile's shop, if any. */
  subscription: SubscriptionSnapshot | null;
}

export interface AccountStatusResult {
  status: AccountStatus;
  /** The raw planGate classification this status was built from. */
  planState: PlanStatus;
  trialDaysLeft: number | null;
  /** True only for a genuine contradiction between fields that are supposed to agree. */
  billingMismatch: boolean;
  mismatchReason: string | null;
  /** Set for expected-but-noteworthy states (e.g. cancelled-with-access-retained) — not a defect, just something the owner may want to review. */
  policyNote: string | null;
}

const CANCELLED_POLICY_NOTE =
  'Billing cancelled — access retained. The Creem webhook intentionally does not revoke profiles.plan on cancellation. This is current product policy, verified against the webhook source. May still warrant owner review.';

export function deriveAccountStatus(input: AccountStatusInput): AccountStatusResult {
  if (input.isInternal) {
    return { status: 'internal', planState: 'pro', trialDaysLeft: null, billingMismatch: false, mismatchReason: null, policyNote: null };
  }

  const planState = getPlanStatus(input.plan, input.trialEndsAt);

  if (planState === 'free') {
    // Entitlement (profiles.plan) says free, but the provider-synced record says
    // the shop is being billed. The status stays "free" (that is what the product
    // grants), but this must not look like an ordinary free account.
    const billed = input.subscription?.status === 'active' || input.subscription?.status === 'past_due';
    return {
      status: 'free',
      planState,
      trialDaysLeft: null,
      billingMismatch: billed,
      mismatchReason: billed
        ? `shop_subscriptions.status is "${input.subscription!.status}" but profiles.plan grants only free access — this shop may be paying without receiving paid features.`
        : null,
      policyNote: null,
    };
  }

  if (planState === 'trial') {
    return {
      status: 'trialing',
      planState,
      trialDaysLeft: computeTrialDaysLeft(input.trialEndsAt),
      billingMismatch: false,
      mismatchReason: null,
      policyNote: null,
    };
  }

  // planState === 'pro' from here down. shop_subscriptions is the more
  // current, provider-synced record when it exists, so its status decides
  // which branch applies; profiles.billing_status (a secondary copy written
  // in the same webhook handler) only ever contributes to the
  // billingMismatch flag when it disagrees with a status that is supposed
  // to be written alongside it.
  const sub = input.subscription;

  if (sub) {
    if (sub.status === 'past_due') {
      const disagree = !!input.billingStatus && input.billingStatus !== 'past_due';
      return {
        status: 'past_due',
        planState,
        trialDaysLeft: null,
        billingMismatch: disagree,
        mismatchReason: disagree
          ? `shop_subscriptions.status is "past_due" but profiles.billing_status is "${input.billingStatus}" — these are written together by the same webhook handler and should agree.`
          : null,
        policyNote: null,
      };
    }

    if (sub.status === 'cancelled') {
      return {
        status: 'cancelled_access_retained',
        planState,
        trialDaysLeft: null,
        billingMismatch: false,
        mismatchReason: null,
        policyNote: CANCELLED_POLICY_NOTE,
      };
    }

    if (sub.status === 'active') {
      const disagree = !!input.billingStatus && input.billingStatus !== 'active';
      return {
        status: 'active_paid',
        planState,
        trialDaysLeft: null,
        billingMismatch: disagree,
        mismatchReason: disagree
          ? `shop_subscriptions.status is "active" but profiles.billing_status is "${input.billingStatus}" — these are written together by the same webhook handler and should agree.`
          : null,
        policyNote: null,
      };
    }

    // A subscription row exists but in a status the live Creem webhook does
    // not itself write (e.g. 'trialing'/'expired'/'suspended' — only ever
    // produced by the currently-disabled commercial billing path). The
    // profile grants paid access but this billing record doesn't clearly
    // corroborate it.
    return {
      status: 'paid_billing_unverified',
      planState,
      trialDaysLeft: null,
      billingMismatch: true,
      mismatchReason: `profiles.plan grants paid access but the matching shop_subscriptions row has status "${sub.status}", which the live billing webhook does not itself produce.`,
      policyNote: null,
    };
  }

  // No subscription row at all. Fall back to profiles.billing_status, the
  // only other signal available.
  if (input.billingStatus === 'past_due') {
    return { status: 'past_due', planState, trialDaysLeft: null, billingMismatch: false, mismatchReason: null, policyNote: null };
  }
  if (input.billingStatus === 'cancelled') {
    return {
      status: 'cancelled_access_retained',
      planState,
      trialDaysLeft: null,
      billingMismatch: false,
      mismatchReason: null,
      policyNote: CANCELLED_POLICY_NOTE,
    };
  }

  return {
    status: 'paid_billing_unverified',
    planState,
    trialDaysLeft: null,
    billingMismatch: true,
    mismatchReason: 'profiles.plan grants paid access but no shop_subscriptions row exists for this shop, and profiles.billing_status does not corroborate active billing.',
    policyNote: null,
  };
}

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  free: 'Free',
  trialing: 'Trialing',
  active_paid: 'Active (paid)',
  past_due: 'Past due',
  cancelled_access_retained: 'Billing cancelled — access retained',
  paid_billing_unverified: 'Paid — billing record unverified',
  internal: 'Internal (D1)',
};

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
