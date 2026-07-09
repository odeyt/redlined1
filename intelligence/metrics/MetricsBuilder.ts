// SI-4: MetricsBuilder — computes shop intelligence metrics from live DB data.
// Queries use the EXACT table/column names from the production schema.
// No AI. No external calls. Fails gracefully. Never throws to caller.
import type {
  ShopIntelligenceMetrics,
  MetricCalculationContext,
  MetricCalculationResult,
} from './types';

// Use getAdminDb (service role key) — bypasses RLS so shop_id filter is the only guard.
// If SUPABASE_SERVICE_ROLE_KEY is missing, falls back to anon (logged as error).
async function getDb(_jwt?: string) {
  const { getAdminDb } = await import('@/lib/supabaseServer');
  return getAdminDb();
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null) {
    const obj = e as Record<string, unknown>;
    return String(obj.message ?? obj.details ?? JSON.stringify(e));
  }
  return String(e);
}

function buildContext(shopId: string): MetricCalculationContext {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setHours(23, 59, 59, 999);

  return {
    shopId,
    now,
    todayStart: todayStart.toISOString(),
    yesterdayStart: yesterdayStart.toISOString(),
    yesterdayEnd: yesterdayEnd.toISOString(),
    staleThresholdDays: 3,
    stuckThresholdDays: 2,
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Statuses that mean a job is still open/active (not finished)
const ACTIVE_JOB_STATUSES = ['Booked', 'Approved', 'In Progress', 'Waiting', 'Ready', 'Pending'];
// Statuses that mean a job is done
const CLOSED_JOB_STATUSES = ['Closed', 'Completed', 'Invoiced'];

function emptyMetrics(shopId: string): ShopIntelligenceMetrics {
  return {
    shopId,
    metricDate: new Date().toISOString().split('T')[0],
    revenueToday: 0,
    revenueYesterday: 0,
    paymentsToday: 0,
    unpaidInvoiceCount: 0,
    unpaidInvoiceTotal: 0,
    overdueInvoiceCount: 0,
    overdueInvoiceTotal: 0,
    openEstimateCount: 0,
    staleEstimateCount: 0,
    staleEstimateTotal: 0,
    declinedEstimateCount: 0,
    approvedNotScheduledCount: 0,
    completedNotInvoicedCount: 0,
    openJobCount: 0,
    stuckJobCount: 0,
    repairOrdersInProgress: 0,
    completedJobsToday: 0,
    repairCasesToday: 0,
    lowInventoryCount: 0,
    technicianActiveCount: 0,
    technicianIdleCount: 0,
    shopHealthScore: 100,
    revenueOpportunityTotal: 0,
    riskCount: 0,
    recommendationCount: 0,
    metadata: {},
    calculatedAt: new Date().toISOString(),
  };
}

// ── Revenue & Payments ────────────────────────────────────────
// payments table: payment_date (date of payment), amount, status ('Recorded','Verified','Refunded','Void')

export async function calculateRevenueMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
  jwt?: string,
): Promise<Pick<ShopIntelligenceMetrics, 'revenueToday' | 'revenueYesterday' | 'paymentsToday'>> {
  const result = { revenueToday: 0, revenueYesterday: 0, paymentsToday: 0 };

  try {
    const db = await getDb(jwt);
    const todayDateStr = ctx.todayStart.split('T')[0]; // 'YYYY-MM-DD'
    const { data, error } = await db
      .from('payments')
      .select('amount, status')
      .eq('shop_id', ctx.shopId)
      .gte('payment_date', todayDateStr)
      .in('status', ['Recorded', 'Verified']);
    if (error) throw error;
    const rows = (data ?? []) as { amount?: number }[];
    result.revenueToday = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    result.paymentsToday = rows.length;
  } catch (e) { const m = errMsg(e); console.error('[MetricsBuilder] revenue_today:', m); warnings.push('revenue_today: ' + m); }

  try {
    const db = await getDb(jwt);
    const yStart = ctx.yesterdayStart.split('T')[0];
    const yEnd   = ctx.yesterdayEnd.split('T')[0];
    const { data, error } = await db
      .from('payments')
      .select('amount')
      .eq('shop_id', ctx.shopId)
      .gte('payment_date', yStart)
      .lte('payment_date', yEnd)
      .in('status', ['Recorded', 'Verified']);
    if (error) throw error;
    result.revenueYesterday = (data ?? []).reduce(
      (s, r) => s + (Number((r as { amount?: number }).amount) || 0), 0,
    );
  } catch (e) { const m = errMsg(e); console.error('[MetricsBuilder] revenue_yesterday:', m); warnings.push('revenue_yesterday: ' + m); }

  return result;
}

// ── Invoices ──────────────────────────────────────────────────
// invoices table: PK = number (string), status ('Draft','Sent','Paid','Void'), due_date
// No total column — total is computed from lines jsonb

export async function calculateInvoiceMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
  jwt?: string,
): Promise<Pick<ShopIntelligenceMetrics, 'unpaidInvoiceCount' | 'unpaidInvoiceTotal' | 'overdueInvoiceCount' | 'overdueInvoiceTotal'>> {
  const result = { unpaidInvoiceCount: 0, unpaidInvoiceTotal: 0, overdueInvoiceCount: 0, overdueInvoiceTotal: 0 };
  try {
    const db = await getDb(jwt);
    const nowStr = ctx.now.toISOString().split('T')[0];
    const { data, error } = await db
      .from('invoices')
      .select('number, due_date, lines, discount, shop_supplies, tax_rate, currency')
      .eq('shop_id', ctx.shopId)
      .in('status', ['Draft', 'Sent']);
    if (error) throw error;
    const rows = (data ?? []) as {
      number: string;
      due_date?: string;
      lines?: { qty: number; rate: number; currency?: string }[];
      discount?: number;
      shop_supplies?: number;
      tax_rate?: number;
      currency?: string;
    }[];
    result.unpaidInvoiceCount = rows.length;

    let unpaidTotal = 0; let overdueCount = 0; let overdueTotal = 0;
    for (const r of rows) {
      const lines = r.lines ?? [];
      const baseCur = r.currency || 'USD';
      const subtotal = lines
        .filter(l => !l.currency || l.currency === baseCur)
        .reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
      const afterDiscount = Math.max(subtotal - (r.discount ?? 0), 0);
      const taxable = afterDiscount + (r.shop_supplies ?? 0);
      const total = taxable + taxable * (r.tax_rate ?? 0);
      unpaidTotal += total;
      if (r.due_date && r.due_date < nowStr) { overdueCount++; overdueTotal += total; }
    }
    result.unpaidInvoiceTotal = unpaidTotal;
    result.overdueInvoiceCount = overdueCount;
    result.overdueInvoiceTotal = overdueTotal;
  } catch (e) { const m = errMsg(e); console.error('[MetricsBuilder] invoices:', m); warnings.push('invoices: ' + m); }
  return result;
}

