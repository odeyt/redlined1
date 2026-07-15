/**
 * lib/intelligence-bus/idempotency.ts
 *
 * Database-backed idempotent handler execution for the Redline Intelligence Bus.
 *
 * The idempotency key is: `${eventId}:${handlerName}:${handlerVersion}`
 *
 * On first delivery: insert a `processing` record, run the handler, mark `completed`.
 * On duplicate delivery: read the existing record, return the cached outcome.
 * On concurrent duplicate: the UNIQUE constraint on `rib_event_deliveries.idempotency_key`
 *   will cause the second insert to fail — that caller receives an error and should not retry.
 *
 * This module is a pure function layer. The Supabase client is injected to keep
 * it testable without network access.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RibEvent } from './event-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeliveryStatus =
  | 'processing'
  | 'completed'
  | 'failed'
  | 'retry_scheduled'
  | 'dead_lettered'
  | 'skipped';

export interface HandlerMeta {
  /** Stable name used in the idempotency key, e.g. 'vehicle_health_handler' */
  name: string;
  /** Increment when the handler logic changes in a way that requires re-delivery */
  version: string;
}

export interface DeliveryRecord {
  id: string;
  eventId: string;
  organizationId: string;
  handlerName: string;
  handlerVersion: string;
  status: DeliveryStatus;
  attemptCount: number;
  idempotencyKey: string;
  errorCode: string | null;
  errorMessage: string | null;
  firstAttemptedAt: string;
  lastAttemptedAt: string;
  completedAt: string | null;
}

export interface IdempotentRunResult {
  outcome: 'executed' | 'skipped_duplicate' | 'skipped_already_completed';
  deliveryRecordId: string | null;
  errorCode: string | null;
}

// ---------------------------------------------------------------------------
// Key building
// ---------------------------------------------------------------------------

export function buildIdempotencyKey(eventId: string, handlerName: string, handlerVersion: string): string {
  return `${eventId}:${handlerName}:${handlerVersion}`;
}

// ---------------------------------------------------------------------------
// Idempotent runner
// ---------------------------------------------------------------------------

/**
 * Wraps a handler function with database-backed idempotency.
 *
 * If the (eventId, handlerName, handlerVersion) triplet has already been
 * processed successfully, the handler is skipped and the cached outcome is returned.
 *
 * If db is null, runs the handler directly without idempotency tracking.
 * This supports the case where the bus is used without a database connection
 * (e.g. in unit tests).
 */
export async function runIdempotent(
  event: RibEvent,
  handler: HandlerMeta,
  fn: () => Promise<void>,
  db: SupabaseClient | null,
): Promise<IdempotentRunResult> {
  if (db === null) {
    await fn();
    return { outcome: 'executed', deliveryRecordId: null, errorCode: null };
  }

  const idempotencyKey = buildIdempotencyKey(event.eventId, handler.name, handler.version);
  const now = new Date().toISOString();

  // Attempt to create a `processing` record — will fail with unique violation if duplicate
  const { data: inserted, error: insertError } = await db
    .from('rib_event_deliveries')
    .insert({
      event_id: event.eventId,
      organization_id: event.organizationId,
      handler_name: handler.name,
      handler_version: handler.version,
      status: 'processing',
      attempt_count: 1,
      idempotency_key: idempotencyKey,
      first_attempted_at: now,
      last_attempted_at: now,
    })
    .select('id')
    .single();

  if (insertError) {
    // Check if this is a unique constraint violation (already in flight or completed)
    if (insertError.code === '23505') {
      // Read the existing record to determine outcome
      const { data: existing } = await db
        .from('rib_event_deliveries')
        .select('id, status')
        .eq('idempotency_key', idempotencyKey)
        .single();

      if (existing?.status === 'completed') {
        return { outcome: 'skipped_already_completed', deliveryRecordId: existing.id, errorCode: null };
      }
      return { outcome: 'skipped_duplicate', deliveryRecordId: existing?.id ?? null, errorCode: 'DUPLICATE_IN_FLIGHT' };
    }
    // Non-unique error — fall through and run the handler anyway (fail open)
    await fn();
    return { outcome: 'executed', deliveryRecordId: null, errorCode: insertError.code };
  }

  const deliveryRecordId = (inserted as { id: string }).id;

  try {
    await fn();

    // Mark completed
    await db
      .from('rib_event_deliveries')
      .update({ status: 'completed', completed_at: new Date().toISOString(), last_attempted_at: new Date().toISOString() })
      .eq('id', deliveryRecordId);

    return { outcome: 'executed', deliveryRecordId, errorCode: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Mark failed
    await db
      .from('rib_event_deliveries')
      .update({
        status: 'failed',
        error_code: 'HANDLER_ERROR',
        error_message: errorMessage.slice(0, 2000),
        last_attempted_at: new Date().toISOString(),
      })
      .eq('id', deliveryRecordId);

    throw err;
  }
}
