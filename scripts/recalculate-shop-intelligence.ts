/**
 * SI-4: Manual intelligence recalculation script.
 *
 * Usage:
 *   npm run intelligence:recalculate -- --shop-id=<uuid>
 *   npm run intelligence:recalculate -- --all-shops
 *   npm run intelligence:recalculate -- --shop-id=<uuid> --dry-run
 *   npm run intelligence:recalculate -- --all-shops --date=2025-01-15
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SVC) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SVC);

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (key: string) => {
    const match = args.find(a => a.startsWith(`--${key}=`));
    return match ? match.split('=')[1] : null;
  };
  return {
    shopId:   get('shop-id'),
    allShops: args.includes('--all-shops'),
    date:     get('date'),
    dryRun:   args.includes('--dry-run'),
  };
}

async function getAllShopIds(): Promise<string[]> {
  const { data, error } = await db.from('shops').select('id');
  if (error) throw new Error(`Failed to fetch shops: ${error.message}`);
  return (data ?? []).map((r: { id: string }) => r.id);
}

async function recalculateShop(shopId: string, dryRun: boolean): Promise<void> {
  console.log(`[${shopId}] Calculating metrics…`);

  // Inline the calculation to avoid Next.js module resolution issues in Node
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setHours(23, 59, 59, 999);

  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - 3);
  const stuckThreshold = new Date();
  stuckThreshold.setDate(stuckThreshold.getDate() - 2);

  let revenueToday = 0, revenueYesterday = 0, paymentsToday = 0;
  let unpaidCount = 0, unpaidTotal = 0, overdueCount = 0, overdueTotal = 0;
  let openEst = 0, staleEst = 0, staleEstTotal = 0, declinedEst = 0, approvedNotSched = 0;
  let openJobs = 0, stuckJobs = 0, completedNotInvoiced = 0, completedToday = 0;
  let repairCasesToday = 0, lowInv = 0;
  const warnings: string[] = [];

  try {
    const { data } = await db.from('payments').select('amount').eq('shop_id', shopId).gte('created_at', todayStart.toISOString());
    revenueToday = (data ?? []).reduce((s: number, r: { amount?: number }) => s + (Number(r.amount) || 0), 0);
    paymentsToday = (data ?? []).length;
  } catch { warnings.push('payments_today failed'); }

  try {
    const { data } = await db.from('payments').select('amount').eq('shop_id', shopId).gte('created_at', yesterdayStart.toISOString()).lte('created_at', yesterdayEnd.toISOString());
    revenueYesterday = (data ?? []).reduce((s: number, r: { amount?: number }) => s + (Number(r.amount) || 0), 0);
  } catch { warnings.push('revenue_yesterday failed'); }

  try {
    const { data } = await db.from('invoices').select('id, total, due_date, status').eq('shop_id', shopId).in('status', ['Draft', 'Sent']);
    const rows = (data ?? []) as { total?: number; due_date?: string }[];
    unpaidCount = rows.length;
    unpaidTotal = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const overdue = rows.filter(r => r.due_date && r.due_date < new Date().toISOString());
    overdueCount = overdue.length;
    overdueTotal = overdue.reduce((s, r) => s + (Number(r.total) || 0), 0);
  } catch { warnings.push('invoices failed'); }

  try {
    const { data } = await db.from('estimates').select('id, total, status, created_at').eq('shop_id', shopId);
    const rows = (data ?? []) as { total?: number; status: string; created_at: string }[];
    const open = rows.filter(r => ['Draft', 'Sent', 'Pending'].includes(r.status));
    openEst = open.length;
    const stale = open.filter(r => r.created_at < staleThreshold.toISOString());
    staleEst = stale.length;
    staleEstTotal = stale.reduce((s, r) => s + (Number(r.total) || 0), 0);
    declinedEst = rows.filter(r => r.status === 'Declined').length;
    approvedNotSched = rows.filter(r => r.status === 'Approved').length;
  } catch { warnings.push('estimates failed'); }

  try {
    const { data } = await db.from('job_cards').select('id, status, check_in_date, created_at').eq('shop_id', shopId);
    const rows = (data ?? []) as { status?: string; check_in_date?: string; created_at: string }[];
    const active = rows.filter(r => !['Closed', 'Invoiced', 'Cancelled'].includes(r.status ?? ''));
    openJobs = active.length;
    stuckJobs = active.filter(r => (r.check_in_date ?? r.created_at) < stuckThreshold.toISOString()).length;
    completedToday = rows.filter(r => r.status === 'Closed' && r.created_at >= todayStart.toISOString()).length;
  } catch { warnings.push('job_cards failed'); }

  try {
    const { count } = await db.from('closed_jobs').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).is('invoice', null);
    completedNotInvoiced = count ?? 0;
  } catch { warnings.push('closed_jobs not available'); }

  try {
    const { count } = await db.from('repair_cases').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).gte('created_at', todayStart.toISOString());
    repairCasesToday = count ?? 0;
  } catch { warnings.push('repair_cases failed'); }

  try {
    const { count } = await db.from('parts_inventory').select('id', { count: 'exact', head: true }).eq('shop_id', shopId).lte('quantity', 1);
    lowInv = count ?? 0;
  } catch { warnings.push('parts_inventory failed'); }

  let healthScore = 100;
  if (overdueCount > 0) healthScore -= 10;
  if (staleEst > 0) healthScore -= 10;
  if (stuckJobs > 0) healthScore -= 15;
  if (completedNotInvoiced > 0) healthScore -= 15;
  if (lowInv > 0) healthScore -= 10;
  if (revenueToday === 0 && openJobs > 0) healthScore -= 10;
  if (repairCasesToday === 0 && completedToday > 0) healthScore -= 5;
  healthScore = Math.max(0, Math.min(100, healthScore));

  const revenueOpportunity = unpaidTotal + staleEstTotal;
  const riskCount = (overdueCount > 0 ? 1 : 0) + (stuckJobs > 0 ? 1 : 0) + (lowInv > 0 ? 1 : 0) + (completedNotInvoiced > 0 ? 1 : 0);

  const row = {
    shop_id: shopId,
    metric_date: new Date().toISOString().split('T')[0],
    revenue_today: revenueToday,
    revenue_yesterday: revenueYesterday,
    payments_today: paymentsToday,
    unpaid_invoice_count: unpaidCount,
    unpaid_invoice_total: unpaidTotal,
    overdue_invoice_count: overdueCount,
    overdue_invoice_total: overdueTotal,
    open_estimate_count: openEst,
    stale_estimate_count: staleEst,
    stale_estimate_total: staleEstTotal,
    declined_estimate_count: declinedEst,
    approved_not_scheduled_count: approvedNotSched,
    completed_not_invoiced_count: completedNotInvoiced,
    open_job_count: openJobs,
    stuck_job_count: stuckJobs,
    completed_jobs_today: completedToday,
    repair_cases_today: repairCasesToday,
    low_inventory_count: lowInv,
    shop_health_score: healthScore,
    revenue_opportunity_total: revenueOpportunity,
    risk_count: riskCount,
    metadata: { warnings, script: 'recalculate-shop-intelligence', dryRun },
    calculated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (dryRun) {
    console.log(`[${shopId}] DRY RUN — would write:`, JSON.stringify(row, null, 2));
    if (warnings.length) console.warn(`[${shopId}] Warnings:`, warnings);
    return;
  }

  const { error } = await db.from('shop_intelligence_metrics').upsert(row, {
    onConflict: 'shop_id,metric_date',
  });
  if (error) {
    console.error(`[${shopId}] Failed to save metrics:`, error.message);
  } else {
    console.log(`[${shopId}] ✓ Health score: ${healthScore} | Revenue today: $${revenueToday} | Opportunity: $${revenueOpportunity}`);
    if (warnings.length) console.warn(`[${shopId}] Warnings:`, warnings);
  }
}

async function main() {
  const { shopId, allShops, dryRun } = parseArgs();

  if (!shopId && !allShops) {
    console.error('Provide --shop-id=<uuid> or --all-shops');
    process.exit(1);
  }

  const ids = allShops ? await getAllShopIds() : [shopId!];

  console.log(`Recalculating metrics for ${ids.length} shop(s)${dryRun ? ' [DRY RUN]' : ''}…`);
  for (const id of ids) {
    await recalculateShop(id, dryRun);
  }
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
