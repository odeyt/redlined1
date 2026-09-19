/**
 * lib/admin/terminology.ts
 * The owner-portal's user-facing wording for figures that come from different
 * sources, kept in one client-safe place (no server imports) so the Owner
 * Overview, Accounts directory and Billing Health cannot drift into showing
 * different numbers under the same label.
 */

/** Profile entitlement: a stored plan plus a trial end date that has not passed (profiles.plan / trial_ends_at). */
export const TRIAL_ACCESS_LABEL = 'Trial access';

/** Synchronised subscription rows with a trialing status (shop_subscriptions). */
export const BILLING_PROVIDER_TRIALS_LABEL = 'Billing-provider trials';

/** A stored plan of "trial" whose end date has passed — the account is on Free. */
export const TRIAL_EXPIRED_LABEL = 'Trial expired';

/** A paid plan on the profile with no shop_subscriptions row behind it. Says nothing about why. */
export const PAID_NO_BILLING_RECORD_LABEL = 'Paid access, no billing record';

export const TRIAL_ACCESS_EXPLANATION =
  'Trial access comes from the profile entitlement: a stored trial plan and a trial end date that has not yet passed.';

export const BILLING_PROVIDER_TRIALS_EXPLANATION =
  'Billing-provider trials come from synchronized subscription rows (shop_subscriptions).';

export const TRIAL_COUNTS_MAY_DIFFER =
  'These values can differ while billing-provider trial synchronization is disabled or incomplete — a trial started at signup is recorded on the profile, not as a subscription row.';

export const EXPIRED_TRIAL_NOTE =
  'The stored plan still says trial, but its end date has passed, so this account is on Free. Nothing has been changed or written.';

export const RECONCILIATION_READ_ONLY_NOTE =
  'Read-only: nothing here changes access, plans, subscriptions or billing records.';

export type ReconciliationReason =
  | 'paid_no_billing_record'
  | 'active_subscription_free_entitlement'
  | 'billing_events_without_subscription'
  | 'billing_status_conflict'
  | 'unrecognised_subscription_status';

export const RECONCILIATION_REASON_LABELS: Record<ReconciliationReason, string> = {
  paid_no_billing_record: PAID_NO_BILLING_RECORD_LABEL,
  active_subscription_free_entitlement: 'Active subscription, free entitlement',
  billing_events_without_subscription: 'Billing events, no subscription row',
  billing_status_conflict: 'Profile and subscription billing records conflict',
  unrecognised_subscription_status: 'Subscription in an unrecognised status',
};

/** The portfolio-level reconciliation indicator shown on the Owner Overview and Billing Health. */
export const RECONCILIATION_STATE_LABELS = {
  reconciled: 'Reconciled',
  unverified: 'Unverified',
  mismatch: 'Mismatch',
} as const;

export const RECONCILIATION_STATE_EXPLANATIONS = {
  reconciled: 'Every non-internal shop\'s billing evidence agrees with its entitlement.',
  unverified: 'No records contradict each other, but at least one paid entitlement is not confirmed by a billing record. Unverified access is not counted as revenue.',
  mismatch: 'At least one shop\'s billing records contradict each other, or a billing record has no account. Those shops are excluded from revenue until reviewed.',
} as const;

/** Plan cell text: an expired stored trial is shown as such, not as if it were a current plan. */
export function displayPlan(item: { trialExpired: boolean; planDisplayName: string | null }): string {
  if (item.trialExpired) return TRIAL_EXPIRED_LABEL;
  return item.planDisplayName ?? '—';
}