// ── Estimates ─────────────────────────────────────────────────
// estimates table: status ('Draft','Sent','Pending','Approved','Declined'), created_at

export async function calculateEstimateMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
  jwt?: string,
): Promise<Pick<ShopIntelligenceMetrics, 'openEstimateCount' | 'staleEstimateCount' | 'staleEstimateTotal' | 'declinedEstimateCount' | 'approvedNotScheduledCount'>> {
  const result = {
    openEstimateCount: 0, staleEstimateCount: 0, staleEstimateTotal: 0,
    declinedEstimateCount: 0, approvedNotScheduledCount: 0,
  };
  try {
    const db = await getDb(jwt);
    const staleThreshold = daysAgo(ctx.staleThresholdDays);
    const { data, error } = await db
      .from('estimates')
      .select('id, status, created_at, lines, discount, shop_supplies, tax_rate, currency')
      .eq('shop_id', ctx.shopId);
    if (error) throw error;
    const rows = (data ?? []) as {
      status: string; created_at: string;
      lines?: { qty: number; rate: number; currency?: string }[];
      discount?: number; shop_supplies?: number; tax_rate?: number; currency?: string;
    }[];

    const openRows = rows.filter(r => ['Draft', 'Sent', 'Pending'].includes(r.status));
    result.openEstimateCount = openRows.length;
    result.declinedEstimateCount = rows.filter(r => r.status === 'Declined').length;
    result.approvedNotScheduledCount = rows.filter(r => r.status === 'Approved').length;
    const staleRows = openRows.filter(r => r.created_at < staleThreshold);
    result.staleEstimateCount = staleRows.length;
    result.staleEstimateTotal = staleRows.reduce((sum, r) => {
      const lines = r.lines ?? [];
      const baseCur = r.currency || 'USD';
      const subtotal = lines.filter(l => !l.currency || l.currency === baseCur)
        .reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
      const taxable = Math.max(subtotal - (r.discount ?? 0), 0) + (r.shop_supplies ?? 0);
      return sum + taxable + taxable * (r.tax_rate ?? 0);
    }, 0);
  } catch (e) { const m = errMsg(e); console.error('[MetricsBuilder] estimates:', m); warnings.push('estimates: ' + m); }
  return result;
}

