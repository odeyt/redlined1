/**
 * Backfill existing repair cases into the Automotive Knowledge Graph.
 *
 * Usage:
 *   npx tsx scripts/backfill-repair-cases-to-graph.ts
 *   npx tsx scripts/backfill-repair-cases-to-graph.ts --dry-run
 *   npx tsx scripts/backfill-repair-cases-to-graph.ts --limit=10
 *   npx tsx scripts/backfill-repair-cases-to-graph.ts --shop_id=<uuid>
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment or .env.local
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'util';

dotenv.config({ path: '.env.local' });
dotenv.config();

// ── Args ──────────────────────────────────────────────────────

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'dry-run': { type: 'boolean', default: false },
    limit: { type: 'string' },
    shop_id: { type: 'string' },
  },
});

const DRY_RUN = args['dry-run'] ?? false;
const LIMIT = args['limit'] ? parseInt(args['limit'] as string, 10) : undefined;
const SHOP_ID_FILTER = args['shop_id'] as string | undefined;

// ── Supabase client (service role bypasses RLS) ───────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

// ── Normalize utilities (pure, no service imports) ────────────

function normalizeText(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim().replace(/\s+/g, '_');
}

function createNormalizedKey(nodeType: string, parts: (string | null | undefined)[]): string {
  return `${nodeType}|${parts.map(p => normalizeText(p)).join('|')}`;
}

// ── Types ─────────────────────────────────────────────────────

interface RepairCaseRow {
  id: string;
  shop_id: string;
  make: string | null;
  model: string | null;
  year: string | null;
  engine: string | null;
  transmission: string | null;
  complaint: string | null;
  technician_notes: string | null;
  final_fix: string | null;
  lesson_learned: string | null;
  confidence_score: number | null;
  verification_status: string;
}

// ── Node upsert ───────────────────────────────────────────────

async function upsertNode(
  shopId: string,
  nodeType: string,
  name: string
): Promise<string | null> {
  const normalizedKey = createNormalizedKey(nodeType, [name]);
  const { data, error } = await supabase
    .from('automotive_graph_nodes')
    .upsert({
      shop_id: shopId,
      node_type: nodeType,
      canonical_name: name.toLowerCase(),
      display_name: name,
      normalized_key: normalizedKey,
      confidence_score: 1.0,
      is_global: false,
      is_anonymized: true,
    }, { onConflict: 'shop_id,node_type,normalized_key' })
    .select('id')
    .single();

  if (error) { console.warn(`  upsertNode(${nodeType}, ${name}) failed: ${error.message}`); return null; }
  return (data as { id: string }).id;
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`\nRepair Case → Knowledge Graph Backfill`);
  console.log(`Dry run: ${DRY_RUN}`);
  if (LIMIT) console.log(`Limit: ${LIMIT}`);
  if (SHOP_ID_FILTER) console.log(`Shop filter: ${SHOP_ID_FILTER}`);
  console.log('');

  // Fetch repair cases
  let query = supabase
    .from('repair_cases')
    .select('id, shop_id, make, model, year, engine, transmission, complaint, technician_notes, final_fix, lesson_learned, confidence_score, verification_status')
    .order('created_at', { ascending: true });

  if (SHOP_ID_FILTER) query = query.eq('shop_id', SHOP_ID_FILTER);
  if (LIMIT) query = query.limit(LIMIT);

  const { data: cases, error: fetchError } = await query;

  if (fetchError) { console.error(`Failed to fetch repair cases: ${fetchError.message}`); process.exit(1); }
  if (!cases || cases.length === 0) { console.log('No repair cases found.'); return; }

  console.log(`Found ${cases.length} repair case(s) to process.\n`);

  let success = 0;
  let failed = 0;

  for (const rc of cases as RepairCaseRow[]) {
    console.log(`Processing ${rc.id} — ${[rc.year, rc.make, rc.model].filter(Boolean).join(' ') || 'Unknown'}`);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would map to graph\n`);
      success++;
      continue;
    }

    try {
      // Fetch child tables
      const [{ data: dtcRows }, { data: symptomRows }, { data: testRows }, { data: partRows }, { data: outcomeRows }] = await Promise.all([
        supabase.from('repair_case_dtcs').select('code').eq('repair_case_id', rc.id).eq('shop_id', rc.shop_id),
        supabase.from('repair_case_symptoms').select('symptom').eq('repair_case_id', rc.id).eq('shop_id', rc.shop_id),
        supabase.from('repair_case_tests').select('test_name').eq('repair_case_id', rc.id).eq('shop_id', rc.shop_id),
        supabase.from('repair_case_parts').select('part_name').eq('repair_case_id', rc.id).eq('shop_id', rc.shop_id),
        supabase.from('repair_case_outcomes').select('comeback, verified_fix').eq('repair_case_id', rc.id).eq('shop_id', rc.shop_id),
      ]);

      const dtcCodes = ((dtcRows ?? []) as { code: string }[]).map(d => d.code);
      const symptoms = ((symptomRows ?? []) as { symptom: string }[]).map(s => s.symptom);
      const testsPerformed = ((testRows ?? []) as { test_name: string }[]).map(t => t.test_name);
      const parts = ((partRows ?? []) as { part_name: string }[]).map(p => p.part_name);
      const outcomes = (outcomeRows ?? []) as { comeback: boolean; verified_fix: boolean }[];

      let nodeCount = 0;

      // Upsert make/model/engine nodes
      if (rc.make) { await upsertNode(rc.shop_id, 'manufacturer', rc.make); nodeCount++; }
      if (rc.model) { await upsertNode(rc.shop_id, 'model', `${rc.make ?? ''} ${rc.model}`.trim()); nodeCount++; }
      if (rc.engine) { await upsertNode(rc.shop_id, 'engine', rc.engine); nodeCount++; }

      // DTCs
      for (const code of dtcCodes) {
        await upsertNode(rc.shop_id, 'dtc', code);
        nodeCount++;
      }

      // Symptoms
      for (const s of symptoms) {
        await upsertNode(rc.shop_id, 'symptom', s);
        nodeCount++;
      }

      // Parts
      for (const p of parts) {
        await upsertNode(rc.shop_id, 'part', p);
        nodeCount++;
      }

      // Final fix
      if (rc.final_fix) {
        await upsertNode(rc.shop_id, 'repair_procedure', rc.final_fix.slice(0, 120));
        nodeCount++;
      }

      // Observations
      const obsRecords = [
        ...dtcCodes.map(code => ({ shop_id: rc.shop_id, repair_case_id: rc.id, observation_type: 'dtc_present', observation_value: code, normalized_value: code.toUpperCase() })),
        ...symptoms.map(s => ({ shop_id: rc.shop_id, repair_case_id: rc.id, observation_type: 'symptom_observed', observation_value: s, normalized_value: s.toLowerCase() })),
        ...testsPerformed.map(t => ({ shop_id: rc.shop_id, repair_case_id: rc.id, observation_type: 'test_performed', observation_value: t, normalized_value: t.toLowerCase() })),
        ...parts.map(p => ({ shop_id: rc.shop_id, repair_case_id: rc.id, observation_type: 'part_replaced', observation_value: p, normalized_value: p.toLowerCase() })),
        ...(outcomes.some(o => o.comeback) ? [{ shop_id: rc.shop_id, repair_case_id: rc.id, observation_type: 'outcome_comeback', observation_value: 'comeback', normalized_value: 'comeback' }] : []),
        ...(outcomes.some(o => o.verified_fix) ? [{ shop_id: rc.shop_id, repair_case_id: rc.id, observation_type: 'outcome_resolved', observation_value: 'resolved', normalized_value: 'resolved' }] : []),
      ];

      if (obsRecords.length > 0) {
        const { error: obsError } = await supabase.from('automotive_graph_observations').insert(obsRecords);
        if (obsError) console.warn(`  observations insert failed: ${obsError.message}`);
      }

      // Lesson
      if (rc.lesson_learned) {
        const { error: lessonError } = await supabase.from('automotive_graph_lessons').insert({
          shop_id: rc.shop_id,
          repair_case_id: rc.id,
          title: `Lesson: ${[rc.year, rc.make, rc.model].filter(Boolean).join(' ')} — ${rc.final_fix?.slice(0, 60) ?? 'Repair'}`,
          problem: rc.complaint,
          final_fix: rc.final_fix,
          recommendation: rc.lesson_learned,
          confidence_score: (rc.confidence_score ?? 50) / 100,
          verified_status: rc.verification_status === 'gold_verified' ? 'senior_verified' : 'pending',
        });
        if (lessonError && !lessonError.message.includes('duplicate')) {
          console.warn(`  lesson insert failed: ${lessonError.message}`);
        }
      }

      console.log(`  ✓ ${nodeCount} nodes, ${obsRecords.length} observations\n`);
      success++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ✗ Failed: ${msg}\n`);
      failed++;
    }
  }

  console.log('─'.repeat(50));
  console.log(`Done. Success: ${success}  Failed: ${failed}  Total: ${cases.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
