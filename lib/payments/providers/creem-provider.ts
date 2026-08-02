/**
 * Creem.io payment provider implementation.
 *
 * THIS IS THE ONLY FILE WHERE CREEM-SPECIFIC LOGIC SHOULD EXIST.
 * No other file in the codebase should import from creem.io directly,
 * reference Creem API endpoints, or use Creem-specific field names.
 *
 * To migrate to Stripe: implement StripePaymentProvider, set PAYMENT_PROVIDER=stripe.
 * This file can then be archived — zero changes needed in UI or billing service.
 */

import type { PaymentProvider } from '../payment-provider';
import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  CustomerPortalInput,
  CustomerPortalResult,
  RedlinedCustomer,
  RedlinedSubscription,
  SubscriptionStatus,
  WebhookVerificationResult,
  PaymentWebhookEvent,
  RedlinedPlanId,
  BillingInterval,
} from '../types';
import { getProductId } from '@/config/plans';

/**
 * Creem exposes a separate sandbox host. CREEM_TEST_MODE existed as an
 * environment variable but nothing read it — the live host was hardcoded, so a
 * deployment believing itself to be in test mode still charged real cards.
 *
 * Test mode needs its OWN api key and product ids from Creem's test dashboard:
 * live keys are rejected by the sandbox and vice versa. CREEM_BASE_URL can
 * override the host outright if Creem changes it.
 */
const CREEM_TEST_MODE = process.env.CREEM_TEST_MODE === 'true';

const CREEM_BASE_URL =
  process.env.CREEM_BASE_URL ??
  (CREEM_TEST_MODE ? 'https://test-api.creem.io/v1' : 'https://api.creem.io/v1');

export function isCreemTestMode(): boolean {
  return CREEM_TEST_MODE;
}

function requireApiKey(): string {
  const key = process.env.CREEM_API_KEY;
  if (!key) throw new Error('CREEM_API_KEY is not set. Add it to your environment variables.');
  // A live key against the sandbox (or the reverse) fails with an opaque 401,
  // so say plainly which combination is wrong.
  if (CREEM_TEST_MODE && !/test/i.test(key)) {
    console.warn('[creem] CREEM_TEST_MODE=true but CREEM_API_KEY does not look like a test key — Creem will likely reject it.');
  }
  return key;
}

async function creemFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${CREEM_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': requireApiKey(),
      ...(options.headers ?? {}),
    },
  });
}

/** Maps Creem subscription status strings to normalized Redlined1 statuses. */
function normalizeStatus(raw: string | undefined | null): SubscriptionStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'trialing':              return 'trialing';
    case 'active':                return 'active';
    case 'past_due':              return 'past_due';
    case 'canceled':
    case 'cancelled':             return 'canceled';
    case 'unpaid':                return 'unpaid';
    case 'incomplete':
    case 'incomplete_expired':    return 'incomplete';
    case 'expired':               return 'expired';
    default:                      return 'unknown';
  }
}

function toDate(value: unknown): Date {
  if (typeof value === 'number') return new Date(value * 1000);
  if (typeof value === 'string') return new Date(value);
  return new Date(0);
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  return toDate(value);
}

export class CreemPaymentProvider implements PaymentProvider {

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    const productId = getProductId('creem', input.planId, input.billingInterval);

    const response = await creemFetch('/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        product_id: productId,
        success_url: input.successUrl,
        metadata: {
          user_id: input.userId,
          plan_id: input.planId,
          billing_interval: input.billingInterval,
          ...input.metadata,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(`Creem checkout failed (${response.status}): ${err.message ?? response.statusText}`);
    }

    const data = await response.json() as Record<string, unknown>;
    return {
      checkoutUrl: (data.checkout_url ?? data.url) as string,
      sessionId: data.id as string,
      provider: 'creem',
    };
  }