// ── Job Cards ─────────────────────────────────────────────────
// job_cards table: check_in_date, status. Active = not Closed/Completed/Invoiced.

export async function calculateJobMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
  jwt?: string,
): Promise<Pick<ShopIntelligenceMetrics, 'openJobCount' | 'stuckJobCount' | 'completedNotInvoicedCount' | 'completedJobsToday'>> {
  const result = { openJobCount: 0, stuckJobCount: 0, completedNotInvoicedCount: 0, completedJobsToday: 0 };

  try {
    const db = await getDb(jwt);
    const stuckThreshold = daysAgo(ctx.stuckThresholdDays);
    const { data, error } = await db
      .from('job_cards')
      .select('id, status, check_in_date, invoice')
      .eq('shop_id', ctx.shopId);
    if (error) throw error;
    const rows = (data ?? []) as { status?: string; check_in_date?: string; invoice?: string | null }[];

    const active = rows.filter(r => !CLOSED_JOB_STATUSES.includes(r.status ?? ''));
    result.openJobCount = active.length;
    result.stuckJobCount = active.filter(r =>
      r.check_in_date && r.check_in_date < stuckThreshold,
    ).length;
    // Closed but no invoice attached
    const closed = rows.filter(r => CLOSED_JOB_STATUSES.includes(r.status ?? ''));
    result.completedNotInvoicedCount = closed.filter(r => !r.invoice).length;
    // Completed today — closed since today's start
    const todayStr = ctx.todayStart.split('T')[0];
    result.completedJobsToday = closed.filter(r =>
      r.check_in_date && r.check_in_date >= todayStr
    ).length;
  } catch (e) { const m = errMsg(e); console.error('[MetricsBuilder] job_cards:', m); warnings.push('job_cards: ' + m); }

  return result;
}

// ── Repair Orders ─────────────────────────────────────────────
export async function calculateRepairOrderMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
  jwt?: string,
): Promise<Pick<ShopIntelligenceMetrics, 'repairOrdersInProgress'>> {
  const result = { repairOrdersInProgress: 0 };
  try {
    const db = await getDb(jwt);
    const { count, error } = await db
      .from('repair_orders')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', ctx.shopId)
      .in('status', ['In Progress', 'Open', 'Pending', 'Active']);
    if (error) throw error;
    result.repairOrdersInProgress = count ?? 0;
  } catch (e) { const m = errMsg(e); console.error('[MetricsBuilder] repair_orders:', m); warnings.push('repair_orders: ' + m); }
  return result;
}

// ── Repair Intelligence ───────────────────────────────────────
export async function calculateRepairIntelligenceMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
  jwt?: string,
): Promise<Pick<ShopIntelligenceMetrics, 'repairCasesToday'>> {
  const result = { repairCasesToday: 0 };
  try {
    const db = await getDb(jwt);
    const { count, error } = await db
      .from('repair_cases')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', ctx.shopId)
      .gte('created_at', ctx.todayStart);
    if (error) throw error;
    result.repairCasesToday = count ?? 0;
  } catch (e) { const m = errMsg(e); console.error('[MetricsBuilder] repair_cases:', m); warnings.push('repair_cases: ' + m); }
  return result;
}

// ── Inventory ─────────────────────────────────────────────────
// parts table (NOT parts_inventory): quantity, low_stock_threshold
export async function calculateInventoryMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
  jwt?: string,
): Promise<Pick<ShopIntelligenceMetrics, 'lowInventoryCount'>> {
  const result = { lowInventoryCount: 0 };
  try {
    const db = await getDb(jwt);
    const { data, error } = await db
      .from('parts')
      .select('quantity, low_stock_threshold')
      .eq('shop_id', ctx.shopId);
    if (error) throw error;
    const rows = (data ?? []) as { quantity?: number; low_stock_threshold?: number }[];
    result.lowInventoryCount = rows.filter(r =>
      (Number(r.quantity) || 0) <= (Number(r.low_stock_threshold) || 5),
    ).length;
  } catch (e) { const m = errMsg(e); console.error('[MetricsBuilder] parts:', m); warnings.push('parts: ' + m); }
  return result;
}

