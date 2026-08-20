/**
 * The relay: takes claimed events off the outbox and writes them into the bus.
 *
 * ## Where events go
 *
 * Into `rib_events` — the append-only store that has existed, fully built and
 * with zero rows, since it was written. The M0 audit's finding was that four
 * event mechanisms already exist and the instinct would be to build a fifth.
 * So this builds none: the outbox is the durable queue the bus lacked, and the
 * relay is the thing that moves rows from one to the other.
 *
 * `rib_events` refuses UPDATE and DELETE by rule, which is why the relay is
 * the only writer and why a delivered event can never be edited afterwards.
 *
 * ## Not webhooks
 *
 * `rib_subscriptions` describes IN-PROCESS subscribers — subscriber_id,
 * subscribed_events, is_enabled. There is no endpoint_url on it and no webhook
 * endpoint table anywhere, so this relay does not make HTTP calls. Outbound
 * webhooks are M14, and they will read from `rib_events` like every other
 * consumer rather than from the queue.
 *
 * ## Claim, write, settle
 *
 * `claim_domain_events` hands back rows and marks them claimed in one
 * statement using FOR UPDATE SKIP LOCKED, so two relays divide the work rather
 * than both writing the same event. That is the piece the Sapelee flush never
 * had — its workflow needs a concurrency group to stay safe.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface OutboxEvent {
  id: string;
  organization_id: string | null;
  shop_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  aggregate_type: string | null;
  aggregate_id: string | null;
  actor_user_id: string | null;
  actor_type: string;
  correlation_id: string | null;
  created_at: string;
  attempts: number;
}

export interface RelayResult {
  claimed: number;
  written: number;
  failed: number;
  /** Events that can never succeed, and were stopped rather than retried. */
  unroutable: number;
  errors: string[];
}

/**
 * Turn an outbox row into a bus event.
 *
 * Exported because the column mismatch between the two tables is exactly the
 * kind of thing that reads as correct and produces nulls — `rib_events` has
 * `event_id` not `id`, `timestamp` not `created_at`, and its `organization_id`
 * is TEXT while the outbox holds a UUID.
 */
export function toBusEvent(event: OutboxEvent): Record<string, unknown> {
  return {
    event_id: event.id,
    event_type: event.event_type,
    timestamp: event.created_at,
    organization_id: String(event.organization_id),
    shop_id: event.shop_id,
    // NOT NULL on the store. An event that was not part of a chain is its own
    // correlation, which is more useful than a placeholder string.
    correlation_id: event.correlation_id ?? event.id,
    schema_version: '1.0',
    payload: {
      ...event.payload,
      aggregate: { type: event.aggregate_type, id: event.aggregate_id },
      actor: { userId: event.actor_user_id, type: event.actor_type },
    },
  };
}

/**
 * Events the store physically cannot accept.
 *
 * `rib_events.shop_id` and `organization_id` are NOT NULL. An outbox row
 * missing either will fail every attempt identically, so retrying it eight
 * times with exponential backoff achieves nothing except hiding it among the
 * transient failures.
 */
export function unroutableReason(event: OutboxEvent): string | null {
  if (!event.shop_id) return 'no shop_id — the bus store requires one';
  if (!event.organization_id) return 'no organization_id — the bus store requires one';
  return null;
}

/** Run one pass. Returns what it did; the caller decides what that means. */
export async function relayOnce(
  db: Db,
  options: { limit?: number; worker?: string } = {},
): Promise<RelayResult> {
  const result: RelayResult = { claimed: 0, written: 0, failed: 0, unroutable: 0, errors: [] };

  const { data: claimed, error: claimError } = await db.rpc('claim_domain_events', {
    p_limit: options.limit ?? 50,
    p_worker: options.worker ?? 'relay',
  });

  if (claimError) {
    result.errors.push('claim failed: ' + claimError.message);
    return result;
  }

  const events = (claimed ?? []) as OutboxEvent[];
  result.claimed = events.length;

  for (const event of events) {
    const blocked = unroutableReason(event);
    if (blocked) {
      // Burn every attempt at once so it lands in 'dead' immediately, where a
      // person will see it, instead of trickling through eight retries over
      // four hours pretending it might work.
      for (let i = 0; i < 8; i++) {
        await db.rpc('settle_domain_event', { p_id: event.id, p_ok: false, p_error: blocked });
      }
      result.unroutable += 1;
      result.errors.push(event.event_type + ': ' + blocked);
      continue;
    }

    const { error } = await db.from('rib_events').insert(toBusEvent(event));

    if (error) {
      // 23505 means this event is already in the store — a redelivery after a
      // relay died between writing and settling. The write already happened,
      // so this is a success, not a failure.
      if ((error as { code?: string }).code === '23505') {
        await db.rpc('settle_domain_event', { p_id: event.id, p_ok: true });
        result.written += 1;
        continue;
      }
      await db.rpc('settle_domain_event', { p_id: event.id, p_ok: false, p_error: error.message });
      result.failed += 1;
      result.errors.push(event.event_type + ' → ' + error.message);
      continue;
    }

    await db.rpc('settle_domain_event', { p_id: event.id, p_ok: true });
    result.written += 1;
  }

  return result;
}
