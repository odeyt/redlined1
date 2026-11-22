/**
 * Redline AI (prototype) — shared types.
 *
 * Redline AI is a read-only chat panel inside RedlineD1 that answers five
 * questions for the signed-in user's OWN shop (spec:
 * ~/workspace/redlined1/redline-ai-spec.md §3):
 *
 *   1. morning_brief    — open jobs, stale estimates, unpaid invoices, top 3
 *   2. stale_estimates  — estimates sent with no reply, aged, with drafts
 *   3. who_owes         — unpaid / overdue invoices grouped by customer
 *   4. vehicle_history  — past jobs / inspections / declined work for a vehicle
 *   5. draft_follow_up  — a follow-up message DRAFT for an estimate or invoice
 *
 * Nothing in this module writes business data, sends a message, books
 * anything, or crosses shops. Every figure in an answer is copied from a
 * stored record and cited by its document number.
 */

export type RedlineAiJob =
  | 'morning_brief'
  | 'stale_estimates'
  | 'who_owes'
  | 'vehicle_history'
  | 'draft_follow_up'
  | 'vehicle_search';

export interface EstimateFact {
  id: string;
  /** estimate_number when present, else the row id — what staff recognise. */
  number: string;
  /** Raw status as stored (the codebase has both 'Sent' and 'sent' eras). */
  status: string;
  customerName: string;
  vehicleLabel: string;
  /** total_amount when stored, else computed from lines; null if neither. */
  total: number | null;
  currency: string;
  /** sent_at when stored, else created_at — when the customer got it. */
  sentAt: string | null;
  createdAt: string;
  /** Whole days from sentAt (or createdAt) to today. */
  ageDays: number;
  /** Awaiting a customer decision: sent and not approved/declined/closed. */
  awaitingReply: boolean;
  /** Awaiting reply and at least STALE_ESTIMATE_DAYS old. */
  stale: boolean;
}

export interface JobFact {
  id: string;
  /** Repair-order number (job_cards.ro) when present. */
  ro: string;
  customerName: string;
  vehicleLabel: string;
  serviceType: string;
  status: string;
  checkInDate: string;
  /** Whole days the job has been open (from check-in / creation). */
  ageDays: number;
}

export interface OwedInvoiceFact {
  invoiceNumber: string;
  customerName: string;
  vehicleLabel: string;
  currency: string;
  total: number;
  paid: number;
  balance: number;
  dueDate: string;
  daysOverdue: number;
  status: string;
}

export interface CustomerOwes {
  customerName: string;
  invoices: OwedInvoiceFact[];
  /** Balances summed per currency — currencies are never mixed. */
  totalsByCurrency: Record<string, number>;
  /** The oldest due date among the customer's unpaid invoices. */
  oldestDueDate: string;
  /** The largest daysOverdue among the customer's unpaid invoices. */
  maxDaysOverdue: number;
}

export interface VehicleFact {
  id: string;
  label: string;
  plate: string;
  customerName: string;
}

export interface HistoryEvent {
  date: string;
  kind: 'job' | 'inspection' | 'estimate' | 'invoice' | 'repair_order';
  /** Document number / reference a staff member can open. */
  reference: string;
  summary: string;
  status: string;
}

export interface VehicleHistory {
  vehicle: VehicleFact;
  events: HistoryEvent[];
  declinedEstimates: EstimateFact[];
}

export interface FollowUpDraft {
  /** 'estimate' | 'invoice' */
  kind: 'estimate' | 'invoice';
  /** Document number the draft refers to (EST-… / invoice number). */
  reference: string;
  customerName: string;
  draft: string;
  /** True when the optional LLM wrote the draft; false for the template. */
  llmUsed: boolean;
}

export interface RedlineAiAnswer {
  job: RedlineAiJob;
  /** Plain-English answer. Every figure in it comes from `data`. */
  answer: string;
  /** True when the optional LLM rephrased the deterministic answer. */
  llmUsed: boolean;
  /** Structured facts behind the answer — the citations. */
  data: Record<string, unknown>;
}
