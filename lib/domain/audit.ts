/**
 * The one way a domain write records what it did.
 *
 * Redlined1 has had an `audit_logs` table since the beginning:
 * `action, "user" text, entity, time text`. No shop, no actor id, no
 * before/after, no protection against being rewritten — and zero rows, because
 * nothing ever wrote to it. Payroll, receivables and AI-initiated writes all
 * assume an audit trail exists. It did not.
 *
 * Rules this module exists to hold:
 *
 *   - One shape. Every service calls this, so a payment change and a customer
 *     change are queryable the same way. A per-service audit format is the
 *     same as no audit format.
 *   - The actor is never taken from the caller's word for it. The insert goes
 *     through `record_audit_event`, a SECURITY DEFINER function that stamps
 *     auth.uid() itself and checks shop membership. A browser can therefore
 *     write audit rows without being able to forge who wrote them.
 *   - Append-only, enforced in the database, not here.
 *   - Failure to audit is never silent. See writeAuditEvent below.
 */
import type { DomainContext } from './context';
import type { DomainDb } from './db';

/** Dotted `entity.verb`, so the log reads as a sentence and groups by entity. */
export type AuditAction = string;

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId: string;
  /** State before the change. Omit for creates. */
  before?: Record<string, unknown> | null;
  /** State after the change. Omit for deletes. */
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Keys whose values must never reach the audit table.
 *
 * An audit row is read by more people, and kept far longer, than the record it
 * describes. Anything secret that lands here has effectively been published.
 */
const REDACTED_KEY = /(token|secret|password|passwd|api[_-]?key|authorization|auth|credential|p256dh|private)/i;

/** Values big enough to be a document rather than a field. */
const MAX_VALUE_CHARS = 2000;

/**
 * Trims a snapshot to what is worth keeping: business fields, no secrets, no
 * blobs. Returns null for an empty result so the column stays NULL rather than
 * holding `{}`, which reads as "nothing changed" when it means "nothing kept".
 */
export function redactSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!snapshot) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (REDACTED_KEY.test(key)) { out[key] = '[redacted]'; continue; }
    if (value === null || value === undefined) { out[key] = null; continue; }
    if (typeof value === 'object') {
      const encoded = JSON.stringify(value);
      // Line arrays on an invoice are the point of the audit, so they are kept
      // unless they are genuinely oversized.
      out[key] = encoded.length > MAX_VALUE_CHARS ? `[${encoded.length} chars omitted]` : value;
      continue;
    }
    if (typeof value === 'string' && value.length > MAX_VALUE_CHARS) {
      out[key] = `[${value.length} chars omitted]`;
      continue;
    }
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export class AuditWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditWriteError';
  }
}

/**
 * Writes one audit row.
 *
 * Throws on failure, deliberately. The temptation is to swallow it so a
 * logging problem cannot break a payment — but an unaudited financial write is
 * precisely the state this milestone exists to end, and a silent failure would
 * leave the table looking healthy while recording nothing. Callers that
 * genuinely can survive without the record must say so explicitly.
 */
export async function writeAuditEvent(
  db: DomainDb,
  context: DomainContext,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await db.rpc('record_audit_event', {
    p_shop_id: context.shopId,
    p_actor_type: context.actor.type,
    p_actor_role: context.actor.role,
    p_action: entry.action,
    p_entity_type: entry.entityType,
    p_entity_id: entry.entityId,
    p_before: redactSnapshot(entry.before),
    p_after: redactSnapshot(entry.after),
    p_metadata: redactSnapshot(entry.metadata),
    p_request_id: context.requestId ?? null,
  });

  if (error) {
    throw new AuditWriteError(
      `Could not record ${entry.action} on ${entry.entityType} ${entry.entityId}: ${error.message}`,
    );
  }
}

