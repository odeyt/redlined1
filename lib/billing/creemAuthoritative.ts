/**
 * lib/billing/creemAuthoritative.ts
 *
 * OPTION B: ask Creem what the subscription IS, instead of inferring it from the event that just arrived.
 *
 * Why this exists: a webhook event describes a moment. Creem's documentation says events can arrive more than
 * once and in any order, so an older activation delivered after a cancellation reactivates a subscription that
 * the provider considers cancelled, and an older event can write back a plan the customer has already changed.
 * Reading the current state makes the outcome independent of arrival ORDER. It does NOT make overlapping
 * deliveries safe — that is a database constraint, not a read (see docs/billing-webhook-idempotency.md).
 *
 * This module deliberately does NOT use CreemPaymentProvider.getSubscription(). That mapper:
 *   - defaults the plan to 'starter' and the interval to 'monthly' when metadata is absent, which is exactly the
 *     class of silent default the webhook removed; and
 *   - reads `current_period_start` / `current_period_end`, names Creem does not send (it sends
 *     `current_period_start_date` / `current_period_end_date`), so every period would resolve to new Date(0).
 * Using it would reintroduce both bugs through the back door. The plan and the period here go through the same
 * two modules the webhook already trusts — resolvePlan and readSubscriptionPeriod — so there is one rule, not two.
 *
 * Nothing here is a guess. A state that cannot be read safely is UNUSABLE (hold the event, 200); a provider that
 * cannot be reached is UNAVAILABLE (transient, 5xx, Creem redelivers). Neither one applies anything.
 */
import { resolvePlan } from '@/lib/billing/creemPlan';
import { readSubscriptionPeriod, parseProviderDate, type SubscriptionPeriod } from '@/lib/billing/creemPeriod';

/** The three states this system stores. Anything else Creem reports is unusable rather than mapped to a guess. */
export type AuthoritativeStatus = 'active' | 'cancelled' | 'past_due' | 'suspended';

export interface AuthoritativeState {
  subscriptionId: string;
  status: AuthoritativeStatus;
  planKey: string;
  period: SubscriptionPeriod;
  providerCustomerId: string;
  /** The provider's own cancellation time, so the stored date belongs to the SAME subscription as the id. */
  canceledAt: Date | null;
  /** shop_id as the SUBSCRIPTION itself carries it. The caller checks it against the shop it resolved, so a
   *  subscription belonging to another shop can never be applied to this one. Empty when it carries none. */
  metadataShopId: string;
}

export type AuthoritativeResult =
  /** Creem answered and the answer is usable. Apply exactly this. */
  | { kind: 'state'; state: AuthoritativeState }
  /** Creem could not be reached, or answered in a way a retry may fix. Apply NOTHING; let Creem redeliver. */
  | { kind: 'unavailable'; detail: string }
  /** Creem answered, and the answer cannot be applied safely. Hold the event for the owner. */
  | { kind: 'unusable'; detail: string };

export interface FetchAuthoritativeOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  apiKey?: string;
  /** Per-attempt deadline. Short on purpose: this call sits in front of a webhook Creem is waiting on. */
  timeoutMs?: number;
  /** Total attempts including the first. */
  attempts?: number;
  /** Base backoff; attempt n waits backoffMs * n. */
  backoffMs?: number;
  /** Hard ceiling for the whole read, retries and backoff included. */
  budgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * The budget exists because of where this runs.
 *
 * The route declares no `maxDuration` and there is no vercel.json, so it runs on the PLATFORM DEFAULT — 10s on
 * Hobby, 15s on Pro. The whole request also has to verify an HMAC, read the shop, the membership and the
 * subscription row, and write three tables. An earlier shape of this module (3 attempts x 3000ms + 750ms of
 * backoff = 9.75s worst case) left roughly 250ms of that for everything else: the function would have been
 * killed mid-write, which is the one outcome worse than not applying the event at all.
 *
 * 2 attempts x 2500ms + 250ms backoff = 5.25s worst case, and BUDGET_MS caps the total independently of how the
 * other knobs are set, so no future tuning can reintroduce the overrun.
 */
const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_ATTEMPTS   = 2;
const DEFAULT_BACKOFF_MS = 250;
const DEFAULT_BUDGET_MS  = 6000;

/**
 * Creem's status vocabulary, narrowed to what this system stores.
 *
 * `trialing` maps to active: the customer has access. `incomplete` and anything unrecognised are NOT mapped —
 * an unknown status must not silently become "active", so it is held for a person to look at.
 */
function narrowStatus(raw: unknown): AuthoritativeStatus | null {
  switch (String(raw ?? '').toLowerCase()) {
    case 'active':
    case 'trialing':
    case 'paid':       return 'active';
    case 'canceled':
    case 'cancelled':
    case 'expired':    return 'cancelled';
    case 'past_due':
    case 'unpaid':     return 'past_due';
    // Approved rule: paused -> suspended. It was unrecognised here, so with the flag on a pause was held and the
    // customer kept access — the opposite of the event-derived path.
    case 'paused':
    case 'suspended':  return 'suspended';
    default:           return null;
  }
}

/** Creem nests ids as objects in some payloads and returns bare strings in others. */
function idOf(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object') {
    const id = (v as Record<string, unknown>).id;
    if (typeof id === 'string') return id.trim();
  }
  return '';
}

