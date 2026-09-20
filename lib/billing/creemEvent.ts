/**
 * lib/billing/creemEvent.ts
 * Pure helpers for reading a Creem webhook event: the envelope, the ids, and, before anything
 * requires a shop, WHAT KIND of event it is. No I/O, so every rule is unit-tested and the route
 * (app/api/billing/webhook/creem/route.ts) stays a thin orchestrator.
 *
 * Why classification comes first
 * ------------------------------
 * Redlined1's own checkout always sends `metadata` (shop_id, user_id, plan_key, plan_id,
 * billing_interval). A Creem event WITHOUT any of it was not created by Redlined1's checkout: for
 * example a one-time order from a Creem payment link or the Creem dashboard. Such an event has no
 * shop to find, and reporting it as "a Redlined1 subscription that could not be linked" is false and
 * buries the real alerts. Only an event that IS (or looks like) a subscription and needs a shop is an
 * unresolved problem worth an owner's attention.
 *
 * Payload shapes here were read (key names only) from stored production events; every value in tests
 * is synthetic.
 */

export interface CreemEnvelope {
  eventType: string;
  providerEventId: string;
  data: Record<string, unknown>;
}

/** Creem's envelope is { id, eventType, created_at, object }. The other spellings are fallbacks. */
export function parseEnvelope(payload: Record<string, unknown>): CreemEnvelope {
  return {
    eventType:       String(payload.eventType ?? payload.type ?? payload.event_type ?? ''),
    providerEventId: String(payload.id ?? payload.event_id ?? ''),
    data:            (payload.object ?? payload.data ?? payload) as Record<string, unknown>,
  };
}

/** Creem nests ids as objects ({ id: 'cus_…' }) on some events and sends bare strings on others. */
export function asId(v: unknown): string {
  return typeof v === 'string' ? v
    : (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string')
      ? (v as { id: string }).id
      : '';
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** String-valued metadata from the event object. Non-string values are dropped. */
export function metadataOf(data: Record<string, unknown>): Record<string, string> {
  const raw = isRecord(data.metadata) ? data.metadata : {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v;
  return out;
}

/**
 * The metadata to act on: the event object's own, over the nested subscription's. Real checkout.completed events carry
 * it in both places; reading both means "is this ours?" (classification) and "which shop?" (resolution) can never
 * disagree because one looked in a place the other did not.
 */
export function eventMetadata(data: Record<string, unknown>): Record<string, string> {
  const nested = isRecord(data.subscription) ? metadataOf(data.subscription) : {};
  return { ...nested, ...metadataOf(data) };
}

/** The keys Redlined1's checkout sets. Any one of them means the event came from our checkout. */
const REDLINED_METADATA_KEYS = ['shop_id', 'user_id', 'plan_key', 'plan_id'] as const;

function hasRedlinedMetadata(data: Record<string, unknown>): boolean {
  const meta = eventMetadata(data);
  return REDLINED_METADATA_KEYS.some(k => typeof meta[k] === 'string' && meta[k].length > 0);
}

export const ACTIVATION_EVENT_TYPES: ReadonlySet<string> = new Set([
  'checkout.completed', 'subscription.created', 'subscription.active', 'subscription.paid',
]);
export const CANCELLATION_EVENT_TYPES: ReadonlySet<string> = new Set([
  'subscription.cancelled', 'subscription.canceled', 'subscription.expired',
]);
export const PAST_DUE_EVENT_TYPES: ReadonlySet<string> = new Set(['subscription.past_due', 'subscription.unpaid']);

export type CreemEventClass =
  /** Carries Redlined1 checkout metadata: it is ours and must link to a shop. */
  | 'redlined_subscription'
  /** A subscription (or subscription lifecycle) event with no Redlined1 metadata: it may be a real customer and must NOT be dropped silently. */
  | 'unattributed_subscription'
  /** A one-time order with no Redlined1 metadata (payment link, dashboard). Not a Redlined1 subscription; nothing to link. */
  | 'external_order'
  /** Anything else (refunds, disputes, unknown types). Recorded, no shop needed. */
  | 'other';

function billingTypeOf(data: Record<string, unknown>): string {
  const product = isRecord(data.product) ? data.product : {};
  const order = isRecord(data.order) ? data.order : {};
  return String(product.billing_type ?? order.type ?? '').toLowerCase();
}

export function classifyCreemEvent(eventType: string, data: Record<string, unknown>): CreemEventClass {
  if (hasRedlinedMetadata(data)) return 'redlined_subscription';

  const looksLikeSubscription =
    eventType.startsWith('subscription.') ||
    isRecord(data.subscription) ||
    (typeof data.subscription === 'string' && data.subscription.length > 0) ||
    data.object === 'subscription' ||
    ['recurring', 'subscription'].includes(billingTypeOf(data));
  if (looksLikeSubscription) return 'unattributed_subscription';

  if (billingTypeOf(data) === 'onetime') return 'external_order';
  return 'other';
}

/** Does this event have to be applied to a shop's subscription record? */
export function needsShop(eventType: string, eventClass: CreemEventClass): boolean {
  if (eventClass !== 'redlined_subscription' && eventClass !== 'unattributed_subscription') return false;
  return ACTIVATION_EVENT_TYPES.has(eventType) || CANCELLATION_EVENT_TYPES.has(eventType) || PAST_DUE_EVENT_TYPES.has(eventType);
}

// ── Unresolved state ────────────────────────────────────────────────────────
// Stored in billing_events.error with processed = false. That is the shape the owner's Billing Health
// webhook view already counts as "failed" (error set and not processed), so it is visible without a
// schema change. The vocabulary is fixed: nothing customer-supplied ever goes in the column.

export const UNRESOLVED_PREFIX = 'UNRESOLVED_SHOP:';

export type UnresolvedReason = 'no_shop_metadata' | 'shop_not_found' | 'no_membership' | 'ambiguous_membership';

export const UNRESOLVED_REASON_TEXT: Record<UnresolvedReason, string> = {
  no_shop_metadata:     'The event carries no shop or user to link it to (not created by Redlined1 checkout).',
  shop_not_found:       'The event names a shop that does not exist.',
  no_membership:        'The event names a user who belongs to no shop.',
  ambiguous_membership: 'The event names a user who belongs to more than one shop, so no shop was chosen.',
};

export const unresolvedError = (reason: UnresolvedReason): string => `${UNRESOLVED_PREFIX}${reason}`;

export function parseUnresolvedReason(error: string | null | undefined): UnresolvedReason | null {
  if (!error || !error.startsWith(UNRESOLVED_PREFIX)) return null;
  const reason = error.slice(UNRESOLVED_PREFIX.length) as UnresolvedReason;
  return reason in UNRESOLVED_REASON_TEXT ? reason : null;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