// ── Technicians ───────────────────────────────────────────────
export async function calculateTechnicianMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
  jwt?: string,
): Promise<Pick<ShopIntelligenceMetrics, 'technicianActiveCount' | 'technicianIdleCount'>> {
  const result = { technicianActiveCount: 0, technicianIdleCount: 0 };
  try {
    const db = await getDb(jwt);
    const { data, error } = await db
      .from('shop_users')
      .select('user_id')
      .eq('shop_id', ctx.shopId)
      .eq('role', 'technician');
    if (error) throw error;
    result.technicianActiveCount = (data ?? []).length;
  } catch (e) { const m = errMsg(e); console.error('[MetricsBuilder] technicians:', m); warnings.push('technicians: ' + m); }
  return result;
}

// ── Shop Health Score ─────────────────────────────────────────

export function calculateShopHealthScore(metrics: Partial<ShopIntelligenceMetrics>): number {
  let score = 100;
  if ((metrics.overdueInvoiceCount ?? 0) > 0)        score -= 10;
  if ((metrics.staleEstimateCount ?? 0) > 0)         score -= 10;
  if ((metrics.stuckJobCount ?? 0) > 0)              score -= 15;
  if ((metrics.completedNotInvoicedCount ?? 0) > 0)  score -= 15;
  if ((metrics.lowInventoryCount ?? 0) > 0)          score -= 10;
  if ((metrics.revenueToday ?? 0) === 0 && (metrics.openJobCount ?? 0) > 0) score -= 10;
  if ((metrics.repairCasesToday ?? 0) === 0 && (metrics.completedJobsToday ?? 0) > 0) score -= 5;
  return Math.max(0, Math.min(100, score));
}

function calculateRevenueOpportunity(metrics: Partial<ShopIntelligenceMetrics>): number {
  return (metrics.unpaidInvoiceTotal ?? 0) + (metrics.staleEstimateTotal ?? 0);
}

// ── Main: calculateShopMetrics ────────────────────────────────

export async function calculateShopMetrics(shopId: string, jwt?: string): Promise<MetricCalculationResult> {
  const start = Date.now();
  const warnings: string[] = [];
  const errors: string[] = [];
  const ctx = buildContext(shopId);
  const base = emptyMetrics(shopId);

  console.warn('[MetricsBuilder] calculating for shopId:', shopId, 'hasJwt:', !!jwt);

  try {
    const [revenue, invoices, estimates, jobs, repairOrders, repairIntelligence, inventory, technicians] =
      await Promise.all([
        calculateRevenueMetrics(ctx, warnings, jwt),
        calculateInvoiceMetrics(ctx, warnings, jwt),
        calculateEstimateMetrics(ctx, warnings, jwt),
        calculateJobMetrics(ctx, warnings, jwt),
        calculateRepairOrderMetrics(ctx, warnings, jwt),
        calculateRepairIntelligenceMetrics(ctx, warnings, jwt),
        calculateInventoryMetrics(ctx, warnings, jwt),
        calculateTechnicianMetrics(ctx, warnings, jwt),
      ]);

    const merged: ShopIntelligenceMetrics = {
      ...base,
      ...revenue,
      ...invoices,
      ...estimates,
      ...jobs,
      ...repairOrders,
      ...repairIntelligence,
      ...inventory,
      ...technicians,
    };

    merged.shopHealthScore        = calculateShopHealthScore(merged);
    merged.revenueOpportunityTotal = calculateRevenueOpportunity(merged);
    merged.riskCount =
      (merged.overdueInvoiceCount > 0 ? 1 : 0) +
      (merged.stuckJobCount > 0 ? 1 : 0) +
      (merged.lowInventoryCount > 0 ? 1 : 0) +
      (merged.completedNotInvoicedCount > 0 ? 1 : 0);
    merged.calculatedAt = new Date().toISOString();
    merged.metadata = { warnings, durationMs: Date.now() - start };

    return { metrics: merged, warnings, errors, durationMs: Date.now() - start };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    return { metrics: base, warnings, errors, durationMs: Date.now() - start };
  }
}

// ── Persist / Load ────────────────────────────────────────────
// These use the admin client directly — shop_intelligence_metrics is internal.

async function getAdminClient() {
  const { getAdminDb } = await import('@/lib/supabaseServer');
  return getAdminDb();
}