/** A response worth trying again: a timeout, a network failure, a 5xx, or an explicit rate limit. */
function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function authoritativeStateEnabled(): boolean {
  return process.env.BILLING_AUTHORITATIVE_STATE?.trim() === 'true';
}

/**
 * Read one subscription from Creem, with a per-attempt timeout and bounded retries.
 *
 * The timeout matters more than it looks: `creemFetch` in the provider is a bare fetch with no deadline, and an
 * unresponsive Creem on the webhook path would hang until the platform kills the function. Creem would then time
 * out its own delivery and redeliver — turning one slow call into MORE overlapping deliveries, which is the
 * hazard this feature is meant to reduce. So every attempt has a deadline and the total is bounded.
 */
export async function fetchAuthoritativeSubscription(
  subscriptionId: string,
  options: FetchAuthoritativeOptions = {},
): Promise<AuthoritativeResult> {
  const id = subscriptionId.trim();
  if (!id) return { kind: 'unusable', detail: 'no subscription id' };

  const doFetch   = options.fetchImpl ?? fetch;
  const baseUrl   = options.baseUrl ?? process.env.CREEM_BASE_URL
    ?? (process.env.CREEM_TEST_MODE?.trim() === 'true' ? 'https://test-api.creem.io/v1' : 'https://api.creem.io/v1');
  const apiKey    = options.apiKey ?? process.env.CREEM_API_KEY?.trim() ?? '';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts  = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const budgetMs  = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const sleep     = options.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const now       = options.now ?? (() => Date.now());
  const startedAt = now();

  // No key is a configuration fault, not a transient one. Retrying cannot fix it, and pretending the provider is
  // merely unavailable would make Creem redeliver for 24 hours against a deployment that can never answer.
  if (!apiKey) return { kind: 'unusable', detail: 'CREEM_API_KEY is not configured' };

  let lastDetail = 'unknown';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    // Never start an attempt that cannot finish inside the budget, and never let one run past it.
    const remaining = budgetMs - (now() - startedAt);
    if (remaining <= 0) return { kind: 'unavailable', detail: `budget of ${budgetMs}ms exhausted: ${lastDetail}` };
    const attemptMs = Math.min(timeoutMs, remaining);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), attemptMs);
    try {
      const res = await doFetch(`${baseUrl}/subscriptions/${encodeURIComponent(id)}`, {
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        signal: controller.signal,
      });

      // A subscription Creem does not know about cannot be applied, and a retry will not conjure it.
      if (res.status === 404) return { kind: 'unusable', detail: 'subscription not found at the provider' };

      if (isTransientStatus(res.status)) {
        lastDetail = `provider returned ${res.status}`;
      } else if (!res.ok) {
        // 401/403 (a wrong or revoked key), 400, anything else in the 4xx range: a retry repeats the same answer.
        return { kind: 'unusable', detail: `provider returned ${res.status}` };
      } else {
        let body: unknown;
        try { body = await res.json(); }
        catch { return { kind: 'unusable', detail: 'provider response was not JSON' }; }
        return parseAuthoritativeSubscription(body);
      }
    } catch (err) {
      // AbortError (our deadline) and network failures land here. Both are worth another attempt.
      lastDetail = err instanceof Error && err.name === 'AbortError'
        ? `timed out after ${attemptMs}ms`
        : `request failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      clearTimeout(timer);
    }

    if (attempt < attempts) {
      const wait = backoffMs * attempt;
      if ((now() - startedAt) + wait >= budgetMs) {
        return { kind: 'unavailable', detail: `budget of ${budgetMs}ms would be exceeded: ${lastDetail}` };
      }
      await sleep(wait);
    }
  }

  return { kind: 'unavailable', detail: lastDetail };
}

/**
 * Turn Creem's subscription object into the state this system stores, or say why it cannot be.
 *
 * Exported so the parsing rules are tested without a network, and so the webhook route never has to know the
 * shape of a provider response.
 */
export function parseAuthoritativeSubscription(body: unknown): AuthoritativeResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { kind: 'unusable', detail: 'provider response is not an object' };
  }
  const data = body as Record<string, unknown>;

  const subscriptionId = idOf(data.id);
  if (!subscriptionId) return { kind: 'unusable', detail: 'provider response carries no subscription id' };

  const status = narrowStatus(data.status);
  if (!status) return { kind: 'unusable', detail: `unrecognised provider status: ${String(data.status ?? '')}` };

  // The plan goes through the same resolver the webhook uses, so the product Creem is actually billing has to
  // agree with the metadata. A renewal whose metadata still names the old plan is a conflict, not a downgrade.
  const meta = (data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata))
    ? (data.metadata as Record<string, string>) : {};
  const plan = resolvePlan(meta, data);
  if (plan.kind === 'unresolved') return { kind: 'unusable', detail: `plan ${plan.reason}` };

  return {
    kind: 'state',
    state: {
      subscriptionId,
      status,
      planKey: plan.planKey,
      period: readSubscriptionPeriod(data),
      providerCustomerId: idOf(data.customer) || idOf(data.customer_id),
      canceledAt: parseProviderDate(data.canceled_at) ?? parseProviderDate(data.cancelled_at),
      metadataShopId: String(meta.shop_id ?? '').trim(),
    },
  };
}
