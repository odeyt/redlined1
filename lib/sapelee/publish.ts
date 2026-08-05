import type { SupabaseClient } from '@supabase/supabase-js'
import { getSapeleeEventsConfig } from './config'
import type { PublishSapeleeEventInput } from './types'

/**
 * Phase E Part 1, Part 6/7 — the SDK's public entrypoint. Safe to call from
 * ANYWHERE (client component or server code) — it never touches the HMAC
 * secret, never calls Sapelee directly, and never throws. It only writes a
 * durable row to the local sapelee_event_outbox table (the offline queue,
 * Part 7) using whatever Supabase client the caller already has (the
 * browser client at every real call site found in the Part 1 audit).
 * Delivery to Sapelee happens later, out-of-band, in lib/sapelee/flush.ts —
 * server-only, holds the real secret, never imported here.
 *
 * Safe-by-default: NEXT_PUBLIC_SAPELEE_EVENTS_ENABLED must be explicitly
 * 'true' or this is a complete no-op — not even a queue write — matching
 * "unconfigured always means safe" on both sides of this integration.
 */
export async function publishSapeleeEvent(
  supabase: SupabaseClient,
  input: PublishSapeleeEventInput
): Promise<{ queued: boolean }> {
  const config = getSapeleeEventsConfig()
  if (!config.enabled) return { queued: false }

  try {
    const { error } = await supabase.from('sapelee_event_outbox').insert({
      shop_id: input.shopId ?? null,
      event_type: input.eventType,
      event_version: 1,
      payload: input.payload,
      aggregate_type: input.aggregateType ?? null,
      aggregate_id: input.aggregateId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      correlation_id: input.correlationId ?? null,
    })
    if (error) {
      console.error('[sapelee] publish: outbox insert failed', error.message)
      return { queued: false }
    }
    return { queued: true }
  } catch (err) {
    console.error('[sapelee] publish: unexpected error', err)
    return { queued: false }
  }
}
