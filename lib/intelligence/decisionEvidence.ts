/**
 * SI-5 decision evidence: the specific records behind a Command Center
 * recommendation, plus what to do about them.
 *
 * Every recommendation should answer five questions for the owner:
 *   1. What should I do?        → `nextStep`
 *   2. Why does it matter?      → the recommendation's own "why" (EvidenceEngine)
 *   3. What evidence?           → `records` (the actual invoices, estimates, jobs, parts)
 *   4. What is the impact?      → `impact`, money per currency
 *   5. What can I do next?      → `actions`, buttons that open the right screen
 *
 * Pure: no database, no browser client, no AI. The loader
 * (intelligence/evidence/DecisionEvidenceLoader.ts) fetches rows; this file
 * decides which rows count and how they read.
 *
 * ## Same rules as the counts
 *
 * Each selector applies EXACTLY the rule MetricsBuilder uses for the signal
 * that fired the recommendation, so "Collect 4 unpaid invoices" lists four
 * invoices, not three or six. Unpaid invoices go through receivablesFrom(),
 * the rule the Invoices screen and Money Owed use.
 *
 * ## Money
 *
 * Totals are kept per currency and never converted: a THB invoice and a USD
 * invoice show as "฿12,000.00 + $340.00", the way the rest of the app reports
 * mixed money.
 *
 * ## Privacy
 *
 * A record carries its number, customer name and vehicle — what staff already
 * see on the list screens. Never a phone, email or address, and any
 * VIN-shaped token is removed from the vehicle label.
 */
import { receivablesFrom } from '@/lib/domain/receivables';
import type { InvoiceFull } from '@/lib/domain/invoiceMath';
import type { DomainPayment } from '@/lib/domain/payments';
import { calculateEstimateTotals } from '@/lib/domain/estimateMath';
import { addMoney, formatMoneyTotals, DEFAULT_CURRENCY, type MoneyTotals } from '@/lib/currencies';

/** Recommendation keys this module can back with records. */
export const DECISION_KEYS = [
  'unpaid_invoices',
  'stale_estimates',
  'approved_estimate_not_scheduled',
  'completed_job_not_invoiced',
  'stuck_repair_order',
  'declined_estimate_winback',
  'low_inventory',
] as const;
export type DecisionKey = typeof DECISION_KEYS[number];

export function isDecisionKey(key: string): key is DecisionKey {
  return (DECISION_KEYS as readonly string[]).includes(key);
}

/** How many records a card lists. The count and totals always cover all of them. */
export const MAX_RECORDS = 5;

export interface EvidenceRecord {
  entityType: 'invoice' | 'estimate' | 'job_card' | 'part';
  /** The number staff search for: INV-…, EST-…, the job card id, the part number. */
  label: string;
  customer: string | null;
  vehicle: string | null;
  /** Anything else that identifies it, e.g. a part's description. */
  detail: string | null;
  amount: number | null;
  currency: string | null;
  /** Whole days; what it measures is in `note`. */
  ageDays: number | null;
  /** One short line: "12 days overdue", "Draft, 5 days old", "0 left, reorder at 5". */
  note: string;
}

export interface DecisionAction {
  label: string;
  /** An AppShell module id. */
  module: string;
}

export interface DecisionEvidence {
  key: DecisionKey;
  /** All records that match, not just the ones listed. */
  recordCount: number;
  records: EvidenceRecord[];
  /** Money across ALL matching records, per currency. Empty when the records carry no amount. */
  totals: MoneyTotals;
  /** What to do, in one sentence. */
  nextStep: string;
  /** What it is worth or what it costs, in one sentence. */
  impact: string;
  actions: DecisionAction[];
  asOf: string;
}

// ── Rules shared with MetricsBuilder ─────────────────────────────────────────
// Keep these in step with intelligence/metrics/MetricsBuilder.ts.

/** Job statuses that mean the job is done. */
export const CLOSED_JOB_STATUSES = ['Closed', 'Completed', 'Invoiced'];
/** Estimate statuses still waiting on the customer. */
export const OPEN_ESTIMATE_STATUSES = ['Draft', 'Sent', 'Pending'];
export const STALE_ESTIMATE_DAYS = 3;
export const STUCK_JOB_DAYS = 2;
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/** Midnight (server time) `n` days before `now`, as ISO — MetricsBuilder's daysAgo(). */
export function daysAgoIso(now: Date, n: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ── Small helpers ────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

export function wholeDaysSince(date: string | null | undefined, now: Date): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

/** VINs are 17 characters, no I, O or Q. Removed wherever one appears in a label. */
const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;

export function vehicleLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(VIN_PATTERN, '')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,·|-]+$/, '')
    .trim();
  return cleaned || null;
}

