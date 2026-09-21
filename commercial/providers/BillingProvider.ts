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
