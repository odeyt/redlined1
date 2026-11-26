// SI-5: Decision evidence loader.
// Fetches the rows behind one recommendation and hands them to the pure
// selectors in lib/intelligence/decisionEvidence.ts.
// Deterministic. No AI. No external calls. Never throws: a failure returns null
// and the Command Center card falls back to the summary evidence.

import { mergedShopScope } from '@/lib/shops/mergedScope';
import { mapInvoiceRow } from '@/lib/domain/invoiceMath';
import { mapPaymentRow } from '@/lib/domain/payments';
import {
  buildDecision, isDecisionKey, daysAgoIso,
  selectUnpaidInvoices, selectStaleEstimates, selectApprovedEstimates,
  selectDeclinedEstimates, selectCompletedNotInvoiced, selectStuckJobs,
  selectLowInventory, CLOSED_JOB_STATUSES, OPEN_ESTIMATE_STATUSES, STUCK_JOB_DAYS,
  type DecisionEvidence, type DecisionKey, type EvidenceRecord,
  type EstimateRow, type JobCardRow, type PartRow,
} from '@/lib/intelligence/decisionEvidence';

/** Statuses that are never owed. Mirrors SETTLED_STATUSES in lib/domain/receivables. */
const NOT_OWED_INVOICE_STATUSES = ['Paid', 'Cancelled', 'Void', 'Draft'];
/** Keep each `in (...)` list well under PostgREST's URL limits. */
const INVOICE_NUMBER_CHUNK = 150;

const ESTIMATE_COLUMNS =
  'id, estimate_number, customer_name, vehicle, status, created_at, approved_date, lines, discount, tax_rate, currency';
const JOB_COLUMNS = 'id, customer, vehicle, status, check_in_date, invoice';

type Db = ReturnType<typeof import('@/lib/supabaseServer').getAdminDb>;

function inList(values: readonly string[]): string {
  return `(${values.map(v => `"${v}"`).join(',')})`;
}

async function unpaidInvoices(db: Db, scope: string[], now: Date): Promise<EvidenceRecord[]> {
  const { data, error } = await db
    .from('invoices')
    .select('*')
    .in('shop_id', scope)
    .not('status', 'in', inList(NOT_OWED_INVOICE_STATUSES));
  if (error) throw error;
  const invoices = ((data ?? []) as Record<string, unknown>[]).map(mapInvoiceRow);

  const numbers = [...new Set(invoices.map(i => i.invoiceNumber).filter(Boolean))];
  const payments: Record<string, unknown>[] = [];
  for (let i = 0; i < numbers.length; i += INVOICE_NUMBER_CHUNK) {
    const { data: rows, error: payError } = await db
      .from('payments')
      .select('*')
      .in('shop_id', scope)
      .in('invoice_number', numbers.slice(i, i + INVOICE_NUMBER_CHUNK));
    if (payError) throw payError;
    payments.push(...((rows ?? []) as Record<string, unknown>[]));
  }

  return selectUnpaidInvoices(invoices, payments.map(mapPaymentRow), now.toISOString().split('T')[0]);
}

async function estimates(db: Db, scope: string[], statuses: string[]): Promise<EstimateRow[]> {
  const { data, error } = await db
    .from('estimates')
    .select(ESTIMATE_COLUMNS)
    .in('shop_id', scope)
    .in('status', statuses);
  if (error) throw error;
  return (data ?? []) as EstimateRow[];
}

async function closedJobs(db: Db, scope: string[]): Promise<JobCardRow[]> {
  const { data, error } = await db
    .from('job_cards')
    .select(JOB_COLUMNS)
    .in('shop_id', scope)
    .in('status', CLOSED_JOB_STATUSES);
  if (error) throw error;
  return (data ?? []) as JobCardRow[];
}

async function stuckJobs(db: Db, scope: string[], now: Date): Promise<JobCardRow[]> {
  const { data, error } = await db
    .from('job_cards')
    .select(JOB_COLUMNS)
    .in('shop_id', scope)
    .not('status', 'in', inList(CLOSED_JOB_STATUSES))
    .lt('check_in_date', daysAgoIso(now, STUCK_JOB_DAYS));
  if (error) throw error;
  return (data ?? []) as JobCardRow[];
}

async function parts(db: Db, scope: string[]): Promise<PartRow[]> {
  // Quantity is compared with each part's own threshold, which PostgREST
  // cannot do in a filter, so every part in scope is read — as MetricsBuilder does.
  const { data, error } = await db
    .from('parts')
    .select('id, part_number, description, quantity, low_stock_threshold')
    .in('shop_id', scope);
  if (error) throw error;
  return (data ?? []) as PartRow[];
}

async function recordsFor(key: DecisionKey, db: Db, scope: string[], now: Date): Promise<EvidenceRecord[]> {
  switch (key) {
    case 'unpaid_invoices':
      return unpaidInvoices(db, scope, now);
    case 'stale_estimates':
      return selectStaleEstimates(await estimates(db, scope, OPEN_ESTIMATE_STATUSES), now);
    case 'approved_estimate_not_scheduled':
      return selectApprovedEstimates(await estimates(db, scope, ['Approved']), now);
    case 'declined_estimate_winback':
      return selectDeclinedEstimates(await estimates(db, scope, ['Declined']), now);
    case 'completed_job_not_invoiced':
      return selectCompletedNotInvoiced(await closedJobs(db, scope), now);
    case 'stuck_repair_order':
      return selectStuckJobs(await stuckJobs(db, scope, now), now);
    case 'low_inventory':
      return selectLowInventory(await parts(db, scope));
  }
}

/**
 * The records behind `recommendationKey` for `shopId` and any location merged
 * into it. Null when the key has no record-level evidence or the read failed.
 */
export async function loadDecisionEvidence(
  recommendationKey: string,
  shopId: string,
  now: Date = new Date(),
): Promise<DecisionEvidence | null> {
  if (!shopId || !isDecisionKey(recommendationKey)) return null;
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const scope = await mergedShopScope(db, shopId);
    const records = await recordsFor(recommendationKey, db, scope, now);
    return buildDecision(recommendationKey, records, now);
  } catch (e) {
    console.error('[DecisionEvidence]', recommendationKey, e instanceof Error ? e.message : e);
    return null;
  }
}
