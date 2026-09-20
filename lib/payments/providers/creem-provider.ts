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
import { getProductId, PLANS, PLAN_ORDER } from '@/config/plans';

/**
 * Creem exposes a separate sandbox host. CREEM_TEST_MODE existed as an
 * environment variable but nothing read it — the live host was hardcoded, so a
 * deployment believing itself to be in test mode still charged real cards.
 *
 * Test mode needs its OWN api key and product ids from Creem's test dashboard:
 * live keys are rejected by the sandbox and vice versa. CREEM_BASE_URL can
 * override the host outright if Creem changes it.
 */
// Every env read here is trimmed. A trailing newline on CREEM_TEST_MODE fails
// the === 'true' compare silently and sends sandbox traffic to the live host;
// a trailing newline on the API key produces an opaque 401 from Creem. Neither
// is visible in a dashboard, which displays the value without its whitespace.
const CREEM_TEST_MODE = process.env.CREEM_TEST_MODE?.trim() === 'true';

const CREEM_BASE_URL =
  process.env.CREEM_BASE_URL?.trim() ||
  (CREEM_TEST_MODE ? 'https://test-api.creem.io/v1' : 'https://api.creem.io/v1');

export function isCreemTestMode(): boolean {
  return CREEM_TEST_MODE;
}

