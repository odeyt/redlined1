/**
 * commercial/providers/BillingProvider.ts
 * Provider interface — all billing providers must implement this.
 * Application code never calls providers directly; use billingService.ts.
 */

import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  BillingPortalInput,
  BillingPortalResult,
  ShopSubscription,
  SubscriptionStatus,
} from '@/commercial/shared/types';

export interface IBillingProvider {
  readonly name: string;

  /** Create a hosted checkout session and return the redirect URL. */
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult>;

  /** Create a billing portal session for the customer to manage their subscription. */
  createBillingPortalSession(input: BillingPortalInput): Promise<BillingPortalResult>;

  /** Verify webhook signature and return normalized event payload. */
  handleWebhook(rawBody: string, signature: string): Promise<WebhookHandleResult>;

  /** Fetch current subscription state from provider. */
  getSubscription(providerSubscriptionId: string): Promise<RemoteSubscription | null>;

  /** Cancel subscription at the provider level. */
  cancelSubscription(providerSubscriptionId: string, immediately: boolean): Promise<boolean>;

  /** Update subscription (plan change) at the provider level. */
  updateSubscription(providerSubscriptionId: string, newProductId: string): Promise<boolean>;
}

export interface WebhookHandleResult {
  valid: boolean;
  eventType: string | null;
  providerEventId: string | null;
  shopId: string | null;
  payload: Record<string, unknown>;
  error?: string;
  /** Normalized subscription update if this is a subscription event */
  subscriptionUpdate?: Partial<ShopSubscription> & { providerCustomerId?: string; providerSubscriptionId?: string };
}

/**
 * A provider's subscription status, as this module stores it — or `null` when it cannot be read.
 *
 * ONE mapping for the whole commercial layer. There used to be two, and both ended the same way:
 *   - creemProvider.ts  mapCreemStatus:    `return map[creemStatus] ?? 'active'`
 *   - billingService.ts mapProviderStatus: a fall-through `return 'active'`
 * Every unknown, empty or misspelled status became ACTIVE — a grant. The call site added a third default,
 * `String(data.status ?? 'active')`, so even an absent status was active before either map saw it.
 *
 * A separate list of accepted statuses in creemProvider.getSubscription then drifted from the second map:
 * it accepted 'unpaid' and 'paused', which mapProviderStatus did not handle, so both came out 'active'. That is
 * why "is this status known" is now answered by THIS function returning non-null, and nothing else.
 *
 *   unpaid -> past_due    money is owed; the same answer lib/billing/creemAuthoritative.ts gives
 *   paused -> suspended   service is not being provided. A judgment call: this union has no 'paused'
 *
 * 'manual' is an internal status and never comes from a provider, so it is not mapped from one.
 */
export function mapRemoteStatus(raw: unknown): SubscriptionStatus | null {
  switch (String(raw ?? '').trim().toLowerCase()) {
    case 'active':    return 'active';
    case 'trialing':  return 'trialing';
    case 'past_due':
    case 'unpaid':    return 'past_due';
    case 'cancelled':
    case 'canceled':  return 'cancelled';
    case 'expired':   return 'expired';
    case 'suspended':
    case 'paused':    return 'suspended';
    default:          return null;
  }
}

/**
 * Thrown when a provider answered, but the answer cannot be read without inventing part of it.
 *
 * Distinct from `null`, which means the provider has no such subscription. A caller may reasonably skip an
 * absent subscription; it must not skip one it simply failed to understand, because that is how a subscription
 * silently keeps whatever status it already had.
 */
export class RemoteSubscriptionUnusableError extends Error {
  readonly reason: string;
  constructor(reason: string, providerSubscriptionId: string) {
    super(`Remote subscription ${providerSubscriptionId || '(no id)'} cannot be read safely: ${reason}`);
    this.name = 'RemoteSubscriptionUnusableError';
    this.reason = reason;
  }
}

export interface RemoteSubscription {
  providerSubscriptionId: string;
  providerCustomerId: string;
  status: string;
  /**
   * NULLABLE. A period the provider did not give us is unknown, not `now`.
   *
   * These were non-nullable and were filled with `Date.now()` when the fields were missing — which was always,
   * because the reader used field names Creem does not send. A subscription's period is the thing a renewal
   * date is shown from; inventing it produces a date a customer could be told.
   */
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: Date | null;
}