function text(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function money(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function days(n: number | null): string {
  return n == null ? '' : plural(n, 'day');
}

function totalsOf(records: readonly EvidenceRecord[]): MoneyTotals {
  const totals: MoneyTotals = {};
  for (const r of records) {
    if (r.amount != null && r.amount !== 0) addMoney(totals, r.currency, r.amount);
  }
  for (const c of Object.keys(totals)) totals[c] = money(totals[c]);
  return totals;
}

function hasMoney(totals: MoneyTotals): boolean {
  return Object.values(totals).some(v => v !== 0);
}

// ── Row shapes the loader passes in ──────────────────────────────────────────

export interface EstimateRow {
  id?: string;
  estimate_number?: string | null;
  customer_name?: string | null;
  vehicle?: string | null;
  status?: string | null;
  created_at?: string | null;
  approved_date?: string | null;
  lines?: { qty?: number; rate?: number; currency?: string }[] | null;
  discount?: number | null;
  tax_rate?: number | null;
  currency?: string | null;
}

export interface JobCardRow {
  id?: string;
  customer?: string | null;
  vehicle?: string | null;
  status?: string | null;
  check_in_date?: string | null;
  invoice?: string | null;
}

export interface PartRow {
  id?: string;
  part_number?: string | null;
  description?: string | null;
  quantity?: number | null;
  low_stock_threshold?: number | null;
}

// ── Record builders ──────────────────────────────────────────────────────────

export function estimateTotal(row: EstimateRow): { amount: number; currency: string } {
  const currency = (row.currency || DEFAULT_CURRENCY).toUpperCase();
  const lines = (row.lines ?? []).map(l => ({
    qty: Number(l?.qty) || 0,
    rate: Number(l?.rate) || 0,
    currency: l?.currency ? String(l.currency).toUpperCase() : undefined,
  }));
  const { total } = calculateEstimateTotals({
    currency,
    lines,
    discount: Number(row.discount ?? 0) || 0,
    taxRate: Number(row.tax_rate ?? 0) || 0,
  });
  return { amount: money(total), currency };
}

function estimateRecord(row: EstimateRow, ageDays: number | null, note: string): EvidenceRecord {
  const { amount, currency } = estimateTotal(row);
  return {
    entityType: 'estimate',
    label: text(row.estimate_number) ?? 'Estimate',
    customer: text(row.customer_name),
    vehicle: vehicleLabel(row.vehicle),
    detail: null,
    amount: amount > 0 ? amount : null,
    currency: amount > 0 ? currency : null,
    ageDays,
    note,
  };
}

function jobRecord(row: JobCardRow, ageDays: number | null, note: string): EvidenceRecord {
  return {
    entityType: 'job_card',
    label: text(row.id) ?? 'Job card',
    customer: text(row.customer),
    vehicle: vehicleLabel(row.vehicle),
    detail: null,
    amount: null,
    currency: null,
    ageDays,
    note,
  };
}

// ── Selectors: one per recommendation, each mirroring its metric ─────────────

/** unpaid_invoices: receivables with a balance above zero — MetricsBuilder.calculateInvoiceMetrics. */
export function selectUnpaidInvoices(
  invoices: readonly InvoiceFull[],
  payments: readonly DomainPayment[],
  today: string,
): EvidenceRecord[] {
  return receivablesFrom(invoices, payments, today)
    .filter(r => r.balance > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.balance - a.balance)
    .map(r => ({
      entityType: 'invoice' as const,
      label: r.invoiceNumber || 'Invoice',
      customer: text(r.customerName),
      vehicle: vehicleLabel(r.vehicle),
      detail: null,
      amount: r.balance,
      currency: r.currency,
      ageDays: r.daysOverdue,
      note: r.daysOverdue > 0
        ? `${days(r.daysOverdue)} overdue`
        : r.dueDate ? `due ${r.dueDate}` : 'no due date',
    }));
}

export interface UnpaidSummary {
  count: number;
  overdueCount: number;
  /** Balances per currency, never converted. */
  totals: MoneyTotals;
  /** The most overdue invoice, or null when none is overdue. */
  oldestOverdue: EvidenceRecord | null;
  /** The largest balance in each currency, largest first within the list order. */
  largestByCurrency: EvidenceRecord[];
}

/** Summary figures for the Evidence Engine's unpaid-invoice panel, from selectUnpaidInvoices() output. */
export function summarizeUnpaid(records: readonly EvidenceRecord[]): UnpaidSummary {
  const overdue = records.filter(r => (r.ageDays ?? 0) > 0);
  const largest = new Map<string, EvidenceRecord>();
  for (const r of records) {
    const c = r.currency ?? DEFAULT_CURRENCY;
    const best = largest.get(c);
    if (!best || (r.amount ?? 0) > (best.amount ?? 0)) largest.set(c, r);
  }
  return {
    count: records.length,
    overdueCount: overdue.length,
    totals: totalsOf(records),
    oldestOverdue: overdue.reduce<EvidenceRecord | null>(
      (a, r) => (!a || (r.ageDays ?? 0) > (a.ageDays ?? 0) ? r : a), null),
    largestByCurrency: [...largest.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, r]) => r),
  };
}

