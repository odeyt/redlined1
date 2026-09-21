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
import { RemoteSubscriptionUnusableError } from './BillingProvider';
import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  BillingPortalInput,
  BillingPortalResult,
} from '@/commercial/shared/types';

/**
 * The host, derived at CALL time from CREEM_TEST_MODE.
 *
 * This was `const CREEM_API_BASE = 'https://api.creem.io/v1'` — the live host, hardcoded, ignoring
 * CREEM_TEST_MODE entirely. lib/payments/providers/creem-provider.ts already carries a comment describing that
 * exact bug and its consequence ("a deployment believing itself to be in test mode still charged real cards");
 * this file kept the unfixed version. A read against the wrong host answers 401, which the old code returned as
 * `null` — indistinguishable from "no such subscription".
 *
 * Read per call rather than at import so a test, or a process that loads its environment late, gets the host its
 * configuration actually asks for. Every env read is trimmed: a trailing newline on CREEM_TEST_MODE silently
 * fails the === 'true' compare and sends sandbox traffic to the live host.
 */
function creemApiBase(): string {
  const override = process.env.CREEM_BASE_URL?.trim();
  if (override) return override;
  return process.env.CREEM_TEST_MODE?.trim() === 'true'
    ? 'https://test-api.creem.io/v1'
    : 'https://api.creem.io/v1';
}


/** Short on purpose: this sits in front of a caller that is itself answering something. */
const SUBSCRIPTION_READ_TIMEOUT_MS = 5000;

/**
 * Statuses this integration is prepared to store. An unknown one is held as unusable rather than mapped, because
 * every default available here ('active') is a grant.
 */
const KNOWN_REMOTE_STATUSES: ReadonlySet<string> = new Set([
  'active', 'trialing', 'past_due', 'unpaid', 'cancelled', 'canceled', 'expired', 'suspended', 'paused',
]);

/** A date, or nothing — never `now`, never Invalid Date. */
function toDateOrUnknown(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value.trim());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Creem returns ids bare in some payloads and nested as objects in others. */
function readId(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).id === 'string') {
    return String((v as Record<string, unknown>).id).trim();
  }
  return '';
}

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

    const res = await fetch(`${creemApiBase()}/checkouts`, {
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
    const res = await fetch(`${creemApiBase()}/billing-portal`, {
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

  /**
   * Read one subscription from Creem.
   *
   * Rewritten for the same reasons as CreemPaymentProvider.getSubscription in lib/payments. What it used to do:
   *
   *   1. `status: String(data.status ?? 'active')` — a missing status became ACTIVE. The caller feeds this to
   *      updateSubscriptionStatus, so a response we could not read granted the shop an active subscription.
   *   2. `new Date(data.current_period_start as string ?? Date.now())` — a missing period became `now`, and the
   *      field names were wrong anyway (Creem sends current_period_*_date), so it was always `now`.
   *   3. `if (!res.ok) return null` — a 500, a 401 from a wrong key, and a genuine 404 were indistinguishable.
   *   4. `catch { return null }` — a timeout or DNS failure also read as "no such subscription".
   *   5. No deadline at all, so a hanging provider hung the caller.
   *
   * Now: `null` means 404 and nothing else. Anything we cannot read safely throws
   * RemoteSubscriptionUnusableError with a reason; anything transient throws too, so a retry can be a retry
   * rather than a write of invented state. The one caller, commercial/billing/billingService.ts
   * syncSubscriptionFromProvider, already wraps this in try/catch and returns false, so it fails closed.
   */
  async getSubscription(providerSubscriptionId: string): Promise<RemoteSubscription | null> {
    const id = providerSubscriptionId.trim();
    if (!id) throw new RemoteSubscriptionUnusableError('no subscription id was given', '');

    const apiKey = getCreemApiKey();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUBSCRIPTION_READ_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${creemApiBase()}/subscriptions/${encodeURIComponent(id)}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: controller.signal,
      });
    } catch (err) {
      // A timeout or a network failure is NOT "no such subscription". Say so, so a retry stays possible.
      const detail = err instanceof Error && err.name === 'AbortError'
        ? `timed out after ${SUBSCRIPTION_READ_TIMEOUT_MS}ms`
        : `request failed: ${err instanceof Error ? err.message : String(err)}`;
      throw new RemoteSubscriptionUnusableError(detail, id);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 404) return null;
    if (!res.ok) throw new RemoteSubscriptionUnusableError(`the provider answered ${res.status}`, id);

    let data: Record<string, unknown>;
    try {
      data = await res.json() as Record<string, unknown>;
    } catch {
      throw new RemoteSubscriptionUnusableError('the response was not JSON', id);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new RemoteSubscriptionUnusableError('the response is not an object', id);
    }

    const returnedId = typeof data.id === 'string' ? data.id.trim() : '';
    if (!returnedId) throw new RemoteSubscriptionUnusableError('the response carries no subscription id', id);

    // Never defaulted. An unrecognised status must not become 'active' — that is a grant.
    const rawStatus = String(data.status ?? '').trim().toLowerCase();
    if (!KNOWN_REMOTE_STATUSES.has(rawStatus)) {
      throw new RemoteSubscriptionUnusableError(
        rawStatus ? `unrecognised provider status: ${rawStatus}` : 'the subscription carries no status', id,
      );
    }

    return {
      providerSubscriptionId: returnedId,
      providerCustomerId:     readId(data.customer) || readId(data.customer_id),
      status:                 rawStatus,
      // The names Creem actually sends, with the old ones as a fallback only when genuinely present.
      currentPeriodStart:     toDateOrUnknown(data.current_period_start_date ?? data.current_period_start),
      currentPeriodEnd:       toDateOrUnknown(data.current_period_end_date ?? data.current_period_end),
      cancelAtPeriodEnd:      Boolean(data.cancel_at_period_end),
      cancelledAt:            toDateOrUnknown(data.cancelled_at ?? data.canceled_at),
    };
  },

  async cancelSubscription(providerSubscriptionId: string, immediately: boolean): Promise<boolean> {
    try {
      const apiKey = getCreemApiKey();
      // TODO: CREEM_INTEGRATION — verify endpoint and payload
      const res = await fetch(`${creemApiBase()}/subscriptions/${providerSubscriptionId}/cancel`, {
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
      const res = await fetch(`${creemApiBase()}/subscriptions/${providerSubscriptionId}`, {
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