  async createCustomerPortalSession(input: CustomerPortalInput): Promise<CustomerPortalResult> {
    const response = await creemFetch(`/customers/${input.providerCustomerId}/billing-portal`, {
      method: 'POST',
      body: JSON.stringify({ return_url: input.returnUrl }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(`Creem portal session failed (${response.status}): ${err.message ?? response.statusText}`);
    }

    const data = await response.json() as Record<string, unknown>;
    return {
      portalUrl: (data.url ?? data.portal_url) as string,
      provider: 'creem',
    };
  }

  async getCustomer(providerCustomerId: string): Promise<RedlinedCustomer | null> {
    const response = await creemFetch(`/customers/${providerCustomerId}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Creem getCustomer failed (${response.status})`);

    const data = await response.json() as Record<string, unknown>;
    return {
      id: data.id as string,
      providerCustomerId: data.id as string,
      email: data.email as string,
      name: (data.name as string) ?? null,
      provider: 'creem',
    };
  }

  async getSubscription(providerSubscriptionId: string): Promise<RedlinedSubscription | null> {
    const response = await creemFetch(`/subscriptions/${providerSubscriptionId}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Creem getSubscription failed (${response.status})`);

    const data = await response.json() as Record<string, unknown>;
    return this.mapSubscription(data);
  }

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    const response = await creemFetch(`/subscriptions/${providerSubscriptionId}/cancel`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error(`Creem cancelSubscription failed (${response.status})`);
  }

  async resumeSubscription(providerSubscriptionId: string): Promise<void> {
    const response = await creemFetch(`/subscriptions/${providerSubscriptionId}/resume`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error(`Creem resumeSubscription failed (${response.status})`);
  }

  async updateSubscription(
    providerSubscriptionId: string,
    planId: string,
    billingInterval: string,
  ): Promise<void> {
    const productId = getProductId(
      'creem',
      planId as RedlinedPlanId,
      billingInterval as BillingInterval,
    );
    const response = await creemFetch(`/subscriptions/${providerSubscriptionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ product_id: productId }),
    });
    if (!response.ok) throw new Error(`Creem updateSubscription failed (${response.status})`);
  }

  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookVerificationResult> {
    const secret = process.env.CREEM_WEBHOOK_SECRET;
    if (!secret) {
      return { valid: false, error: 'CREEM_WEBHOOK_SECRET is not configured' };
    }

    // Creem's header is `creem-signature`, no `x-` prefix. Header names are
    // case-insensitive on the wire but this is a plain object, so normalise the
    // keys rather than guessing at capitalisations.
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;

    const signature =
      lower['creem-signature'] ??
      lower['x-creem-signature'] ??
      '';

    if (!signature) {
      return { valid: false, error: 'Missing creem-signature header' };
    }

    try {
      const { createHmac } = await import('crypto');
      const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
      const valid = signature === expected;
      return valid
        ? { valid: true }
        : { valid: false, error: 'Signature mismatch — possible tampered payload' };
    } catch {
      return { valid: false, error: 'Webhook HMAC verification threw an error' };
    }
  }

  async handleWebhookEvent(_event: PaymentWebhookEvent): Promise<void> {
    // Event-specific side effects are handled in billing-service.syncSubscriptionFromProvider.
    // This method exists for any Creem-specific pre-processing before the billing service runs.
  }

  // ─── Private mapping helpers ───────────────────────────────────────────────

  private mapSubscription(data: Record<string, unknown>): RedlinedSubscription {
    const metadata = (data.metadata ?? {}) as Record<string, string>;
    return {
      id: data.id as string,
      userId: metadata.user_id ?? '',
      provider: 'creem',
      providerCustomerId: (data.customer_id ?? data.customer) as string,
      providerSubscriptionId: data.id as string,
      providerPriceId: (data.price_id ?? data.product_id ?? null) as string | null,
      planId: (metadata.plan_id ?? 'starter') as RedlinedPlanId,
      billingInterval: (metadata.billing_interval ?? 'monthly') as BillingInterval,
      status: normalizeStatus(data.status as string),
      currentPeriodStart: toDate(data.current_period_start),
      currentPeriodEnd: toDate(data.current_period_end),
      trialStart: toDateOrNull(data.trial_start),
      trialEnd: toDateOrNull(data.trial_end),
      cancelAtPeriodEnd: (data.cancel_at_period_end as boolean) ?? false,
      canceledAt: toDateOrNull(data.canceled_at),
      createdAt: toDate(data.created_at),
      updatedAt: toDate(data.updated_at ?? data.created_at),
    };
  }
}