/** stale_estimates: open estimates created before the stale cutoff — oldest first. */
export function selectStaleEstimates(rows: readonly EstimateRow[], now: Date): EvidenceRecord[] {
  const cutoff = daysAgoIso(now, STALE_ESTIMATE_DAYS);
  return rows
    .filter(r => OPEN_ESTIMATE_STATUSES.includes(r.status ?? '') && !!r.created_at && r.created_at < cutoff)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .map(r => {
      const age = wholeDaysSince(r.created_at, now);
      return estimateRecord(r, age, `${r.status}, ${days(age)} without an answer`);
    });
}

/** approved_estimate_not_scheduled: every Approved estimate — longest waiting first. */
export function selectApprovedEstimates(rows: readonly EstimateRow[], now: Date): EvidenceRecord[] {
  const since = (r: EstimateRow) => r.approved_date || r.created_at || '';
  return rows
    .filter(r => r.status === 'Approved')
    .sort((a, b) => since(a).localeCompare(since(b)))
    .map(r => {
      const age = wholeDaysSince(since(r), now);
      return estimateRecord(r, age, `approved ${days(age)} ago`);
    });
}

/** declined_estimate_winback: every Declined estimate — most recent first, while it is fresh. */
export function selectDeclinedEstimates(rows: readonly EstimateRow[], now: Date): EvidenceRecord[] {
  return rows
    .filter(r => r.status === 'Declined')
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .map(r => {
      const age = wholeDaysSince(r.created_at, now);
      return estimateRecord(r, age, `declined, quoted ${days(age)} ago`);
    });
}

/** completed_job_not_invoiced: closed jobs with no invoice attached — oldest first. */
export function selectCompletedNotInvoiced(rows: readonly JobCardRow[], now: Date): EvidenceRecord[] {
  return rows
    .filter(r => CLOSED_JOB_STATUSES.includes(r.status ?? '') && !r.invoice)
    .sort((a, b) => (a.check_in_date ?? '').localeCompare(b.check_in_date ?? ''))
    .map(r => {
      const age = wholeDaysSince(r.check_in_date, now);
      return jobRecord(r, age, `${r.status}, checked in ${days(age)} ago, no invoice`);
    });
}

/** stuck_repair_order: active jobs checked in before the stuck cutoff — oldest first. */
export function selectStuckJobs(rows: readonly JobCardRow[], now: Date): EvidenceRecord[] {
  const cutoff = daysAgoIso(now, STUCK_JOB_DAYS);
  return rows
    .filter(r => !CLOSED_JOB_STATUSES.includes(r.status ?? '') && !!r.check_in_date && r.check_in_date < cutoff)
    .sort((a, b) => (a.check_in_date ?? '').localeCompare(b.check_in_date ?? ''))
    .map(r => {
      const age = wholeDaysSince(r.check_in_date, now);
      return jobRecord(r, age, `${r.status || 'Open'}, ${days(age)} in the shop`);
    });
}

/** low_inventory: quantity at or below the part's threshold (5 when unset) — emptiest first. */
export function selectLowInventory(rows: readonly PartRow[]): EvidenceRecord[] {
  const threshold = (r: PartRow) => Number(r.low_stock_threshold) || DEFAULT_LOW_STOCK_THRESHOLD;
  return rows
    .filter(r => (Number(r.quantity) || 0) <= threshold(r))
    .sort((a, b) => (Number(a.quantity) || 0) - (Number(b.quantity) || 0)
      || (a.part_number ?? '').localeCompare(b.part_number ?? ''))
    .map(r => {
      const qty = Number(r.quantity) || 0;
      return {
        entityType: 'part' as const,
        label: text(r.part_number) ?? text(r.description) ?? 'Part',
        customer: null,
        vehicle: null,
        detail: text(r.part_number) ? text(r.description) : null,
        amount: null,
        currency: null,
        ageDays: null,
        note: `${qty} left, reorder at ${threshold(r)}`,
      };
    });
}

