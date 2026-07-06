/**
 * Stripe payment provider — PLACEHOLDER IMPLEMENTATION.
 *
 * Methods are stubbed and will throw clear "not implemented" errors.
 * This provider can replace CreemPaymentProvider without changing
 * any billing UI, feature gates, or API routes.
 *
 * To activate:
 *   1. Install: npm install stripe
 *   2. Implement each method using the Stripe SDK
 *   3. Set PAYMENT_PROVIDER=stripe in your environment
 *   4. Add STRIPE_* environment variables (see .env.example)
 *
 * This file is the ONLY place Stripe-specific logic should exist.
 */

import type { PaymentProvider } from '../payment-provider';
import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  CustomerPortalInput,
  CustomerPortalResult,
  RedlinedCustomer,
  RedlinedSubscription,
  WebhookVerificationResult,
  PaymentWebhookEvent,
} from '../types';

function notImplemented(method: string): never {
  throw new Error(
    `StripePaymentProvider.${method} is not yet implemented. ` +
    `Set PAYMENT_PROVIDER=creem to continue using Creem.io.`
  );
}

export class StripePaymentProvider implements PaymentProvider {

  async createCheckoutSession(
    _input: CheckoutSessionInput,
  ): Promise<CheckoutSessionResult> {
    return notImplemented('createCheckoutSession');
  }

  async createCustomerPortalSession(
    _input: CustomerPortalInput,
  ): Promise<CustomerPortalResult> {
    return notImplemented('createCustomerPortalSession');
  }

  async getCustomer(_providerCustomerId: string): Promise<RedlinedCustomer | null> {
    return notImplemented('getCustomer');
  }

  async getSubscription(_providerSubscriptionId: string): Promise<RedlinedSubscription | null> {
    return notImplemented('getSubscription');
  }

  async cancelSubscription(_providerSubscriptionId: string): Promise<void> {
    notImplemented('cancelSubscription');
  }

  async resumeSubscription(_providerSubscriptionId: string): Promise<void> {
    notImplemented('resumeSubscription');
  }

  async updateSubscription(
    _providerSubscriptionId: string,
    _planId: string,
    _billingInterval: string,
  ): Promise<void> {
    notImplemented('updateSubscription');
  }

  async verifyWebhook(
    _rawBody: string,
    _headers: Record<string, string>,
  ): Promise<WebhookVerificationResult> {
    return notImplemented('verifyWebhook');
  }

  async handleWebhookEvent(_event: PaymentWebhookEvent): Promise<void> {
    notImplemented('handleWebhookEvent');
  }
}
