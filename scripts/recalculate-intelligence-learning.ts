#!/usr/bin/env tsx
// SI-11: Recalculate Intelligence Learning Profiles
// Usage:
//   npm run intelligence:learning -- --shop-id <uuid>
//   npm run intelligence:learning -- --all-shops
//   npm run intelligence:learning -- --shop-id <uuid> --rule-key <key>
//   npm run intelligence:learning -- --shop-id <uuid> --execute   (default is --dry-run)

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPA_URL || !SUPA_SVC) {
  console.error('[learning] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(SUPA_URL, SUPA_SVC);

// ── Parse args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getFlag = (name: string) => args.includes(name);
const getArg  = (name: string): string | null => {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
};

const shopId   = getArg('--shop-id');
const allShops = getFlag('--all-shops');
const ruleKey  = getArg('--rule-key');
const execute  = getFlag('--execute');
const dryRun   = !execute;

if (!shopId && !allShops) {
  console.error('[learning] Provide --shop-id <uuid> or --all-shops');
  process.exit(1);
}

const MINIMUM_SAMPLE_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getShopIds(): Promise<string[]> {
  if (shopId) return [shopId];
  const { data } = await db.from('shop_users').select('shop_id');
  const ids = [...new Set((data ?? []).map((r: { shop_id: string }) => r.shop_id))];
  return ids as string[];
}

async function getExistingProfile(sid: string, key: string) {
  const { data } = await db
    .from('recommendation_learning_profiles')
    .select('learned_confidence_adjustment, ranking_adjustment, sample_size, last_calculated_at')
    .eq('shop_id', sid)
    .eq('rule_key', key)
    .maybeSingle();
  return data as {
    learned_confidence_adjustment: number;
    ranking_adjustment: number;
    sample_size: number;
    last_calculated_at: string | null;
  } | null;
}

async function getRuleKeys(sid: string): Promise<Array<{ recommendation_key: string; category: string }>> {
  if (ruleKey) {
    const { data } = await db
      .from('recommendations')
      .select('category')
      .eq('shop_id', sid)
      .eq('recommendation_key', ruleKey)
      .limit(1)
      .maybeSingle();
    return [{ recommendation_key: ruleKey, category: (data as { category?: string } | null)?.category ?? 'general' }];
  }
  const { data } = await db.from('recommendations').select('recommendation_key, category').eq('shop_id', sid);
  const map = new Map<string, { recommendation_key: string; category: string }>();
  for (const r of (data ?? []) as Array<{ recommendation_key: string; category: string }>) {
    map.set(r.recommendation_key, r);
  }
  return [...map.values()];
}

async function getFeedbackCount(sid: string, key: string): Promise<number> {
  const { data: recIds } = await db.from('recommendations').select('id').eq('shop_id', sid).eq('recommendation_key', key);
  const ids = (recIds ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return 0;
  const { count } = await db.from('recommendation_feedback').select('*', { count: 'exact', head: true }).eq('shop_id', sid).in('recommendation_id', ids);
  return count ?? 0;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[SI-11] Intelligence Learning Recalculation`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes written)' : 'EXECUTE (writing to database)'}`);
  console.log('─'.repeat(60));

  const shopIds = await getShopIds();
  console.log(`Shops to process: ${shopIds.length}\n`);

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const sid of shopIds) {
    const rules = await getRuleKeys(sid);
    console.log(`Shop ${sid}: ${rules.length} rule(s)`);

    for (const rule of rules) {
      const existing     = await getExistingProfile(sid, rule.recommendation_key);
      const feedbackCount = await getFeedbackCount(sid, rule.recommendation_key);
      const belowMin     = feedbackCount < MINIMUM_SAMPLE_SIZE;

      console.log(`  Rule: ${rule.recommendation_key}`);
      console.log(`    Feedback samples: ${feedbackCount} ${belowMin ? '(below minimum — no adjustment)' : ''}`);
      console.log(`    Current profile:  conf_adj=${existing?.learned_confidence_adjustment ?? 'none'}, rank_adj=${existing?.ranking_adjustment ?? 'none'}, sample_size=${existing?.sample_size ?? 0}`);
      console.log(`    Last calculated:  ${existing?.last_calculated_at ?? 'never'}`);

      if (dryRun) {
        console.log(`    [DRY RUN] Would recalculate. Pass --execute to write.`);
        totalSkipped++;
        continue;
      }

      // Execute mode: import and run the engine
      const { recalculateShopLearningProfiles } = await import('../intelligence/learning/IntelligenceLearningEngine');
      // Note: recalculates all rules for the shop in one pass; we filter output
      const result = await recalculateShopLearningProfiles(sid);
      console.log(`    Updated: ${result.updated} Skipped: ${result.skipped}`);
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      break; // recalculate processes all rules in one shot
    }

    if (!dryRun) break; // already processed all rules via recalculateShopLearningProfiles
    totalSkipped += rules.length;
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`Done. Updated: ${totalUpdated}  Skipped/dry-run: ${totalSkipped}`);
  if (dryRun) {
    console.log('Re-run with --execute to apply changes.');
  }
}

main().catch(err => {
  console.error('[learning] Fatal error:', err);
  process.exit(1);
});
