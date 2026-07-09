// SignalExtractor — converts shop DB state into named numeric/text signals.
// No AI. All values are deterministic DB queries. Fails silently.
import type { SignalMap } from './types';
import type { ShopIntelligenceMetrics } from '../metrics/types';

/**
 * Build a SignalMap directly from pre-computed ShopIntelligenceMetrics.
 * Preferred path when SI-4 live pipeline is active — avoids re-querying the DB.
 */
export function extractSignalsFromMetrics(metrics: ShopIntelligenceMetrics): SignalMap {
  return {
    revenue_today:               metrics.revenueToday,
    revenue_yesterday:           metrics.revenueYesterday,
    payments_today:              metrics.paymentsToday,
    unpaid_invoice_count:        metrics.unpaidInvoiceCount,
    unpaid_invoice_total:        metrics.unpaidInvoiceTotal,
    overdue_invoice_count:       metrics.overdueInvoiceCount,
    open_estimate_count:         metrics.openEstimateCount,
    stale_estimate_count:        metrics.staleEstimateCount,
    stale_estimate_total:        metrics.staleEstimateTotal,
    declined_estimate_count:     metrics.declinedEstimateCount,
    open_job_count:              metrics.openJobCount,
    stuck_job_count:             metrics.stuckJobCount,
    completed_not_invoiced_count: metrics.completedNotInvoicedCount,
    low_inventory_count:         metrics.lowInventoryCount,
    repair_cases_created_today:  metrics.repairCasesToday,
    shop_health_score:           metrics.shopHealthScore,
    revenue_opportunity_total:   metrics.revenueOpportunityTotal,
  };
}

async function getDb() {
  const { getAdminDb } = await import('@/lib/supabaseServer');
  return getAdminDb();
}

function todayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function yesterdayRange(): [string, string] {
  const start = new Date();
  start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return [start.toISOString(), end.toISOString()];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/**
 * Extract all signals for a shop. Returns a flat key→value map.
 * Any individual query failure is caught; the rest continue.
 */
export async function extractSignals(shopId: string): Promise<SignalMap> {
  const signals: SignalMap = {};
  const db = await getDb();

  // ── Invoices ─────────────────────────────────────────────────
  try {
    const { count } = await db.from('invoices').select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId).in('status', ['Draft', 'Sent']);
    signals.unpaid_invoice_count = count ?? 0;
  } catch { signals.unpaid_invoice_count = null; }

  try {
    const { count } = await db.from('invoices').select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId).in('status', ['Draft', 'Sent']).lt('due_date', new Date().toISOString());
    signals.overdue_invoice_count = count ?? 0;
  } catch { signals.overdue_invoice_count = null; }

  // ── Estimates ────────────────────────────────────────────────
  try {
    const { count } = await db.from('estimates').select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId).in('status', ['Draft', 'Sent', 'Pending']);
    signals.open_estimate_count = count ?? 0;
  } catch { signals.open_estimate_count = null; }

  try {
    const { count } = await db.from('estimates').select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId).in('status', ['Draft', 'Sent', 'Pending']).lt('created_at', daysAgo(3));
    signals.stale_estimate_count = count ?? 0;
  } catch { signals.stale_estimate_count = null; }

  try {
    const { count } = await db.from('estimates').select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId).eq('status', 'Declined');
    signals.declined_estimate_count = count ?? 0;
  } catch { signals.declined_estimate_count = null; }

  // ── Job Cards ─────────────────────────────────────────────────
  try {
    const { count } = await db.from('job_cards').select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId);
    signals.open_job_count = count ?? 0;
  } catch { signals.open_job_count = null; }

  try {
    // Stuck = in same stage for > 2 days
    const { count } = await db.from('job_cards').select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId).lt('check_in_date', daysAgo(2)).not('status', 'in', '("Closed","Invoiced")');
    signals.stuck_job_count = count ?? 0;
  } catch { signals.stuck_job_count = null; }

  // ── Completed jobs without invoice ──────────────────────────
  try {
    const { count } = await db.from('closed_jobs').select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId).is('invoice', null);
    signals.completed_not_invoiced_count = count ?? 0;
  } catch { signals.completed_not_invoiced_count = null; }

  // ── Inventory ────────────────────────────────────────────────
  try {
    const { count } = await db.from('parts_inventory').select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId).filter('quantity', 'lte', db.rpc('parts_inventory_min_qty') as unknown as number);
    signals.low_inventory_count = count ?? 0;
  } catch {
    // Fallback: count items with quantity 0 or 1
    try {
      const db2 = await getDb();
      const { count } = await db2.from('parts_inventory').select('id', { count: 'exact', head: true })
        .eq('shop_id', shopId).lte('quantity', 1);
      signals.low_inventory_count = count ?? 0;
    } catch { signals.low_inventory_count = null; }
  }

  // ── Repair cases ─────────────────────────────────────────────
  try {
    const { count } = await db.from('repair_cases').select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId).gte('created_at', todayStart());
    signals.repair_cases_created_today = count ?? 0;
  } catch { signals.repair_cases_created_today = null; }

  // ── Revenue ──────────────────────────────────────────────────
  try {
    const { data } = await db.from('payments').select('amount')
      .eq('shop_id', shopId).gte('created_at', todayStart());
    const total = (data ?? []).reduce((s, r) => s + (Number((r as { amount?: number }).amount) || 0), 0);
    signals.revenue_today = total;
  } catch { signals.revenue_today = null; }

  try {
    const [yStart, yEnd] = yesterdayRange();
    const { data } = await db.from('payments').select('amount')
      .eq('shop_id', shopId).gte('created_at', yStart).lte('created_at', yEnd);
    const total = (data ?? []).reduce((s, r) => s + (Number((r as { amount?: number }).amount) || 0), 0);
    signals.revenue_yesterday = total;
  } catch { signals.revenue_yesterday = null; }

  try {
    const { count } = await db.from('payments').select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId).gte('created_at', todayStart());
    signals.payments_today = count ?? 0;
  } catch { signals.payments_today = null; }

  return signals;
}

/**
 * Write signals snapshot to intelligence_signals table.
 * Fails silently.
 */
export async function persistSignals(shopId: string, signals: SignalMap): Promise<void> {
  try {
    const db = await getDb();
    const rows = Object.entries(signals)
      .filter(([, v]) => v !== null)
      .map(([key, value]) => ({
        shop_id:    shopId,
        signal_key: key,
        signal_type: typeof value === 'number' ? 'numeric' : 'text',
        value:      typeof value === 'number' ? value : null,
        text_value: typeof value === 'string' ? value : null,
        severity:   'info',
        metadata:   {},
      }));
    if (rows.length > 0) {
      await db.from('intelligence_signals').insert(rows);
    }
  } catch { /* fail silently */ }
}
