/**
 * Read-only telemetry baseline for the M-PARTS2C live smoke.
 *
 * Prints the current count of `vehicle_parts_search` usage rows so the same
 * count can be read again after the live search. Step 13 of the smoke needs
 * N and N+1; this establishes N.
 *
 * Spends ZERO AutoPartsAPI calls and writes NOTHING. It is a SELECT.
 *
 *   npx tsx --conditions=react-server scripts/qa-parts2c-telemetry-baseline.ts
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!/ldjrlvjkmzrcdqhetqoh/.test(url)) {
  console.error('Refusing to run: expected the Redlined1 project.');
  process.exit(2);
}
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const TABLE = 'parts_provider_usage_events';

async function main() {
  console.log('\nM-PARTS2C TELEMETRY BASELINE');
  console.log('='.repeat(64));

  // The category the 2C migration added. Before the migration this value
  // could not be inserted at all, so a non-zero count here would itself be
  // news.
  const { count: vfCount, error: vfErr } = await admin
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('endpoint_category', 'vehicle_parts_search');

  if (vfErr) {
    console.error('  FAIL   could not read usage rows ->', vfErr.message);
    process.exit(1);
  }

  // Positive control: the table is readable and does hold OTHER categories.
  // Without this, "0" is indistinguishable from a query that silently
  // matched nothing because the column name was wrong.
  const { count: allCount } = await admin
    .from(TABLE)
    .select('*', { count: 'exact', head: true });

  const { data: cats } = await admin
    .from(TABLE)
    .select('endpoint_category')
    .limit(1000);
  const distinct = [...new Set((cats ?? []).map(r => r.endpoint_category))].sort();

  console.log(`\n  vehicle_parts_search rows : ${vfCount ?? 0}`);
  console.log(`  all usage rows            : ${allCount ?? 0}`);
  console.log(`  categories present        : ${distinct.join(', ') || '(none)'}`);

  console.log('\n  ' + '-'.repeat(60));
  console.log(`  BASELINE N = ${vfCount ?? 0}`);
  console.log('  ' + '-'.repeat(60));
  console.log('\n  After one uncached vehicle-first search, expect N + 1.');
  console.log('  Nothing was written by this script.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
