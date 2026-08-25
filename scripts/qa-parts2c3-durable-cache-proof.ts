/**
 * Does the reference cache actually survive a cold start?
 *
 * That is the whole claim of M-PARTS2C.3, and a fresh Node process is the
 * honest way to test it: its in-process Map is empty by construction, exactly
 * like a lambda after a deployment. Nothing is stubbed.
 *
 * Before this milestone, resolving one vehicle from cold cost three provider
 * calls — manufacturers, models, vehicle_variants — every single time. During
 * M-PARTS2C.2 validation a mid-run redeploy consumed the entire remaining
 * budget for exactly this reason.
 *
 * PASS is zero external calls, with the lookups recorded as `persistent_hit`.
 * FAIL costs real calls, which is the risk this test is worth taking once.
 *
 *   npx tsx --conditions=react-server scripts/qa-parts2c3-durable-cache-proof.ts
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
  const { referenceCacheSize } = await import('../lib/parts/vehicleResolution/referenceCache');
  const { resolveProviderVehicle } = await import('../lib/parts/vehicleResolution/resolver');

  console.log('\nM-PARTS2C.3 — DURABLE REFERENCE CACHE, COLD START');
  console.log('='.repeat(64));
  console.log(`in-process cache entries at start: ${referenceCacheSize()}  (a fresh process)`);

  // The vehicle whose resolution cost three calls throughout M-PARTS2C.2.
  const { data: v } = await admin
    .from('vehicles')
    .select('id, shop_id, vin, year, make, model, trim, engine, transmission, fuel_type')
    .eq('year', 2009).ilike('model', '%s-class%')
    .limit(1).maybeSingle();

  if (!v) { console.error('No 2009 S-Class available. Nothing run, no calls spent.'); process.exit(1); }

  const { count: cachedRows } = await admin
    .from('parts_provider_reference_cache').select('*', { count: 'exact', head: true });
  console.log(`durable cache rows available      : ${cachedRows ?? 0}`);
  console.log(`vehicle                           : ${v.year} ${v.make} ${v.model} (${v.engine ?? 'no engine'})`);

  const before = await externalCount();
  console.log(`external calls recorded so far    : ${before}`);

  console.log('\nresolving…');
  const outcome = await resolveProviderVehicle({
    id: String(v.id),
    vin: (v.vin as string) || undefined,
    year: Number(v.year) || undefined,
    make: (v.make as string) || undefined,
    model: (v.model as string) || undefined,
    trim: (v.trim as string) || undefined,
    engine: (v.engine as string) || undefined,
    transmission: (v.transmission as string) || undefined,
    fuelType: (v.fuel_type as string) || undefined,
  }, { shopId: String(v.shop_id), bypassMapping: true });

  // recordUsage is fire-and-forget; give it a moment to land.
  await new Promise(r => setTimeout(r, 1500));

  const after = await externalCount();
  const spent = after - before;

  console.log(`\nresolution status : ${outcome.resolution.resolutionStatus}`);
  console.log(`reason            : ${outcome.reasonCode}`);
  console.log(`model candidates  : ${outcome.modelCandidates?.length ?? 0}`);
  console.log(`resolver reported : ${outcome.externalCalls} upstream step(s)`);

  const { data: recent } = await admin.from(TABLE)
    .select('endpoint_category, outcome')
    .order('created_at', { ascending: false }).limit(6);
  console.log('\nmost recent usage rows:');
  for (const r of (recent ?? []).reverse() as Array<Record<string, unknown>>) {
    console.log(`   ${String(r.endpoint_category).padEnd(18)} ${r.outcome}`);
  }

  console.log('\n' + '-'.repeat(64));
  console.log(`EXTERNAL CALLS SPENT BY THIS RESOLUTION: ${spent}`);
  console.log('-'.repeat(64));
  if (spent === 0) {
    console.log('PASS — a cold start resolved this vehicle without touching the provider.');
    console.log('       Before M-PARTS2C.3 the same operation cost 2-3 calls.');
  } else {
    console.log(`FAIL — the durable cache did not serve these lookups. ${spent} call(s) spent.`);
    process.exitCode = 1;
  }
}

async function externalCount(): Promise<number> {
  const { count } = await admin.from(TABLE)
    .select('*', { count: 'exact', head: true }).eq('outcome', 'external');
  return count ?? 0;
}

main().catch(e => { console.error('proof failed:', e instanceof Error ? e.message : e); process.exit(1); });
