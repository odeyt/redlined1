/**
 * Phase E Part 1, Part 5/6 — mirrors Sapelee's REDLINED1_EVENT_TYPES exactly
 * (lib/events/schemas/redlined1-events.ts in the Sapelee repo). Duplicated
 * here deliberately, not imported — these are two separate repositories
 * with no shared package, per the mission's "no merged repositories"
 * constraint. Keeping the literal strings identical on both sides is what
 * makes the contract work; a mismatch here would just make Sapelee reject
 * the event type with a 400, not silently misbehave.
 */
export const SAPELEE_EVENT_TYPES = {
  JOB_CARD_CREATED: 'job_card.created',
  REPAIR_COMPLETED: 'repair.completed',
  ESTIMATE_ACCEPTED: 'estimate.accepted',
  PAYMENT_RECEIVED: 'payment.received',
  CUSTOMER_CREATED: 'customer.created',
  VEHICLE_CREATED: 'vehicle.created',
  APPOINTMENT_BOOKED: 'appointment.booked',
  VIN_DECODED: 'vin.decoded',
} as const

export type SapeleeEventType = (typeof SAPELEE_EVENT_TYPES)[keyof typeof SAPELEE_EVENT_TYPES]

export type OutboxStatus = 'pending' | 'delivered' | 'failed'

export interface SapeleeOutboxRow {
  id: string
  shop_id: string | null
  event_type: string
  event_version: number
  payload: Record<string, unknown>
  aggregate_type: string | null
  aggregate_id: string | null
  idempotency_key: string | null
  correlation_id: string | null
  status: OutboxStatus
  attempts: number
  max_attempts: number
  last_error: string | null
  next_attempt_at: string
  delivered_at: string | null
  created_at: string
  updated_at: string
}

export interface PublishSapeleeEventInput {
  eventType: SapeleeEventType
  payload: Record<string, unknown>
  shopId?: string | null
  aggregateType?: string | null
  aggregateId?: string | null
  idempotencyKey?: string | null
  correlationId?: string | null
}
