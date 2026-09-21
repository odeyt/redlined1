/**
 * lib/billing/creemEvent.ts
 * Pure helpers for reading a Creem webhook event: the envelope, the ids, the metadata, and, before anything
 * touches a shop, WHAT KIND of event it is and what must happen to it. No I/O, so every rule is unit-tested and
 * the route (app/api/billing/webhook/creem/route.ts) stays a thin orchestrator.
 *
 * The rule that shapes everything here: an event is either APPLIED, positively identified as not ours and
 * ACKNOWLEDGED quietly, or HELD. Nothing is guessed, and nothing is dropped without a trace.
 *
 *   apply        a subscription lifecycle event (activation, cancellation, past due). The route then proves who
 *                bought it and for which shop before it changes anything.
 *   acknowledge  ONLY a positively identified external one-time order (billing type "onetime", no Redlined1
 *                metadata, nothing subscription-shaped). It has no shop to find and is recorded as processed.
 *   hold         everything else: missing type or id, a malformed checkout, refunds and disputes, subscription
 *                events this code does not handle, unknown event types. Recorded as processed = false with a
 *                fixed reason, acknowledged with 200 (a redelivery of the same bytes cannot change the answer),
 *                and listed for the owner at /api/admin/billing-health/unresolved.
 *
 * Payload shapes here were read (key names only) from stored production events; every value in tests is
 * synthetic.
 */