/** Actions M1 emits. Named here so a typo is a compile error, not a lost row. */
export const AUDIT = {
  customerCreated: 'customer.created',
  customerUpdated: 'customer.updated',
  customerArchived: 'customer.archived',
  customerRestored: 'customer.restored',
  customerDeleted: 'customer.deleted',
  employeeCreated: 'employee.created',
  employeeUpdated: 'employee.updated',
  employeeArchived: 'employee.archived',
  jobCreated: 'job_card.created',
  jobUpdated: 'job_card.updated',
  jobClosed: 'job_card.closed',
  jobDeleted: 'job_card.deleted',
  vehicleCreated: 'vehicle.created',
  vehicleUpdated: 'vehicle.updated',
  vehicleTransferred: 'vehicle.transferred',
  vehicleDeleted: 'vehicle.deleted',
  repairOrderCreated: 'repair_order.created',
  repairOrderUpdated: 'repair_order.updated',
  repairOrderDeleted: 'repair_order.deleted',
  estimateCreated: 'estimate.created',
  estimateUpdated: 'estimate.updated',
  estimateApproved: 'estimate.approved',
  estimateDeleted: 'estimate.deleted',
  repairOrderClosed: 'repair_order.closed',
  inspectionCreated: 'inspection.created',
  inspectionUpdated: 'inspection.updated',
  inspectionDeleted: 'inspection.deleted',
  appointmentCreated: 'appointment.created',
  appointmentUpdated: 'appointment.updated',
  appointmentDeleted: 'appointment.deleted',
  partCreated: 'part.created',
  partUpdated: 'part.updated',
  /** Quantity moved on its own — a sale, a reservation, a stock count. */
  partStockChanged: 'part.stock_changed',
  partDeleted: 'part.deleted',
  vendorCreated: 'vendor.created',
  vendorUpdated: 'vendor.updated',
  vendorDeleted: 'vendor.deleted',
  partsOrderCreated: 'parts_order.created',
  partsOrderUpdated: 'parts_order.updated',
  partsOrderDeleted: 'parts_order.deleted',
  technicianCreated: 'technician.created',
  technicianUpdated: 'technician.updated',
  technicianDeleted: 'technician.deleted',
  /** Deleting a clock record removes the evidence of hours worked. */
  timeEntryDeleted: 'time_entry.deleted',
  /** A working day recorded for the first time. */
  attendanceRecorded: 'attendance.recorded',
  /** A working day changed after the fact. This is the one people query. */
  attendanceCorrected: 'attendance.corrected',
  leaveRequested: 'leave.requested',
  leaveApproved: 'leave.approved',
  leaveRejected: 'leave.rejected',
  leaveCancelled: 'leave.cancelled',
  leaveTypeChanged: 'leave_type.changed',
  /** A pay rate set from a date. Never an edit — the history is insert-only. */
  salarySet: 'salary.set',
  advanceRequested: 'salary_advance.requested',
  advanceApproved: 'salary_advance.approved',
  advanceRejected: 'salary_advance.rejected',
  /** The money actually handed over. This is the one payroll deducts from. */
  advancePaid: 'salary_advance.paid',
  payrollRunCreated: 'payroll_run.created',
  /** The moment a run stops being a draft and becomes what people are owed. */
  payrollRunFinalised: 'payroll_run.finalised',
  payrollRunPaid: 'payroll_run.paid',
  payrollDraftDeleted: 'payroll_run.draft_deleted',
  /** Shop settings changed — labour rate, tax rate, currency, prefixes. */
  settingsUpdated: 'settings.updated',
  /** Who can see and do what. A security decision, not a preference. */
  settingsPermissionsChanged: 'settings.permissions_changed',
  maintenanceCreated: 'maintenance.created',
  maintenanceUpdated: 'maintenance.updated',
  maintenanceDeleted: 'maintenance.deleted',
  partsEstimateCreated: 'parts_estimate.created',
  partsEstimateUpdated: 'parts_estimate.updated',
  partsEstimateDeleted: 'parts_estimate.deleted',
  invoiceCreated: 'invoice.created',
  invoiceUpdated: 'invoice.updated',
  invoiceStatusChanged: 'invoice.status_changed',
  invoiceDeleted: 'invoice.deleted',
  paymentCreated: 'payment.created',
  /** An entry cancelled by its opposite. The original row still stands. */
  paymentReversed: 'payment.reversed',
  /** A reversal plus its replacement, recorded as one intent. */
  paymentCorrected: 'payment.corrected',
} as const;
