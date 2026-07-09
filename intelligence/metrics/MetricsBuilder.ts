// SI-4: MetricsBuilder — computes all shop intelligence metrics from live DB data.
// No AI. No external calls. Fails gracefully. Never throws to caller.
import type {
  ShopIntelligenceMetrics,
  MetricCalculationContext,
  MetricCalculationResult,
} from './types';

async function getDb() {
  const { getAdminDb } = await import('@/lib/supabaseServer');
  return getAdminDb();
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

// ── Revenue ───────────────────────────────────────────────────

export async function calculateRevenueMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
): Promise<Pick<ShopIntelligenceMetrics, 'revenueToday' | 'revenueYesterday' | 'paymentsToday'>> {
  const result = { revenueToday: 0, revenueYesterday: 0, paymentsToday: 0 };
  try {
    const db = await getDb();
    const { data: todayPayments } = await db
      .from('payments')
      .select('amount')
      .eq('shop_id', ctx.shopId)
      .gte('created_at', ctx.todayStart);
    result.revenueToday = (todayPayments ?? []).reduce(
      (s, r) => s + (Number((r as { amount?: number }).amount) || 0), 0,
    );
    result.paymentsToday = (todayPayments ?? []).length;
  } catch { warnings.push('revenue_today: query failed'); }

  try {
    const db = await getDb();
    const { data: yPayments } = await db
      .from('payments')
      .select('amount')
      .eq('shop_id', ctx.shopId)
      .gte('created_at', ctx.yesterdayStart)
      .lte('created_at', ctx.yesterdayEnd);
    result.revenueYesterday = (yPayments ?? []).reduce(
      (s, r) => s + (Number((r as { amount?: number }).amount) || 0), 0,
    );
  } catch { warnings.push('revenue_yesterday: query failed'); }

  return result;
}

// ── Invoices ──────────────────────────────────────────────────

export async function calculateInvoiceMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
): Promise<Pick<ShopIntelligenceMetrics, 'unpaidInvoiceCount' | 'unpaidInvoiceTotal' | 'overdueInvoiceCount' | 'overdueInvoiceTotal'>> {
  const result = { unpaidInvoiceCount: 0, unpaidInvoiceTotal: 0, overdueInvoiceCount: 0, overdueInvoiceTotal: 0 };
  try {
    const db = await getDb();
    const { data } = await db
      .from('invoices')
      .select('id, total, due_date')
      .eq('shop_id', ctx.shopId)
      .in('status', ['Draft', 'Sent']);
    const rows = (data ?? []) as { id: string; total?: number; due_date?: string }[];
    result.unpaidInvoiceCount = rows.length;
    result.unpaidInvoiceTotal = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const now = ctx.now.toISOString();
    const overdue = rows.filter(r => r.due_date && r.due_date < now);
    result.overdueInvoiceCount = overdue.length;
    result.overdueInvoiceTotal = overdue.reduce((s, r) => s + (Number(r.total) || 0), 0);
  } catch { warnings.push('invoices: query failed'); }
  return result;
}

// ── Estimates ─────────────────────────────────────────────────

export async function calculateEstimateMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
): Promise<Pick<ShopIntelligenceMetrics, 'openEstimateCount' | 'staleEstimateCount' | 'staleEstimateTotal' | 'declinedEstimateCount' | 'approvedNotScheduledCount'>> {
  const result = {
    openEstimateCount: 0, staleEstimateCount: 0, staleEstimateTotal: 0,
    declinedEstimateCount: 0, approvedNotScheduledCount: 0,
  };
  try {
    const db = await getDb();
    const staleThreshold = daysAgo(ctx.staleThresholdDays);
    const { data } = await db
      .from('estimates')
      .select('id, total, status, created_at')
      .eq('shop_id', ctx.shopId)
      .in('status', ['Draft', 'Sent', 'Pending', 'Approved', 'Declined']);
    const rows = (data ?? []) as { id: string; total?: number; status: string; created_at: string }[];
    const open = rows.filter(r => ['Draft', 'Sent', 'Pending'].includes(r.status));
    result.openEstimateCount = open.length;
    const stale = open.filter(r => r.created_at < staleThreshold);
    result.staleEstimateCount = stale.length;
    result.staleEstimateTotal = stale.reduce((s, r) => s + (Number(r.total) || 0), 0);
    result.declinedEstimateCount = rows.filter(r => r.status === 'Declined').length;
    result.approvedNotScheduledCount = rows.filter(r => r.status === 'Approved').length;
  } catch { warnings.push('estimates: query failed'); }
  return result;
}