export interface CreemEnvelope {
  eventType: string;
  providerEventId: string;
  data: Record<string, unknown>;
  /** `object` (or `data`) was present but is not a JSON object. The event cannot be read safely. */
  objectMalformed: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const textOf = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** Creem's envelope is { id, eventType, created_at, object }. The other spellings are fallbacks. */
export function parseEnvelope(payload: Record<string, unknown>): CreemEnvelope {
  const raw = payload.object ?? payload.data;
  const objectMalformed = raw !== undefined && raw !== null && !isRecord(raw);
  return {
    eventType:       textOf(payload.eventType) || textOf(payload.type) || textOf(payload.event_type),
    providerEventId: textOf(payload.id) || textOf(payload.event_id),
    data:            isRecord(raw) ? raw : objectMalformed ? {} : payload,
    objectMalformed,
  };
}

/** Creem nests ids as objects ({ id: 'cus_…' }) on some events and sends bare strings on others. */
export function asId(v: unknown): string {
  return typeof v === 'string' ? v
    : (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string')
      ? (v as { id: string }).id
      : '';
}

/** String-valued metadata from one object. Non-string values are dropped; values are trimmed. */
export function metadataOf(data: Record<string, unknown>): Record<string, string> {
  const raw = isRecord(data.metadata) ? data.metadata : {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v.trim();
  return out;
}

/** The keys Redlined1's checkout sets. Any one of them means the event came from our checkout. */
const REDLINED_METADATA_KEYS = ['shop_id', 'user_id', 'plan_key', 'plan_id'] as const;

function redlinedKeysOf(meta: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of REDLINED_METADATA_KEYS) if (meta[k]) out[k] = meta[k];
  return out;
}

export type MetadataResolution =
  /** No Redlined1 checkout metadata anywhere on the event. */
  | { kind: 'none' }
  /** The event object and its nested subscription both carry Redlined1 metadata, and they DISAGREE. */
  | { kind: 'conflict' }
  /** One coherent source. Every identifier is read from this single object, never mixed from two. */
  | { kind: 'ok'; meta: Record<string, string>; source: 'object' | 'subscription' };

/**
 * Read the identifiers from ONE metadata source.
 *
 * A checkout.completed carries the same metadata twice: on the event object and on its nested subscription.
 * Merging them key by key would let a user_id from one and a shop_id from the other combine into a pair that no
 * checkout ever created. So: if only one place carries Redlined1 keys, that place is the source, whole. If both
 * do, they must agree exactly (same keys, same values), otherwise the event is a conflict and nothing is acted on.
 */
export function resolveEventMetadata(data: Record<string, unknown>): MetadataResolution {
  const top = metadataOf(data);
  const nested = isRecord(data.subscription) ? metadataOf(data.subscription) : {};
  const topKeys = redlinedKeysOf(top);
  const nestedKeys = redlinedKeysOf(nested);
  const hasTop = Object.keys(topKeys).length > 0;
  const hasNested = Object.keys(nestedKeys).length > 0;

  if (!hasTop && !hasNested) return { kind: 'none' };
  if (hasTop && !hasNested) return { kind: 'ok', meta: top, source: 'object' };
  if (!hasTop && hasNested) return { kind: 'ok', meta: nested, source: 'subscription' };

  const keys = new Set([...Object.keys(topKeys), ...Object.keys(nestedKeys)]);
  for (const k of keys) if (topKeys[k] !== nestedKeys[k]) return { kind: 'conflict' };
  return { kind: 'ok', meta: top, source: 'object' };
}

export const ACTIVATION_EVENT_TYPES: ReadonlySet<string> = new Set([
  'checkout.completed', 'subscription.created', 'subscription.active', 'subscription.paid',
]);
export const CANCELLATION_EVENT_TYPES: ReadonlySet<string> = new Set([
  'subscription.cancelled', 'subscription.canceled', 'subscription.expired',
]);
export const PAST_DUE_EVENT_TYPES: ReadonlySet<string> = new Set(['subscription.past_due', 'subscription.unpaid']);
/**
 * Approved rule: paused -> suspended, a TEMPORARY loss of paid access. It was held as an unhandled subscription
 * event, so a paused customer kept full access indefinitely. Restoring access is an ordinary activation
 * (subscription.active / subscription.paid), whose plan comes from the product through resolvePlan.
 */
export const SUSPENSION_EVENT_TYPES: ReadonlySet<string> = new Set(['subscription.paused']);

const isApplyType = (t: string) => ACTIVATION_EVENT_TYPES.has(t) || CANCELLATION_EVENT_TYPES.has(t)
  || PAST_DUE_EVENT_TYPES.has(t) || SUSPENSION_EVENT_TYPES.has(t);

export type CreemEventClass =
  /** Carries Redlined1 checkout metadata: it is ours and must be proven to belong to a shop. */
  | 'redlined_subscription'
  /** A subscription (or subscription lifecycle) event with no Redlined1 metadata: possibly a real customer, never dropped silently. */
  | 'unattributed_subscription'
  /** A positively identified one-time order made outside Redlined1 (payment link, dashboard). Nothing to link. */
  | 'external_order'
  /** A refund, dispute or chargeback. Money moved back: an owner decides, nothing is applied automatically. */
  | 'refund_or_dispute'
  /** A subscription lifecycle event this code does not handle (for example an update or an upgrade). */
  | 'unhandled_subscription'
  /** Missing type or id, an unreadable object, or a checkout that is neither ours nor a recognisable order. */
  | 'malformed'
  /** An event type this code has no rule for. */
  | 'unknown';

// ── Unresolved state ────────────────────────────────────────────────────────
// Stored in billing_events.error with processed = false. That is the shape the owner's Billing Health webhook view
// already counts as "failed" (error set and not processed), so it is visible without a schema change. The
// vocabulary is fixed: nothing customer-supplied ever goes in the column.

export const UNRESOLVED_PREFIX = 'UNRESOLVED:';

export type UnresolvedReason =
  // finding the shop, and proving who bought it
  | 'no_shop_metadata' | 'shop_not_found' | 'no_membership' | 'ambiguous_membership'
  | 'buyer_unverified' | 'buyer_not_member' | 'buyer_not_eligible' | 'conflicting_metadata' | 'no_buyer_profile'
  // what was bought
  | 'plan_missing' | 'plan_unknown' | 'plan_conflict'
  // what the provider says the subscription IS (Option B)
  | 'provider_state_unusable' | 'subscription_unidentified' | 'subscription_mismatch'
  // what the event is
  | 'missing_event_type' | 'missing_event_id' | 'malformed_object' | 'malformed_checkout'
  | 'refund_or_dispute' | 'unhandled_subscription_event' | 'unknown_event_type';

export const UNRESOLVED_REASON_TEXT: Record<UnresolvedReason, string> = {
  no_shop_metadata:     'The event carries no shop or user to link it to (not created by Redlined1 checkout).',
  shop_not_found:       'The event names a shop that does not exist.',
  no_membership:        'The event names a user who belongs to no shop.',
  ambiguous_membership: 'The event names a user who belongs to more than one shop, so no shop was chosen.',
  buyer_unverified:     'The event does not identify the buyer safely (a shop without a valid checkout user, or an invalid user).',
  buyer_not_member:     'The buyer named by the event is not a member of the shop it names.',
  buyer_not_eligible:   'The buyer is a member of the shop but not in a role that manages billing (owner or manager).',
  conflicting_metadata: 'The event carries two different sets of Redlined1 metadata (on the event and on its subscription).',
  no_buyer_profile:     'The buyer has no profile row to grant the plan to.',
  provider_state_unusable:   'The provider was reached but its subscription state could not be applied safely.',
  subscription_unidentified: 'Neither the event nor the shop names a subscription to reconcile this against.',
  subscription_mismatch:     'The event names a different subscription than the one stored for this shop, so it was not applied.',
  plan_missing:         'The event does not say which plan was bought.',
  plan_unknown:         'The event names a plan or product that is not a plan sold through Redlined1 checkout.',
  plan_conflict:        'The plan named in the metadata disagrees with itself or with the product actually purchased.',
  missing_event_type:   'The event has no type, so it cannot be classified.',
  missing_event_id:     'The event has no id, so it cannot be told apart from a duplicate and was not applied.',
  malformed_object:     'The event body is present but is not a readable object.',
  malformed_checkout:   'A completed checkout that is neither a Redlined1 checkout nor a recognisable order.',
  refund_or_dispute:    'A refund, dispute or chargeback. An owner must decide what it means for access.',
  unhandled_subscription_event: 'A subscription event this version does not act on (for example an update or upgrade). The stored plan is unchanged.',
  unknown_event_type:   'An event type Redlined1 has no rule for.',
};

export const unresolvedError = (reason: UnresolvedReason): string => `${UNRESOLVED_PREFIX}${reason}`;

export function parseUnresolvedReason(error: string | null | undefined): UnresolvedReason | null {
  if (!error || !error.startsWith(UNRESOLVED_PREFIX)) return null;
  const reason = error.slice(UNRESOLVED_PREFIX.length) as UnresolvedReason;
  return reason in UNRESOLVED_REASON_TEXT ? reason : null;
}

export type EventDecision =
  | { action: 'apply'; eventClass: 'redlined_subscription' | 'unattributed_subscription' }
  | { action: 'acknowledge'; eventClass: 'external_order' }
  | { action: 'hold'; eventClass: CreemEventClass; reason: UnresolvedReason };

function billingTypeOf(data: Record<string, unknown>): string {
  const product = isRecord(data.product) ? data.product : {};
  const order = isRecord(data.order) ? data.order : {};
  return String(product.billing_type ?? order.type ?? '').toLowerCase();
}

const REFUND_RE = /(^|\.)(refund|dispute|chargeback)/i;

export function decideCreemEvent(env: CreemEnvelope): EventDecision {
  const { eventType, providerEventId, data } = env;
  if (!eventType) return { action: 'hold', eventClass: 'malformed', reason: 'missing_event_type' };
  if (!providerEventId) return { action: 'hold', eventClass: 'malformed', reason: 'missing_event_id' };
  if (env.objectMalformed) return { action: 'hold', eventClass: 'malformed', reason: 'malformed_object' };
  if (REFUND_RE.test(eventType)) return { action: 'hold', eventClass: 'refund_or_dispute', reason: 'refund_or_dispute' };

  const ours = resolveEventMetadata(data).kind !== 'none';
  const isSubscriptionType = eventType.startsWith('subscription.');
  const subscriptionShaped =
    isSubscriptionType ||
    isRecord(data.subscription) ||
    (typeof data.subscription === 'string' && data.subscription.length > 0) ||
    data.object === 'subscription' ||
    ['recurring', 'subscription'].includes(billingTypeOf(data));

  if (ours || subscriptionShaped) {
    if (isApplyType(eventType)) return { action: 'apply', eventClass: ours ? 'redlined_subscription' : 'unattributed_subscription' };
    return isSubscriptionType
      ? { action: 'hold', eventClass: 'unhandled_subscription', reason: 'unhandled_subscription_event' }
      : { action: 'hold', eventClass: 'unknown', reason: 'unknown_event_type' };
  }

  // Positively an external one-time order: a known order/checkout event, billing type onetime, no metadata of ours.
  if (billingTypeOf(data) === 'onetime' && (eventType === 'checkout.completed' || eventType.startsWith('order.'))) {
    return { action: 'acknowledge', eventClass: 'external_order' };
  }
  if (eventType === 'checkout.completed') return { action: 'hold', eventClass: 'malformed', reason: 'malformed_checkout' };
  return { action: 'hold', eventClass: 'unknown', reason: 'unknown_event_type' };
}

/** The class alone, for a stored event (the owner's unresolved list). */
export function classifyCreemEvent(eventType: string, data: Record<string, unknown>): CreemEventClass {
  return decideCreemEvent({ eventType, providerEventId: 'stored', data, objectMalformed: false }).eventClass;
}

// ── Who may buy for a shop ──────────────────────────────────────────────────

/**
 * Roles allowed to be the buyer of a shop's subscription. The checkout refuses technicians outright; billing
 * policies elsewhere in the schema are written for owner and manager. This is an ALLOWLIST: a role that is new, empty
 * or misspelled is not eligible.
 */
export const BILLING_ELIGIBLE_ROLES: ReadonlySet<string> = new Set(['owner', 'manager']);

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
