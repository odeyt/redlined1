#!/usr/bin/env tsx
// SI-12: Analyze Service Advisor Opportunities — dry-run analysis script
// Usage: tsx scripts/analyze-service-advisor-opportunities.ts [options]

import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPA_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(SUPA_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const args = process.argv.slice(2);
const shopId = getArg('--shop-id');
const estimateId = getArg('--estimate-id');
const allOpenEstimates = args.includes('--all-open-estimates');
const limit = parseInt(getArg('--limit') ?? '20', 10);
const execute = args.includes('--execute');
const dryRun = !execute;

console.log('\n====== SI-12 Service Advisor Opportunity Analysis ======');
console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
console.log(`Time: ${new Date().toISOString()}\n`);

async function main() {
  const shops = shopId
    ? [{ id: shopId, name: 'specified shop' }]
    : (await db.from('shops').select('id, name').order('name')).data ?? [];

  for (const shop of shops) {
    console.log(`\n-- Shop: ${shop.name} (${shop.id}) --`);

    if (estimateId) {
      await analyzeEstimate(shop.id, estimateId);
    } else if (allOpenEstimates) {
      await analyzeOpenEstimates(shop.id, limit);
    } else {
      await analyzeFollowUps(shop.id, limit);
    }
  }

  console.log('\n====== Analysis Complete ======\n');
}

async function analyzeEstimate(sId: string, eId: string) {
  const { data: estimate, error } = await db
    .from('estimates')
    .select('id, status, total_amount, created_at, customer_id, vehicle_id')
    .eq('id', eId)
    .eq('shop_id', sId)
    .maybeSingle();

  if (error || !estimate) {
    console.log(`  Estimate ${eId} not found or error: ${error?.message}`);
    return;
  }

  console.log(`  Estimate: ${eId}`);
  console.log(`  Status: ${estimate.status}`);
  console.log(`  Value: $${Number(estimate.total_amount ?? 0).toFixed(2)}`);
  console.log(`  Age: ${Math.round((Date.now() - new Date(estimate.created_at).getTime()) / 86400000)} days`);

  const { data: lines } = await db.from('estimate_lines').select('id, description, unit_price, line_type').eq('estimate_id', eId).eq('shop_id', sId);
  const issues: string[] = [];
  for (const l of lines ?? []) {
    if (!l.description || String(l.description).trim().length < 3) issues.push(`Line ${l.id}: missing description`);
    if (Number(l.unit_price ?? 0) < 0.01) issues.push(`Line ${l.id}: zero price`);
  }

  if (issues.length > 0) {
    console.log(`  Quality Issues (${issues.length}):`);
    for (const i of issues) console.log(`    - ${i}`);
  } else {
    console.log('  Quality: No obvious issues found');
  }

  if (dryRun) console.log('  [DRY RUN] No changes made.');
}

async function analyzeOpenEstimates(sId: string, lim: number) {
  const { data: estimates } = await db
    .from('estimates')
    .select('id, status, total_amount, created_at')
    .eq('shop_id', sId)
    .in('status', ['draft', 'sent', 'viewed'])
    .is('approved_at', null)
    .order('created_at', { ascending: true })
    .limit(lim);

  console.log(`  Open estimates: ${(estimates ?? []).length}`);
  for (const e of estimates ?? []) {
    const age = Math.round((Date.now() - new Date(e.created_at).getTime()) / 86400000);
    const flagged = age > 14 ? ' ⚠️ STALE' : '';
    console.log(`    ${e.id} | status: ${e.status} | $${Number(e.total_amount ?? 0).toFixed(0)} | ${age}d old${flagged}`);
  }
  if (dryRun) console.log('  [DRY RUN] No changes made.');
}

async function analyzeFollowUps(sId: string, lim: number) {
  const threshold = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: stale } = await db
    .from('estimates')
    .select('id, status, total_amount, created_at')
    .eq('shop_id', sId)
    .in('status', ['draft', 'sent', 'viewed'])
    .lt('created_at', threshold)
    .is('approved_at', null)
    .order('total_amount', { ascending: false })
    .limit(lim);

  console.log(`  Stale estimates (>14d, not approved): ${(stale ?? []).length}`);
  for (const e of stale ?? []) {
    const age = Math.round((Date.now() - new Date(e.created_at).getTime()) / 86400000);
    console.log(`    ${e.id} | $${Number(e.total_amount ?? 0).toFixed(0)} | ${age}d old | status: ${e.status}`);
  }

  const { data: approved } = await db
    .from('estimates')
    .select('id, total_amount, approved_at')
    .eq('shop_id', sId)
    .eq('status', 'approved')
    .order('approved_at', { ascending: true })
    .limit(10);

  console.log(`  Approved not yet scheduled: ${(approved ?? []).length}`);
  for (const e of approved ?? []) {
    console.log(`    ${e.id} | $${Number(e.total_amount ?? 0).toFixed(0)} | approved: ${e.approved_at}`);
  }

  if (dryRun) console.log('\n  [DRY RUN] No changes made. Run with --execute to record sessions.');
}

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
