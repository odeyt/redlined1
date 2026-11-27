// SI-5: Evidence Builders — one per recommendation rule
// Deterministic. No AI. No external calls. Queries Supabase directly for amounts/ages.
// Privacy: never expose customer phone/email/address. VIN is excluded.

import type { RecommendationEvidence, EvidenceType } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function item(
  shopId: string,
  type: EvidenceType,
  title: string,
  opts: { value?: string; numeric?: number; sourceType?: string; sourceId?: string; weight?: number; confidence?: number }
): RecommendationEvidence {
  return {
    shopId,
    evidenceType: type,
    evidenceTitle: title,
    evidenceValue: opts.value ?? null,
    evidenceNumeric: opts.numeric ?? null,
    sourceEntityType: opts.sourceType ?? null,
    sourceEntityId: opts.sourceId ?? null,
    weight: opts.weight ?? 1,
    confidence: opts.confidence ?? 0.8,
    metadata: {},
  };
}

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / 86_400_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Unpaid Invoices
// ─────────────────────────────────────────────────────────────────────────────
// Same rule as the Invoices screen, Money Owed and the unpaid-invoice count
// (receivablesFrom: drafts are not owed; balance = total from lines − payments).
// The previous query selected `total` and `id`, which are not invoice columns
// (the key is `number`; totals come from lines), so it failed and this panel
// was always empty. Money is per currency, never converted or shown as "$".
export async function buildUnpaidInvoicesEvidence(shopId: string, shopIds: string[]): Promise<RecommendationEvidence[]> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const { unpaidInvoices } = await import('./DecisionEvidenceLoader');
    const { summarizeUnpaid } = await import('@/lib/intelligence/decisionEvidence');
    const { formatMoney, formatMoneyTotals } = await import('@/lib/currencies');

    const records = await unpaidInvoices(getAdminDb(), shopIds, new Date());
    if (records.length === 0) return [];
    const s = summarizeUnpaid(records);
    const currencies = Object.keys(s.totals);
    const singleTotal = currencies.length === 1 ? s.totals[currencies[0]] : undefined;

    return [
      item(shopId, 'invoice', 'Unpaid invoice count', { numeric: s.count, sourceType: 'invoice', confidence: 1 }),
      item(shopId, 'invoice', 'Total unpaid amount', { numeric: singleTotal, value: formatMoneyTotals(s.totals), sourceType: 'invoice', confidence: 1 }),
      item(shopId, 'invoice', 'Overdue invoices', { numeric: s.overdueCount, value: `${s.overdueCount} of ${s.count}`, sourceType: 'invoice', confidence: 1 }),
      ...(s.oldestOverdue ? [item(shopId, 'invoice', 'Most overdue invoice', {
        numeric: s.oldestOverdue.ageDays ?? undefined,
        value: `${s.oldestOverdue.label}, ${s.oldestOverdue.ageDays} days overdue`,
        sourceType: 'invoice', sourceId: s.oldestOverdue.label, confidence: 0.9,
      })] : []),
      ...s.largestByCurrency.map(r => item(shopId, 'invoice', 'Largest unpaid balance', {
        numeric: r.amount ?? undefined,
        value: `${r.label}, ${formatMoney(r.amount ?? 0, r.currency ?? undefined)}`,
        sourceType: 'invoice', sourceId: r.label, confidence: 0.9,
      })),
    ];
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Stale Estimates
// ─────────────────────────────────────────────────────────────────────────────
export async function buildStaleEstimatesEvidence(shopId: string, shopIds: string[]): Promise<RecommendationEvidence[]> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const { data } = await db
      .from('estimates')
      .select('id, lines, discount, tax_rate, created_at')
      .in('shop_id', shopIds)
      .eq('status', 'Draft')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true });

    const rows: Row[] = data ?? [];
    if (rows.length === 0) return [];

    const oldest = rows[0];
    const oldestDays = daysSince(oldest?.created_at);

    return [
      item(shopId, 'estimate', 'Stale estimate count', { numeric: rows.length, sourceType: 'estimate', confidence: 1 }),
      ...(oldestDays != null ? [item(shopId, 'estimate', 'Oldest stale estimate', { numeric: oldestDays, value: `${oldestDays} days without response`, sourceType: 'estimate', sourceId: oldest.id, confidence: 0.9 })] : []),
    ];
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Approved Estimate Not Scheduled
// ─────────────────────────────────────────────────────────────────────────────
export async function buildApprovedNotScheduledEvidence(shopId: string, shopIds: string[]): Promise<RecommendationEvidence[]> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const { data } = await db
      .from('estimates')
      .select('id, created_at, approved_date')
      .in('shop_id', shopIds)
      .eq('status', 'Approved')
      .order('approved_date', { ascending: true });

    const rows: Row[] = data ?? [];
    if (rows.length === 0) return [];

    const oldest = rows[0];
    const daysSinceApproval = daysSince(oldest?.approved_date ?? oldest?.created_at);

    return [
      item(shopId, 'estimate', 'Approved estimates awaiting scheduling', { numeric: rows.length, sourceType: 'estimate', confidence: 1 }),
      ...(daysSinceApproval != null ? [item(shopId, 'estimate', 'Days since oldest approval', { numeric: daysSinceApproval, value: `${daysSinceApproval} days`, sourceType: 'estimate', sourceId: oldest.id, confidence: 0.85 })] : []),
    ];
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Completed Job Not Invoiced
// ─────────────────────────────────────────────────────────────────────────────
export async function buildCompletedNotInvoicedEvidence(shopId: string, shopIds: string[]): Promise<RecommendationEvidence[]> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const { data } = await db
      .from('job_cards')
      .select('id, created_at, status, invoice')
      .in('shop_id', shopIds)
      .in('status', ['Completed', 'Closed'])
      .is('invoice', null)
      .order('created_at', { ascending: true });

    const rows: Row[] = data ?? [];
    if (rows.length === 0) return [];

    const oldest = rows[0];
    const oldestDays = daysSince(oldest?.created_at);

    return [
      item(shopId, 'job_card', 'Completed jobs without invoice', { numeric: rows.length, sourceType: 'job_card', confidence: 1 }),
      ...(oldestDays != null ? [item(shopId, 'job_card', 'Oldest uninvoiced job age', { numeric: oldestDays, value: `${oldestDays} days ago`, sourceType: 'job_card', sourceId: oldest.id, confidence: 0.9 })] : []),
    ];
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Low Inventory
// ─────────────────────────────────────────────────────────────────────────────
export async function buildLowInventoryEvidence(shopId: string, shopIds: string[]): Promise<RecommendationEvidence[]> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const { data } = await db
      .from('parts')
      .select('id, description, quantity, low_stock_threshold, cost')
      .in('shop_id', shopIds)
      .lte('quantity', 1)
      .order('quantity', { ascending: true });

    const rows: Row[] = data ?? [];
    if (rows.length === 0) return [];

    const mostCritical = rows.find((r: Row) => r.quantity === 0) ?? rows[0];
    const zeroCount = rows.filter((r: Row) => r.quantity === 0).length;

    return [
      item(shopId, 'inventory', 'Low-stock item count', { numeric: rows.length, sourceType: 'inventory', confidence: 1 }),
      item(shopId, 'inventory', 'Items completely out of stock', { numeric: zeroCount, value: `${zeroCount} at zero`, sourceType: 'inventory', confidence: 1 }),
      item(shopId, 'inventory', 'Most critical item', { value: mostCritical?.description ?? 'Unknown', sourceType: 'inventory', sourceId: mostCritical?.id, confidence: 0.9 }),
    ];
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Stuck Repair Order
// ─────────────────────────────────────────────────────────────────────────────
export async function buildStuckRepairOrderEvidence(shopId: string, shopIds: string[]): Promise<RecommendationEvidence[]> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const cutoff = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const { data } = await db
      .from('job_cards')
      .select('id, created_at, status, technicians')
      .in('shop_id', shopIds)
      .in('status', ['Open', 'In Progress', 'Pending Parts', 'Waiting'])
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true });

    const rows: Row[] = data ?? [];
    if (rows.length === 0) return [];

    const oldest = rows[0];
    const oldestDays = daysSince(oldest?.created_at);

    return [
      item(shopId, 'job_card', 'Stuck repair orders', { numeric: rows.length, sourceType: 'job_card', confidence: 1 }),
      ...(oldestDays != null ? [item(shopId, 'job_card', 'Oldest stuck job age', { numeric: oldestDays, value: `${oldestDays} days open`, sourceType: 'job_card', sourceId: oldest.id, confidence: 0.9 })] : []),
      item(shopId, 'signal', 'Current status breakdown', { value: `${rows.filter((r:Row) => r.status === 'In Progress').length} In Progress, ${rows.filter((r:Row) => r.status === 'Pending Parts').length} Pending Parts`, confidence: 0.8 }),
    ];
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Declined Estimate Win-back
// ─────────────────────────────────────────────────────────────────────────────
export async function buildDeclinedEstimateEvidence(shopId: string, shopIds: string[]): Promise<RecommendationEvidence[]> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const { data } = await db
      .from('estimates')
      .select('id, created_at, discount, tax_rate')
      .in('shop_id', shopIds)
      .eq('status', 'Declined')
      .order('created_at', { ascending: false })
      .limit(20);

    const rows: Row[] = data ?? [];
    if (rows.length === 0) return [];

    const mostRecent = rows[0];
    const daysSinceDecline = daysSince(mostRecent?.created_at);

    return [
      item(shopId, 'estimate', 'Declined estimates', { numeric: rows.length, sourceType: 'estimate', confidence: 0.9 }),
      ...(daysSinceDecline != null ? [item(shopId, 'estimate', 'Most recently declined', { numeric: daysSinceDecline, value: `${daysSinceDecline} days ago`, sourceType: 'estimate', sourceId: mostRecent.id, confidence: 0.8 })] : []),
    ];
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Inactive Customer
// ─────────────────────────────────────────────────────────────────────────────
export async function buildInactiveCustomerEvidence(shopId: string, shopIds: string[]): Promise<RecommendationEvidence[]> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const cutoff = new Date(Date.now() - 180 * 86_400_000).toISOString();
    const { data } = await db
      .from('customers')
      .select('id, created_at')
      .in('shop_id', shopIds)
      .lt('updated_at', cutoff);

    const rows: Row[] = data ?? [];
    if (rows.length === 0) return [];

    return [
      item(shopId, 'customer', 'Inactive customers (180+ days)', { numeric: rows.length, sourceType: 'customer', confidence: 0.7 }),
      item(shopId, 'signal', 'Maintenance opportunity window', { value: '6-month service interval typical', confidence: 0.6 }),
    ];
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Repair Intelligence Missing
// ─────────────────────────────────────────────────────────────────────────────
export async function buildRepairIntelligenceMissingEvidence(shopId: string, shopIds: string[]): Promise<RecommendationEvidence[]> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const today = new Date().toISOString().split('T')[0];
    const [{ count: completedCount }, { count: caseCount }] = await Promise.all([
      db.from('job_cards').select('id', { count: 'exact', head: true }).in('shop_id', shopIds).in('status', ['Completed', 'Closed']).gte('updated_at', today),
      db.from('repair_cases').select('id', { count: 'exact', head: true }).in('shop_id', shopIds).gte('created_at', today),
    ]);

    const completed = completedCount ?? 0;
    const cases = caseCount ?? 0;
    const missing = Math.max(0, completed - cases);

    if (missing === 0) return [];

    return [
      item(shopId, 'job_card', 'Completed jobs today', { numeric: completed, sourceType: 'job_card', confidence: 1 }),
      item(shopId, 'repair_case', 'Repair cases created today', { numeric: cases, sourceType: 'repair_case', confidence: 1 }),
      item(shopId, 'signal', 'Missing repair intelligence records', { numeric: missing, value: `${missing} jobs without a case`, confidence: 0.9 }),
    ];
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Revenue Dip
// ─────────────────────────────────────────────────────────────────────────────
export async function buildRevenueDipEvidence(
  shopId: string,
  shopIds: string[],
  signals: Record<string, number | string | null>,
): Promise<RecommendationEvidence[]> {
  const today = Number(signals.revenue_today ?? 0);
  const yesterday = Number(signals.revenue_yesterday ?? 0);
  if (yesterday === 0) return [];

  const dipPct = Math.round(((yesterday - today) / yesterday) * 100);

  return [
    item(shopId, 'metric', 'Revenue today', { numeric: today, value: `$${today.toFixed(0)}`, confidence: 0.9 }),
    item(shopId, 'metric', 'Revenue yesterday', { numeric: yesterday, value: `$${yesterday.toFixed(0)}`, confidence: 0.9 }),
    item(shopId, 'metric', 'Revenue drop', { numeric: dipPct, value: `${dipPct}% below yesterday`, confidence: 0.9 }),
    item(shopId, 'signal', 'Open revenue opportunities', { value: 'Check unpaid invoices and job card pipeline', confidence: 0.7 }),
  ];
}