// ── Decision wording ─────────────────────────────────────────────────────────

const ACTIONS: Record<DecisionKey, DecisionAction[]> = {
  unpaid_invoices:                 [{ label: 'Open Money Owed', module: 'receivables' }, { label: 'Open Invoices', module: 'invoices' }],
  stale_estimates:                 [{ label: 'Open Estimates', module: 'estimates' }],
  approved_estimate_not_scheduled: [{ label: 'Open Estimates', module: 'estimates' }, { label: 'Open Job Cards', module: 'job-cards' }],
  completed_job_not_invoiced:      [{ label: 'Open Job Cards', module: 'job-cards' }, { label: 'Open Invoices', module: 'invoices' }],
  stuck_repair_order:              [{ label: 'Open Job Cards', module: 'job-cards' }, { label: 'Open Repair Orders', module: 'repair-orders' }],
  declined_estimate_winback:       [{ label: 'Open Estimates', module: 'estimates' }],
  low_inventory:                   [{ label: 'Open Parts', module: 'parts' }, { label: 'Open Parts Orders', module: 'parts-orders' }],
};

function firstNames(records: readonly EvidenceRecord[], n = 2): string {
  const names = records.slice(0, n).map(r => r.customer ? `${r.label} (${r.customer})` : r.label);
  return names.join(' and ');
}

function wording(key: DecisionKey, records: readonly EvidenceRecord[], totals: MoneyTotals): { nextStep: string; impact: string } {
  const n = records.length;
  const sum = hasMoney(totals) ? formatMoneyTotals(totals) : '';
  const top = firstNames(records);

  switch (key) {
    case 'unpaid_invoices': {
      const overdue = records.filter(r => (r.ageDays ?? 0) > 0).length;
      return {
        nextStep: overdue > 0
          ? `Call about the ${plural(overdue, 'overdue invoice')} first, starting with ${top}.`
          : `Send a payment reminder for ${top}.`,
        impact: sum
          ? `Collecting all ${plural(n, 'invoice')} brings in ${sum}.`
          : `${plural(n, 'invoice')} still open.`,
      };
    }
    case 'stale_estimates':
      return {
        nextStep: `Call the customers on the oldest estimates, starting with ${top}.`,
        impact: sum
          ? `${sum} of quoted work is waiting on ${plural(n, 'customer')}.`
          : `${plural(n, 'customer')} ${n === 1 ? 'has' : 'have'} not answered an estimate.`,
      };
    case 'approved_estimate_not_scheduled':
      return {
        nextStep: `Book a job card for ${top}.`,
        impact: sum
          ? `${sum} of approved work is not booked yet.`
          : `${plural(n, 'approved estimate')} not booked yet.`,
      };
    case 'completed_job_not_invoiced':
      return {
        nextStep: `Create the invoice for ${top}.`,
        impact: `${plural(n, 'finished job')} not billed yet; the money cannot come in until each is invoiced.`,
      };
    case 'stuck_repair_order':
      return {
        nextStep: `Check what is holding up ${top}.`,
        impact: `${plural(n, 'job')} ${n === 1 ? 'is' : 'are'} holding a bay and a technician past ${STUCK_JOB_DAYS} days.`,
      };
    case 'declined_estimate_winback':
      return {
        nextStep: `Offer a smaller or staged repair on ${top}.`,
        impact: sum
          ? `${sum} of declined work could still be won back.`
          : `${plural(n, 'declined estimate')} could still be won back.`,
      };
    case 'low_inventory':
      return {
        nextStep: `Reorder ${top} first.`,
        impact: `${plural(n, 'part')} at or below the reorder level; jobs that need them will wait.`,
      };
  }
}

/** Assemble the decision from already-selected records. */
export function buildDecision(key: DecisionKey, all: readonly EvidenceRecord[], now: Date): DecisionEvidence {
  const totals = totalsOf(all);
  const { nextStep, impact } = all.length > 0
    ? wording(key, all, totals)
    : { nextStep: 'Nothing matches this any more. Mark it done or refresh the Command Center.', impact: 'No records found.' };
  return {
    key,
    recordCount: all.length,
    records: all.slice(0, MAX_RECORDS),
    totals,
    nextStep,
    impact,
    actions: ACTIONS[key],
    asOf: now.toISOString(),
  };
}
