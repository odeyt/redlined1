import type { SupabaseClient } from '@supabase/supabase-js'
import { getSapeleeEventsConfig } from './config'
import { signRequest } from './signing'
import type { SapeleeOutboxRow } from './types'

/**
 * Phase E Part 1, Part 7 — the offline queue's flush/delivery half.
 * SERVER-ONLY (imports signing.ts, which holds the raw secret). Called from
 * app/api/sapelee/flush/route.ts and scripts/flush-sapelee-outbox.ts — this
 * repo has no cron infrastructure (confirmed absent during the Part 1
 * audit), so, matching this repo's own existing pattern of npm-scripted
 * jobs (backfill:repair-graph, intelligence:recalculate, etc. — all
 * externally/manually triggered, none self-scheduling), flushing is
 * triggered the same way: manually, or by whatever external scheduler
 * already runs those other scripts. Not fabricating cron infra that
 * doesn't otherwise exist in this codebase.
 *
 * ORDERING GUARANTEE: rows are processed strictly in `created_at` order.
 * On a retryable failure, the flush run STOPS — it does not skip ahead to
 * later rows — so events are never delivered to Sapelee out of order. The
 * one deliberate exception: a row that has exhausted `max_attempts` is
 * marked permanently 'failed' and skipped, so one poison-pill event can't
 * block the queue forever; this is a bounded, explicit exception to
 * ordering, not routine behavior.
 */

const BATCH_LIMIT = 50
const BASE_BACKOFF_MS = 30_000
const MAX_BACKOFF_MS = 30 * 60_000

function computeNextAttempt(attempts: number): string {
  const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS)
  return new Date(Date.now() + backoff).toISOString()
}

function buildRequestBody(row: SapeleeOutboxRow): string {
  return JSON.stringify({
    eventType: row.event_type,
    eventVersion: row.event_version,
    payload: row.payload,
    aggregateType: row.aggregate_type ?? undefined,
    aggregateId: row.aggregate_id ?? undefined,
    idempotencyKey: row.idempotency_key ?? undefined,
    correlationId: row.correlation_id ?? undefined,
  })
}

export interface FlushResult {
  attempted: number
  delivered: number
  retrying: number
  permanentlyFailed: number
  stoppedEarly: boolean
  errors: string[]
}

export async function flushSapeleeOutbox(supabase: SupabaseClient): Promise<FlushResult> {
  const result: FlushResult = {
    attempted: 0,
    delivered: 0,
    retrying: 0,
    permanentlyFailed: 0,
    stoppedEarly: false,
    errors: [],
  }

  const config = getSapeleeEventsConfig()
  if (!config.enabled || !config.configured) {
    return result
  }

  const { data, error } = await supabase
    .from('sapelee_event_outbox')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (error || !data) {
    result.errors.push(error?.message ?? 'outbox query failed')
    return result
  }

  const rows = data as SapeleeOutboxRow[]

  for (const row of rows) {
    result.attempted += 1
    const rawBody = buildRequestBody(row)
    const headers = signRequest(config.keyId, config.apiSecret, rawBody)

    let delivered = false
    let errorMessage: string | null = null

    try {
      const res = await fetch(`${config.eventsUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: rawBody,
      })
      if (res.ok) {
        delivered = true
      } else {
        errorMessage = `HTTP ${res.status}: ${await res.text().catch(() => '')}`
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'network error'
    }

    if (delivered) {
      await supabase
        .from('sapelee_event_outbox')
        .update({ status: 'delivered', delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', row.id)
      result.delivered += 1
      continue
    }

    const attempts = row.attempts + 1
    if (attempts >= row.max_attempts) {
      await supabase
        .from('sapelee_event_outbox')
        .update({
          status: 'failed',
          attempts,
          last_error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      result.permanentlyFailed += 1
      result.errors.push(`${row.id}: ${errorMessage} (exhausted ${attempts} attempts)`)
      continue // poison pill — skip past it, ordering exception documented above
    }

    await supabase
      .from('sapelee_event_outbox')
      .update({
        attempts,
        last_error: errorMessage,
        next_attempt_at: computeNextAttempt(attempts),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    result.retrying += 1
    result.errors.push(`${row.id}: ${errorMessage} (attempt ${attempts}/${row.max_attempts})`)
    result.stoppedEarly = true
    break // preserve ordering — do not attempt rows behind a retryable failure
  }

  return result
}
