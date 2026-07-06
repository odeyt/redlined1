/**
 * Redlined1 normalized payment types.
 * These types are provider-agnostic — no Creem or Stripe terminology leaks here.
 * All provider-specific shapes are mapped to these types inside their provider file.
 */

export type PaymentProviderName = 'creem' | 'stripe';

export type BillingInterval = 'monthly' | 'annual';

export type RedlinedPlanId = 'starter' | 'professional' | 'shop_pro' | 'enterprise';

/**
 * Normalized subscription statuses.
 * Both Creem and Stripe statuses are mapped to this set.
 */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'expired'
  | 'unknown';

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CheckoutSessionInput {
  userId: string;
  email: string;
  planId: RedlinedPlanId;
  billingInterval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CustomerPortalInput {
  userId: string;
  providerCustomerId: string;
  returnUrl: string;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface CheckoutSessionResult {
  checkoutUrl: string;
  sessionId: string;
  provider: PaymentProviderName;
}

export interface CustomerPortalResult {
  portalUrl: string;
  provider: PaymentProviderName;
}

// ─── Entity types ─────────────────────────────────────────────────────────────

export interface RedlinedCustomer {
  id: string;
  providerCustomerId: string;
  email: string;
  name: string | null;
  provider: PaymentProviderName;
}

export interface RedlinedSubscription {
  id: string;
  userId: string;
  provider: PaymentProviderName;
  providerCustomerId: string;
  providerSubscriptionId: string;
  providerPriceId: string | null;
  planId: RedlinedPlanId;
  billingInterval: BillingInterval;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialStart: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Webhook types ────────────────────────────────────────────────────────────

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
}

export interface PaymentWebhookEvent {
  id: string;
  provider: PaymentProviderName;
  /** Normalized event type — e.g. "subscription.created", "subscription.canceled" */
  type: string;
  /** Provider-specific event ID for idempotency checks */
  providerEventId: string;
  data: Record<string, unknown>;
  rawBody: string;
}
