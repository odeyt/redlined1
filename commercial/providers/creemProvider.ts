/**
 * commercial/providers/creemProvider.ts
 * Creem billing provider implementation.
 *
 * TODO: Replace placeholder API calls with real Creem SDK once API keys are configured.
 * Integration points are clearly marked with // TODO: CREEM_INTEGRATION
 *
 * Creem API docs: https://docs.creem.io
 * Webhook events: checkout.completed, subscription.updated, subscription.cancelled
 */

import type { IBillingProvider, WebhookHandleResult, RemoteSubscription } from './BillingProvider';
import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  BillingPortalInput,
  BillingPortalResult,
} from '@/commercial/shared/types';

const CREEM_API_BASE = 'https://api.creem.io/v1'; // TODO: CREEM_INTEGRATION — verify base URL

function getCreemApiKey(): string {
  const key = process.env.CREEM_API_KEY;
  if (!key) throw new Error('CREEM_API_KEY is not configured. Set it in your environment variables.');
  return key;
}

function getProductId(planKey: string, interval: string): string {
  const suffix = interval === 'annual' ? 'ANNUAL' : 'MONTHLY';
  const envKey = `CREEM_${planKey.toUpperCase()}_${suffix}_PRODUCT_ID`;
  const id = process.env[envKey];
  if (!id) throw new Error(`Missing environment variable: ${envKey}`);
  return id;
}

// ─── Creem Provider ───────────────────────────────────────────────────────────

