/**
 * PaymentProvider interface — the contract every payment provider must satisfy.
 *
 * This is the ONLY file that defines what a payment provider must do.
 * Adding Stripe (or any future provider) means implementing this interface —
 * zero changes required in billing UI, feature gates, or API routes.
 */

import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  CustomerPortalInput,
  CustomerPortalResult,
  RedlinedCustomer,
  RedlinedSubscription,
  WebhookVerificationResult,
  PaymentWebhookEvent,
} from './types';

export interface PaymentProvider {
  /** Create a hosted checkout session and return the URL to redirect the user. */
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult>;

  /** Create a billing portal session so the user can manage their subscription. */
  createCustomerPortalSession(input: CustomerPortalInput): Promise<CustomerPortalResult>;

  /** Fetch a customer by their provider-specific customer ID. Returns null if not found. */
  getCustomer(providerCustomerId: string): Promise<RedlinedCustomer | null>;

  /** Fetch a subscription by provider-specific subscription ID. Returns null if not found. */
  getSubscription(providerSubscriptionId: string): Promise<RedlinedSubscription | null>;

  /** Cancel a subscription immediately or at period end (provider default). */
  cancelSubscription(providerSubscriptionId: string): Promise<void>;

  /** Resume a subscription that was set to cancel at period end. */
  resumeSubscription(providerSubscriptionId: string): Promise<void>;

  /** Upgrade or downgrade a subscription to a different plan/interval. */
  updateSubscription(
    providerSubscriptionId: string,
    planId: string,
    billingInterval: string,
  ): Promise<void>;

  /** Verify the webhook signature. Must be called before processing any event. */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookVerificationResult>;

  /** Process a verified webhook event. Idempotency is handled by billing-service. */
  handleWebhookEvent(event: PaymentWebhookEvent): Promise<void>;
}
