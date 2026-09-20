/**
 * lib/billing/unresolvedEvents.ts
 * SERVER ONLY. Read-only list of Creem events the webhook received but did not apply
 * (billing_events rows with processed = false and error = 'UNRESOLVED:<reason>').
 *
 * What it returns, and what it deliberately does not:
 *   - the row id (billing_events.id, an internal id) so the owner can open the exact row in the SQL editor,
 *   - the event type, when it arrived, the fixed reason, and a MASKED provider event reference for matching it
 *     against the Creem dashboard;
 *   - two booleans saying whether the event carried a shop id / a user id, and its classification.
 *   It NEVER returns the payload, an email, a customer name, a full provider id or any metadata value. The payload
 *   is read only to compute those flags, in memory, and is not part of the response.
 *
 * Nothing here writes. Resolving an event is a human decision made outside this API; a redelivery from Creem then
 * re-evaluates it (see the webhook route).
 */
import 'server-only';
import { getAdminDb } from '@/lib/supabaseServer';
import {
  UNRESOLVED_PREFIX, UNRESOLVED_REASON_TEXT, classifyCreemEvent, parseEnvelope, parseUnresolvedReason, resolveEventMetadata,
  type CreemEventClass, type UnresolvedReason,
} from '@/lib/billing/creemEvent';

export const UNRESOLVED_LIST_LIMIT = 50;

export interface UnresolvedBillingEvent {
  /** billing_events.id: the row to open. Internal, not customer data. */
  id: string;
  eventType: string;
  receivedAt: string;
  reason: UnresolvedReason;
  reasonText: string;
  classification: CreemEventClass;
  /** First and last characters of the provider event id, enough to find it in the Creem dashboard. */
  eventRef: string;
  carriesShopId: boolean;
  carriesUserId: boolean;
}

export interface UnresolvedBillingEvents {
  count: number;
  limit: number;
  /** More unresolved events exist than are listed. */
  truncated: boolean;
  events: UnresolvedBillingEvent[];
  howToInvestigate: string[];
}

export function maskEventRef(providerEventId: string | null | undefined): string {
  const id = providerEventId ?? '';
  if (!id) return '(none)';
  return id.length <= 8 ? `…${id.slice(-2)}` : `${id.slice(0, 4)}…${id.slice(-4)}`;
}

const HOW_TO_INVESTIGATE = [
  'Open the billing_events row with the id shown (Supabase SQL editor). The payload is deliberately not returned by this API.',
  'Match the event reference against the event in the Creem dashboard to see what was ordered and by whom.',
  'Only a positively identified one-time order made outside Redlined1 is acknowledged quietly and not listed here. Everything else that was not applied is: events with no shop, a buyer who is not an eligible member, a missing or conflicting plan, refunds, unhandled subscription events, and events with no type or id.',
  'If the buyer is a Redlined1 customer, correct the cause (a role, a membership, which of two shops), then ask Creem to redeliver the event. The redelivery re-evaluates it, reuses this row and clears it. Nothing is applied automatically.',
  'An event with reason no_shop_metadata cannot be fixed by a redelivery, because its bytes never change. Follow "Resolving an event with no shop metadata" in docs/billing-webhook-idempotency.md; it does not edit any stored payload.',
];

export async function listUnresolvedBillingEvents(): Promise<UnresolvedBillingEvents> {
  const db = getAdminDb();
  // The prefix contains "_" (a LIKE wildcard), so match loosely here and confirm exactly below.
  const { data, error } = await db
    .from('billing_events')
    .select('id, event_type, provider_event_id, created_at, error, payload')
    .eq('processed', false)
    .like('error', `${UNRESOLVED_PREFIX.slice(0, 10)}%`)
    .order('created_at', { ascending: false })
    .limit(UNRESOLVED_LIST_LIMIT * 4);
  if (error) throw new Error(`unresolved events query failed: ${error.message}`);

  const all: UnresolvedBillingEvent[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const reason = parseUnresolvedReason(typeof row.error === 'string' ? row.error : null);
    if (!reason) continue;   // an ordinary failure, or a lookalike: not this list's business
    const payload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>;
    const { eventType, data: object } = parseEnvelope(payload);
    const resolved = resolveEventMetadata(object);
    const meta = resolved.kind === 'ok' ? resolved.meta : {};
    all.push({
      id: String(row.id),
      eventType: String(row.event_type ?? eventType),
      receivedAt: String(row.created_at),
      reason,
      reasonText: UNRESOLVED_REASON_TEXT[reason],
      classification: classifyCreemEvent(String(row.event_type ?? eventType), object),
      eventRef: maskEventRef(typeof row.provider_event_id === 'string' ? row.provider_event_id : ''),
      carriesShopId: !!meta.shop_id,
      carriesUserId: !!meta.user_id,
    });
  }

  return {
    count: Math.min(all.length, UNRESOLVED_LIST_LIMIT),
    limit: UNRESOLVED_LIST_LIMIT,
    truncated: all.length > UNRESOLVED_LIST_LIMIT,
    events: all.slice(0, UNRESOLVED_LIST_LIMIT),
    howToInvestigate: HOW_TO_INVESTIGATE,
  };
}
