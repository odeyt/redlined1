/**
 * Emitting domain events.
 *
 * ## Why not a trigger
 *
 * The M0 audit was blunt about this: a trigger cannot know the actor's intent,
 * cannot be tested without a database, and a bug in one blocks the business
 * operation itself. This project has proven the last point twice — once on
 * `NEW.id` for a table keyed on `number`, once on a `text[]` append. Both took
 * down the operation the trigger was decorating.
 *
 * So events are emitted here, by the service layer, where the actor and the
 * intent are known and the whole thing can be tested without a database.
 *
 * ## Why the emit never throws
 *
 * Same reasoning as the audit helper. An invoice that saves without its event
 * is a gap in a queue; an invoice that refuses to save because a queue insert
 * failed is a customer standing at a counter. The failure is reported, loudly,
 * and the business operation continues.
 *
 * `writeAuditEvent` is the deliberate exception to that rule and stays that
 * way: for money, an unaudited write is worse than a failed one.
 *
 * ## What this does not promise
 *
 * The event is written immediately AFTER the row it describes, not with it.
 * PostgREST has no client-side transaction, so a process that dies between the
 * two loses the event. See the migration header — closing that gap means
 * moving those writes into database functions, per entity, when something
 * actually depends on it.
 */
import type { DomainDb } from './db';
import type { DomainContext } from './context';

export interface DomainEventInput {
  /** Dotted and past tense: `invoice.issued`, `payroll.finalised`. */
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload?: Record<string, unknown>;
  /**
   * Supply one when the same logical event could be emitted twice — a retried
   * call, a webhook replay. The outbox has a unique index on it, so the second
   * insert is refused rather than queued.
   */
  idempotencyKey?: string;
  /** Ties a chain of events caused by one action together. */
  correlationId?: string;
}

/**
 * Fields that must never reach an event payload.
 *
 * An event is delivered to webhooks, AI callers and eventually third parties.
 * Anything in this list either identifies a person beyond what the subscriber
 * needs, or is a credential.
 */
const NEVER_IN_A_PAYLOAD = [
  'password', 'token', 'secret', 'api_key', 'apikey', 'auth',
  'credential', 'p256dh', 'private', 'vin', 'phone', 'email',
];

/**
 * Strip what must not leave the building, and cap the rest.
 *
 * VIN, phone and email are redacted here but NOT in audit events, and the
 * difference is deliberate: an audit row is read by the shop that owns the
 * record, an event is delivered to whoever subscribed.
 */
export function scrubPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (NEVER_IN_A_PAYLOAD.some(banned => key.toLowerCase().includes(banned))) {
      out[key] = '[redacted]';
      continue;
    }
    if (value && typeof value === 'object') {
      const text = JSON.stringify(value);
      out[key] = text.length > 2000 ? '[too large]' : JSON.parse(text);
      continue;
    }
    if (typeof value === 'string' && value.length > 2000) {
      out[key] = value.slice(0, 2000) + '…';
      continue;
    }
    out[key] = value;
  }

  return out;
}

/**
 * Queue an event for delivery.
 *
 * Returns whether it was queued. Callers generally ignore that — the point is
 * that they carry on either way — but the relay tests use it.
 */
export async function emitDomainEvent(
  db: DomainDb,
  context: DomainContext,
  input: DomainEventInput,
): Promise<boolean> {
  try {
    const { error } = await db.from('domain_event_outbox').insert({
      organization_id: context.organizationId ?? null,
      shop_id: context.shopId ?? null,
      event_type: input.eventType,
      payload: scrubPayload(input.payload ?? {}),
      aggregate_type: input.aggregateType,
      aggregate_id: input.aggregateId,
      actor_user_id: context.actor.userId ?? null,
      actor_type: context.actor.type,
      idempotency_key: input.idempotencyKey ?? null,
      correlation_id: input.correlationId ?? null,
      status: 'pending',
    });

    if (error) {
      // 23505 is the idempotency index doing its job: this event is already
      // queued. Not a failure, and not worth reporting as one.
      if ((error as { code?: string }).code === '23505') return false;
      throw error;
    }
    return true;
  } catch (error) {
    console.error('[events] failed to queue ' + input.eventType + ' for ' + input.aggregateId, error);
    try {
      const { alertException } = await import('@/lib/observability/alerts');
      alertException('events', error, { eventType: input.eventType });
    } catch {
      /* reporting must not be the thing that breaks */
    }
    return false;
  }
}

/**
 * The event types this system emits.
 *
 * A list rather than free strings, so a subscriber can be written against
 * something knowable, and so a typo becomes a compile error rather than an
 * event nobody ever receives.
 */
export const DOMAIN_EVENTS = {
  invoiceIssued: 'invoice.issued',
  paymentRecorded: 'payment.recorded',
  paymentReversed: 'payment.reversed',
  repairOrderClosed: 'repair_order.closed',
  estimateApproved: 'estimate.approved',
  payrollFinalised: 'payroll.finalised',
  cashDayClosed: 'cash_day.closed',
  expenseApproved: 'expense.approved',
  leaveApproved: 'leave.approved',
} as const;

export type DomainEventType = typeof DOMAIN_EVENTS[keyof typeof DOMAIN_EVENTS];