function requireApiKey(): string {
  const key = process.env.CREEM_API_KEY?.trim();
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

/**
 * Thrown when Creem answered, but the answer cannot be turned into a subscription without inventing something.
 *
 * Deliberately NOT `null`: null means "no such subscription", and a caller may reasonably skip that. This means
 * "there is a subscription and we cannot read it safely", which is a different thing and must not be mistaken
 * for absence. Both callers already fail closed on a throw — neither writes anything — so raising it is safe.
 */
export class CreemSubscriptionUnusableError extends Error {
  readonly reason: string;
  constructor(reason: string, subscriptionId: string) {
    super(`Creem subscription ${subscriptionId} cannot be read safely: ${reason}`);
    this.name = 'CreemSubscriptionUnusableError';
    this.reason = reason;
  }
}

/**
 * A date, or nothing. Never new Date(0).
 *
 * This returned `new Date(0)` for anything it could not read, and the caller stored it. Combined with reading
 * field names Creem does not send, every synced period became 1970-01-01 — a value that looks like data.
 */
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

/**
 * The plan this subscription is for. NEVER defaulted.
 *
 * This was `metadata.plan_id ?? 'starter'`. syncSubscriptionFromProvider writes the result straight to
 * profiles.plan, which planGate reads for entitlement, so a subscription whose metadata did not survive granted
 * the customer Starter — a plan nobody bought and nobody is paying for.
 *
 * Order: the product Creem is actually billing wins, because that is what the customer is charged for; metadata
 * is accepted only when it names a plan we sell and does not contradict the product.
 */
function resolvePlanStrict(data: Record<string, unknown>): RedlinedPlanId | { unusable: string } {
  const sellable = PLAN_ORDER.filter(p => PLANS[p].monthlyPrice !== null && PLANS[p].annualPrice !== null);

  const productId = (() => {
    const v = data.product ?? data.product_id;
    if (typeof v === 'string') return v.trim();
    if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).id === 'string') {
      return String((v as Record<string, unknown>).id).trim();
    }
    return '';
  })();

  const fromProduct: RedlinedPlanId[] = [];
  if (productId) {
    for (const plan of sellable) {
      for (const interval of ['MONTHLY', 'ANNUAL']) {
        if (process.env[`CREEM_${plan.toUpperCase()}_${interval}_PRODUCT_ID`]?.trim() === productId) {
          if (!fromProduct.includes(plan)) fromProduct.push(plan);
        }
      }
    }
  }

  const meta = (data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata))
    ? (data.metadata as Record<string, string>) : {};
  const claimed = String(meta.plan_key ?? meta.plan_id ?? '').trim().toLowerCase();
  const claimedValid = sellable.includes(claimed as RedlinedPlanId) ? (claimed as RedlinedPlanId) : null;

  if (fromProduct.length > 1) return { unusable: 'the product is configured for more than one plan' };
  if (fromProduct.length === 1) {
    if (claimedValid && claimedValid !== fromProduct[0]) {
      return { unusable: 'the plan in metadata disagrees with the product being billed' };
    }
    return fromProduct[0];
  }
  // No product match. That is only safe when no product ids are configured at all; otherwise the subscription
  // is for something we do not sell.
  const anyConfigured = sellable.some(p => ['MONTHLY', 'ANNUAL']
    .some(i => !!process.env[`CREEM_${p.toUpperCase()}_${i}_PRODUCT_ID`]?.trim()));
  if (productId && anyConfigured) return { unusable: 'the product being billed is not a plan Redlined1 sells' };
  if (claimedValid) return claimedValid;
  return { unusable: claimed ? `metadata names an unknown plan` : 'the subscription names no plan' };
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

  /**
   * DO NOT USE THIS ON THE WEBHOOK PATH. It has two defects that billing work has already paid for once.
   *
   * 1. mapSubscription() DEFAULTED THE PLAN to 'starter' when metadata was absent. syncSubscriptionFromProvider
   *    writes that straight to profiles.plan, which planGate reads for entitlement, so a subscription whose
   *    metadata did not survive granted the customer Starter — a plan nobody bought and nobody is paying for.
   * 2. It read `current_period_start` / `current_period_end`. Creem does not send those names — it sends
   *    `current_period_start_date` / `current_period_end_date` (confirmed against stored production events) —
   *    and toDate() returned new Date(0) on a miss, so every synced period was stored as 1970-01-01.
   *
   * A previous version of this comment said nothing on the billing path called it. That was WRONG:
   * app/api/webhooks/creem/route.ts calls it on subscription.created / updated / renewed / canceled / expired /
   * past_due, and feeds the result to syncSubscriptionFromProvider. Both defects were reachable in production.
   *
   * Both are now fixed here rather than only documented:
   *   - the plan comes from resolvePlanStrict — the product Creem is billing wins, metadata is accepted only when
   *     it names a plan we sell and does not contradict the product, and anything else THROWS
   *     CreemSubscriptionUnusableError rather than returning a guess;
   *   - dates go through toDateOrUnknown, which returns null rather than an epoch, and the period reads the
   *     names Creem actually sends, falling back to the old ones only when they are genuinely present.
   *
   * `null` still means exactly one thing: Creem has no such subscription (404). "Present but unreadable" is the
   * thrown error, so a caller cannot mistake one for the other.
   *
   * For webhook-driven state, lib/billing/creemAuthoritative.ts remains the richer path: it distinguishes
   * transient provider failure from an unusable answer and holds the event for the owner.
   */
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
    const secret = process.env.CREEM_WEBHOOK_SECRET?.trim();
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

  /** See the warning on getSubscription(): this mapper defaults the plan and reads period names Creem never sends. */
  private mapSubscription(data: Record<string, unknown>): RedlinedSubscription {
    const metadata = (data.metadata ?? {}) as Record<string, string>;

    const subscriptionId = typeof data.id === 'string' ? data.id.trim() : '';
    if (!subscriptionId) throw new CreemSubscriptionUnusableError('the response carries no subscription id', '(unknown)');

    const plan = resolvePlanStrict(data);
    if (typeof plan === 'object') throw new CreemSubscriptionUnusableError(plan.unusable, subscriptionId);
    const planId = plan;

    return {
      id: subscriptionId,
      userId: metadata.user_id ?? '',
      provider: 'creem',
      providerCustomerId: (data.customer_id ?? data.customer) as string,
      providerSubscriptionId: data.id as string,
      providerPriceId: (data.price_id ?? data.product_id ?? null) as string | null,
      planId,
      billingInterval: (metadata.billing_interval ?? 'monthly') as BillingInterval,
      status: normalizeStatus(data.status as string),
      // Creem sends current_period_*_date. The old names are read only as a fallback, and only when actually
      // present — they were never observed, and reading them first is what produced the 1970 periods.
      currentPeriodStart: toDateOrUnknown(data.current_period_start_date ?? data.current_period_start),
      currentPeriodEnd: toDateOrUnknown(data.current_period_end_date ?? data.current_period_end),
      trialStart: toDateOrUnknown(data.trial_start),
      trialEnd: toDateOrUnknown(data.trial_end),
      cancelAtPeriodEnd: (data.cancel_at_period_end as boolean) ?? false,
      canceledAt: toDateOrUnknown(data.canceled_at ?? data.cancelled_at),
      createdAt: toDateOrUnknown(data.created_at) ?? new Date(),
      updatedAt: toDateOrUnknown(data.updated_at ?? data.created_at) ?? new Date(),
    };
  }
}