export const creemProvider: IBillingProvider = {
  name: 'creem',

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    const apiKey = getCreemApiKey();
    const productId = getProductId(input.planKey, input.interval);

    // TODO: CREEM_INTEGRATION — verify exact Creem checkout payload shape
    const body = {
      product_id:  productId,
      success_url: input.successUrl,
      cancel_url:  input.cancelUrl,
      customer: {
        email: input.email,
      },
      metadata: {
        shop_id:   input.shopId,
        user_id:   input.userId,
        plan_key:  input.planKey,
        interval:  input.interval,
        ...input.metadata,
      },
    };

    const res = await fetch(`${CREEM_API_BASE}/checkouts`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Creem checkout failed: ${res.status} ${err}`);
    }

    const data = await res.json() as Record<string, unknown>;

    // TODO: CREEM_INTEGRATION — verify response shape
    return {
      checkoutUrl: String(data.checkout_url ?? data.url ?? ''),
      sessionId:   String(data.id ?? ''),
      provider:    'creem',
    };
  },

  async createBillingPortalSession(input: BillingPortalInput): Promise<BillingPortalResult> {
    const apiKey = getCreemApiKey();

    // TODO: CREEM_INTEGRATION — verify Creem billing portal endpoint
    const res = await fetch(`${CREEM_API_BASE}/billing-portal`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        customer_id: input.providerCustomerId,
        return_url:  input.returnUrl,
        metadata: { shop_id: input.shopId, user_id: input.userId },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Creem portal failed: ${res.status} ${err}`);
    }

    const data = await res.json() as Record<string, unknown>;

    return {
      portalUrl: String(data.portal_url ?? data.url ?? ''),
      provider:  'creem',
    };
  },

  async handleWebhook(rawBody: string, signature: string): Promise<WebhookHandleResult> {
    const secret = process.env.CREEM_WEBHOOK_SECRET;

    // Signature verification
    if (secret) {
      // TODO: CREEM_INTEGRATION — implement HMAC-SHA256 signature check
      // Creem signs webhooks with HMAC-SHA256 using CREEM_WEBHOOK_SECRET
      // Expected header: X-Creem-Signature: sha256=<hex>
      const isValid = await verifyCreemSignature(rawBody, signature, secret);
      if (!isValid) {
        return { valid: false, eventType: null, providerEventId: null, shopId: null, payload: {}, error: 'Invalid signature' };
      }
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { valid: false, eventType: null, providerEventId: null, shopId: null, payload: {}, error: 'Invalid JSON' };
    }

    // TODO: CREEM_INTEGRATION — verify exact event shape from Creem
    const eventType      = String(payload.type ?? payload.event_type ?? '');
    const providerEventId = String(payload.id ?? payload.event_id ?? '');
    const data           = (payload.data ?? payload) as Record<string, unknown>;
    const meta           = (data.metadata ?? {}) as Record<string, string>;
    const shopId         = meta.shop_id ?? null;

    let subscriptionUpdate: WebhookHandleResult['subscriptionUpdate'];

    if (eventType === 'checkout.completed' || eventType === 'subscription.created') {
      subscriptionUpdate = {
        shopId:                  meta.shop_id ?? undefined,
        planKey:                 (meta.plan_key ?? 'professional') as never,
        status:                  'active',
        providerCustomerId:      String(data.customer_id ?? ''),
        providerSubscriptionId:  String(data.subscription_id ?? ''),
        currentPeriodStart:      data.current_period_start ? new Date(data.current_period_start as string) : new Date(),
        currentPeriodEnd:        data.current_period_end   ? new Date(data.current_period_end as string)   : new Date(Date.now() + 30 * 86400000),
      };
    } else if (eventType === 'subscription.updated') {
      subscriptionUpdate = {
        providerSubscriptionId: String(data.subscription_id ?? data.id ?? ''),
        status:                 mapCreemStatus(String(data.status ?? 'active')),
      };
    } else if (eventType === 'subscription.cancelled' || eventType === 'subscription.canceled') {
      subscriptionUpdate = {
        providerSubscriptionId: String(data.subscription_id ?? data.id ?? ''),
        status:                 'cancelled',
        cancelledAt:            new Date(),
      };
    } else if (eventType === 'subscription.past_due' || eventType === 'payment.failed') {
      subscriptionUpdate = {
        providerSubscriptionId: String(data.subscription_id ?? ''),
        status:                 'past_due',
        pastDueAt:              new Date(),
      };
    }

    return { valid: true, eventType, providerEventId, shopId, payload, subscriptionUpdate };
  },

  async getSubscription(providerSubscriptionId: string): Promise<RemoteSubscription | null> {
    try {
      const apiKey = getCreemApiKey();
      // TODO: CREEM_INTEGRATION — verify endpoint
      const res = await fetch(`${CREEM_API_BASE}/subscriptions/${providerSubscriptionId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!res.ok) return null;
      const data = await res.json() as Record<string, unknown>;
      return {
        providerSubscriptionId: String(data.id ?? ''),
        providerCustomerId:     String(data.customer_id ?? ''),
        status:                 String(data.status ?? 'active'),
        currentPeriodStart:     new Date(data.current_period_start as string ?? Date.now()),
        currentPeriodEnd:       new Date(data.current_period_end as string ?? Date.now()),
        cancelAtPeriodEnd:      Boolean(data.cancel_at_period_end),
        cancelledAt:            data.cancelled_at ? new Date(data.cancelled_at as string) : null,
      };
    } catch {
      return null;
    }
  },

  async cancelSubscription(providerSubscriptionId: string, immediately: boolean): Promise<boolean> {
    try {
      const apiKey = getCreemApiKey();
      // TODO: CREEM_INTEGRATION — verify endpoint and payload
      const res = await fetch(`${CREEM_API_BASE}/subscriptions/${providerSubscriptionId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ immediately }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async updateSubscription(providerSubscriptionId: string, newProductId: string): Promise<boolean> {
    try {
      const apiKey = getCreemApiKey();
      // TODO: CREEM_INTEGRATION — verify plan change endpoint
      const res = await fetch(`${CREEM_API_BASE}/subscriptions/${providerSubscriptionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ product_id: newProductId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapCreemStatus(creemStatus: string): 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired' | 'suspended' | 'manual' {
  const map: Record<string, 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired' | 'suspended' | 'manual'> = {
    active:     'active',
    trialing:   'trialing',
    past_due:   'past_due',
    cancelled:  'cancelled',
    canceled:   'cancelled',
    expired:    'expired',
    suspended:  'suspended',
  };
  return map[creemStatus] ?? 'active';
}

async function verifyCreemSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  try {
    // TODO: CREEM_INTEGRATION — adjust header format if Creem uses a different scheme
    const expected = signature.replace(/^sha256=/, '');
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
    const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex === expected;
  } catch {
    return false;
  }
}