// ── Job Cards ─────────────────────────────────────────────────

export async function calculateJobMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
): Promise<Pick<ShopIntelligenceMetrics, 'openJobCount' | 'stuckJobCount' | 'completedNotInvoicedCount' | 'completedJobsToday'>> {
  const result = { openJobCount: 0, stuckJobCount: 0, completedNotInvoicedCount: 0, completedJobsToday: 0 };
  try {
    const db = await getDb();
    const stuckThreshold = daysAgo(ctx.stuckThresholdDays);
    const { data } = await db
      .from('job_cards')
      .select('id, status, check_in_date, created_at')
      .eq('shop_id', ctx.shopId);
    const rows = (data ?? []) as { id: string; status?: string; check_in_date?: string; created_at: string }[];
    const active = rows.filter(r => !['Closed', 'Invoiced', 'Cancelled'].includes(r.status ?? ''));
    result.openJobCount = active.length;
    result.stuckJobCount = active.filter(r =>
      (r.check_in_date ?? r.created_at) < stuckThreshold,
    ).length;
    result.completedJobsToday = rows.filter(r =>
      r.status === 'Closed' && r.created_at >= ctx.todayStart,
    ).length;
  } catch { warnings.push('job_cards: query failed'); }

  try {
    const db = await getDb();
    const { count } = await db
      .from('closed_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', ctx.shopId)
      .is('invoice', null);
    result.completedNotInvoicedCount = count ?? 0;
  } catch {
    // closed_jobs table may not exist — not a blocking error
    warnings.push('closed_jobs: table unavailable or query failed');
  }
  return result;
}

// ── Repair Orders ─────────────────────────────────────────────

export async function calculateRepairOrderMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
): Promise<Pick<ShopIntelligenceMetrics, 'repairOrdersInProgress'>> {
  const result = { repairOrdersInProgress: 0 };
  try {
    const db = await getDb();
    const { count } = await db
      .from('repair_orders')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', ctx.shopId)
      .in('status', ['In Progress', 'Open', 'Pending']);
    result.repairOrdersInProgress = count ?? 0;
  } catch { warnings.push('repair_orders: query failed'); }
  return result;
}

// ── Repair Intelligence ───────────────────────────────────────

export async function calculateRepairIntelligenceMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
): Promise<Pick<ShopIntelligenceMetrics, 'repairCasesToday'>> {
  const result = { repairCasesToday: 0 };
  try {
    const db = await getDb();
    const { count } = await db
      .from('repair_cases')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', ctx.shopId)
      .gte('created_at', ctx.todayStart);
    result.repairCasesToday = count ?? 0;
  } catch { warnings.push('repair_cases: query failed'); }
  return result;
}

// ── Inventory ─────────────────────────────────────────────────

export async function calculateInventoryMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
): Promise<Pick<ShopIntelligenceMetrics, 'lowInventoryCount'>> {
  const result = { lowInventoryCount: 0 };
  try {
    const db = await getDb();
    const { count } = await db
      .from('parts_inventory')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', ctx.shopId)
      .lte('quantity', 1);
    result.lowInventoryCount = count ?? 0;
  } catch { warnings.push('parts_inventory: query failed'); }
  return result;
}

// ── Technicians ───────────────────────────────────────────────

