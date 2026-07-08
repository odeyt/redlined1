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

export interface RemoteSubscription {
  providerSubscriptionId: string;
  providerCustomerId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  cancelledAt: Date | null;
}