export async function saveShopMetrics(metrics: ShopIntelligenceMetrics): Promise<void> {
  try {
    const db = await getAdminClient();
    await db.from('shop_intelligence_metrics').upsert({
      shop_id:                      metrics.shopId,
      metric_date:                  metrics.metricDate,
      revenue_today:                metrics.revenueToday,
      revenue_yesterday:            metrics.revenueYesterday,
      payments_today:               metrics.paymentsToday,
      unpaid_invoice_count:         metrics.unpaidInvoiceCount,
      unpaid_invoice_total:         metrics.unpaidInvoiceTotal,
      overdue_invoice_count:        metrics.overdueInvoiceCount,
      overdue_invoice_total:        metrics.overdueInvoiceTotal,
      open_estimate_count:          metrics.openEstimateCount,
      stale_estimate_count:         metrics.staleEstimateCount,
      stale_estimate_total:         metrics.staleEstimateTotal,
      declined_estimate_count:      metrics.declinedEstimateCount,
      approved_not_scheduled_count: metrics.approvedNotScheduledCount,
      completed_not_invoiced_count: metrics.completedNotInvoicedCount,
      open_job_count:               metrics.openJobCount,
      stuck_job_count:              metrics.stuckJobCount,
      repair_orders_in_progress:    metrics.repairOrdersInProgress,
      completed_jobs_today:         metrics.completedJobsToday,
      repair_cases_today:           metrics.repairCasesToday,
      low_inventory_count:          metrics.lowInventoryCount,
      technician_active_count:      metrics.technicianActiveCount,
      technician_idle_count:        metrics.technicianIdleCount,
      shop_health_score:            metrics.shopHealthScore,
      revenue_opportunity_total:    metrics.revenueOpportunityTotal,
      risk_count:                   metrics.riskCount,
      recommendation_count:         metrics.recommendationCount,
      metadata:                     metrics.metadata,
      calculated_at:                metrics.calculatedAt,
      updated_at:                   new Date().toISOString(),
    }, { onConflict: 'shop_id,metric_date', ignoreDuplicates: false });
  } catch { /* fail silently */ }
}

// Exported mapper for use in decision-engine routes
export function mapMetricsRow(r: Record<string, unknown>): ShopIntelligenceMetrics {
  return {
    id:                        r.id as string,
    shopId:                    r.shop_id as string,
    metricDate:                r.metric_date as string,
    revenueToday:              Number(r.revenue_today ?? 0),
    revenueYesterday:          Number(r.revenue_yesterday ?? 0),
    paymentsToday:             Number(r.payments_today ?? 0),
    unpaidInvoiceCount:        Number(r.unpaid_invoice_count ?? 0),
    unpaidInvoiceTotal:        Number(r.unpaid_invoice_total ?? 0),
    overdueInvoiceCount:       Number(r.overdue_invoice_count ?? 0),
    overdueInvoiceTotal:       Number(r.overdue_invoice_total ?? 0),
    openEstimateCount:         Number(r.open_estimate_count ?? 0),
    staleEstimateCount:        Number(r.stale_estimate_count ?? 0),
    staleEstimateTotal:        Number(r.stale_estimate_total ?? 0),
    declinedEstimateCount:     Number(r.declined_estimate_count ?? 0),
    approvedNotScheduledCount: Number(r.approved_not_scheduled_count ?? 0),
    completedNotInvoicedCount: Number(r.completed_not_invoiced_count ?? 0),
    openJobCount:              Number(r.open_job_count ?? 0),
    stuckJobCount:             Number(r.stuck_job_count ?? 0),
    repairOrdersInProgress:    Number(r.repair_orders_in_progress ?? 0),
    completedJobsToday:        Number(r.completed_jobs_today ?? 0),
    repairCasesToday:          Number(r.repair_cases_today ?? 0),
    lowInventoryCount:         Number(r.low_inventory_count ?? 0),
    technicianActiveCount:     Number(r.technician_active_count ?? 0),
    technicianIdleCount:       Number(r.technician_idle_count ?? 0),
    shopHealthScore:           Number(r.shop_health_score ?? 100),
    revenueOpportunityTotal:   Number(r.revenue_opportunity_total ?? 0),
    riskCount:                 Number(r.risk_count ?? 0),
    recommendationCount:       Number(r.recommendation_count ?? 0),
    metadata:                  (r.metadata as Record<string, unknown>) ?? {},
    calculatedAt:              r.calculated_at as string,
    createdAt:                 r.created_at as string,
    updatedAt:                 r.updated_at as string,
  };
}

export async function getLatestShopMetrics(shopId: string): Promise<ShopIntelligenceMetrics | null> {
  try {
    const db = await getAdminClient();
    const { data } = await db
      .from('shop_intelligence_metrics')
      .select('*')
      .eq('shop_id', shopId)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return mapMetricsRow(data as Record<string, unknown>);
  } catch {
    return null;
  }
}