export async function calculateTechnicianMetrics(
  ctx: MetricCalculationContext,
  warnings: string[],
): Promise<Pick<ShopIntelligenceMetrics, 'technicianActiveCount' | 'technicianIdleCount'>> {
  const result = { technicianActiveCount: 0, technicianIdleCount: 0 };
  try {
    const db = await getDb();
    const { data } = await db
      .from('shop_users')
      .select('id, role')
      .eq('shop_id', ctx.shopId)
      .eq('role', 'technician');
    const total = (data ?? []).length;
    // Active = technician with an open job card assigned today (best-effort proxy)
    const { count: activeCount } = await db
      .from('job_cards')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', ctx.shopId)
      .not('status', 'in', '("Closed","Invoiced","Cancelled")')
      .gte('created_at', ctx.todayStart);
    const active = Math.min(activeCount ?? 0, total);
    result.technicianActiveCount = active;
    result.technicianIdleCount = Math.max(0, total - active);
  } catch { warnings.push('technicians: query failed'); }
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

// ── Revenue Opportunity ───────────────────────────────────────

function calculateRevenueOpportunity(metrics: Partial<ShopIntelligenceMetrics>): number {
  return (
    (metrics.unpaidInvoiceTotal ?? 0) +
    (metrics.staleEstimateTotal ?? 0)
    // completed_not_invoiced and approved_not_scheduled don't have dollar amounts without
    // joining to job/estimate totals — included as count signals only
  );
}

// ── Main: calculateShopMetrics ────────────────────────────────

export async function calculateShopMetrics(shopId: string): Promise<MetricCalculationResult> {
  const start = Date.now();
  const warnings: string[] = [];
  const errors: string[] = [];
  const ctx = buildContext(shopId);
  const base = emptyMetrics(shopId);

  try {
    const [revenue, invoices, estimates, jobs, repairOrders, repairIntelligence, inventory, technicians] =
      await Promise.all([
        calculateRevenueMetrics(ctx, warnings),
        calculateInvoiceMetrics(ctx, warnings),
        calculateEstimateMetrics(ctx, warnings),
        calculateJobMetrics(ctx, warnings),
        calculateRepairOrderMetrics(ctx, warnings),
        calculateRepairIntelligenceMetrics(ctx, warnings),
        calculateInventoryMetrics(ctx, warnings),
        calculateTechnicianMetrics(ctx, warnings),
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

    merged.shopHealthScore = calculateShopHealthScore(merged);
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

export async function saveShopMetrics(metrics: ShopIntelligenceMetrics): Promise<void> {
  try {
    const db = await getDb();
    await db.from('shop_intelligence_metrics').upsert({
      shop_id:                     metrics.shopId,
      metric_date:                 metrics.metricDate,
      revenue_today:               metrics.revenueToday,
      revenue_yesterday:           metrics.revenueYesterday,
      payments_today:              metrics.paymentsToday,
      unpaid_invoice_count:        metrics.unpaidInvoiceCount,
      unpaid_invoice_total:        metrics.unpaidInvoiceTotal,
      overdue_invoice_count:       metrics.overdueInvoiceCount,
      overdue_invoice_total:       metrics.overdueInvoiceTotal,
      open_estimate_count:         metrics.openEstimateCount,
      stale_estimate_count:        metrics.staleEstimateCount,
      stale_estimate_total:        metrics.staleEstimateTotal,
      declined_estimate_count:     metrics.declinedEstimateCount,
      approved_not_scheduled_count: metrics.approvedNotScheduledCount,
      completed_not_invoiced_count: metrics.completedNotInvoicedCount,
      open_job_count:              metrics.openJobCount,
      stuck_job_count:             metrics.stuckJobCount,
      repair_orders_in_progress:   metrics.repairOrdersInProgress,
      completed_jobs_today:        metrics.completedJobsToday,
      repair_cases_today:          metrics.repairCasesToday,
      low_inventory_count:         metrics.lowInventoryCount,
      technician_active_count:     metrics.technicianActiveCount,
      technician_idle_count:       metrics.technicianIdleCount,
      shop_health_score:           metrics.shopHealthScore,
      revenue_opportunity_total:   metrics.revenueOpportunityTotal,
      risk_count:                  metrics.riskCount,
      recommendation_count:        metrics.recommendationCount,
      metadata:                    metrics.metadata,
      calculated_at:               metrics.calculatedAt,
      updated_at:                  new Date().toISOString(),
    }, { onConflict: 'shop_id,metric_date', ignoreDuplicates: false });
  } catch { /* fail silently — never block caller */ }
}

export async function getLatestShopMetrics(shopId: string): Promise<ShopIntelligenceMetrics | null> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('shop_intelligence_metrics')
      .select('*')
      .eq('shop_id', shopId)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const r = data as Record<string, unknown>;
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
  } catch {
    return null;
  }
}
