/**
 * A read-only picture of vehicle data quality across the fleet.
 *
 * Spends ZERO AutoPartsAPI calls and writes nothing. It reads `vehicles` and
 * `parts_provider_vehicle_mappings`, runs the same analyzer the UI runs, and
 * counts.
 *
 * ## No PII
 *
 * Never prints a customer name, VIN, plate, address or phone number. It
 * reports COUNTS and field names. The one place a value could leak is a
 * conflict example, so conflicts are counted rather than quoted.
 *
 *   npx tsx --conditions=react-server scripts/qa-vehicle-data-quality-audit.ts
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

function pct(n: number, total: number): string {
  return total ? `${Math.round((n / total) * 100)}%`.padStart(4) : '   —';
}

async function main() {
  const { analyzeVehicleQuality } = await import('../lib/vehicles/quality');
  const { vehicleFingerprint } = await import('../lib/parts/vehicleResolution/fingerprint');

  /**
   * The three fitment columns arrive with this milestone's migration, so the
   * audit is written to run either side of it. Reporting "not yet migrated"
   * is more useful than refusing to run, and this script's whole job is to
   * describe the fleet as it currently is.
   */
  const BASE = 'id, shop_id, vin, label, year, make, model, trim, engine, transmission, fuel_type';
  const NEW = 'engine_code, displacement_l, cylinders';

  let rows: unknown[] | null = null;
  let migrated = true;
  {
    const full = await admin.from('vehicles').select(`${BASE}, ${NEW}`);
    if (full.error) {
      migrated = false;
      const base = await admin.from('vehicles').select(BASE);
      if (base.error) { console.error('vehicles unreadable:', base.error.message); process.exit(1); }
      rows = base.data;
    } else {
      rows = full.data;
    }
  }

  const vehicles = (rows ?? []) as Array<Record<string, unknown>>;
  const total = vehicles.length;

  const { data: mapRows } = await admin
    .from('parts_provider_vehicle_mappings')
    .select('vehicle_id, vehicle_fingerprint, resolution_status, provider_vehicle_id');
  const mappings = new Map<string, Record<string, unknown>>();
  for (const m of (mapRows ?? []) as Array<Record<string, unknown>>) {
    mappings.set(String(m.vehicle_id), m);
  }

  let coreComplete = 0;
  let conflicts = 0;
  let labelConflicts = 0;
  const missing: Record<string, number> = {};
  let mappingValid = 0, mappingStale = 0, mappingUnresolved = 0;

  for (const r of vehicles) {
    const v = {
      id: String(r.id),
      vin: (r.vin as string) || undefined,
      year: Number(r.year) || undefined,
      make: (r.make as string) || undefined,
      model: (r.model as string) || undefined,
      trim: (r.trim as string) || undefined,
      engine: (r.engine as string) || undefined,
      transmission: (r.transmission as string) || undefined,
      fuelType: (r.fuel_type as string) || undefined,
      engineCode: (r.engine_code as string) || undefined,
      displacementL: r.displacement_l != null ? Number(r.displacement_l) : undefined,
      cylinders: r.cylinders != null ? Number(r.cylinders) : undefined,
      label: (r.label as string) || undefined,
    };

    const q = analyzeVehicleQuality(v);
    if (q.resolvable) coreComplete += 1;
    if (q.conflicts.length) conflicts += 1;
    if (q.conflicts.some(c => c.kind === 'display_vs_structured')) labelConflicts += 1;
    for (const m of q.missingFields) missing[m.field] = (missing[m.field] ?? 0) + 1;

    const mapping = mappings.get(v.id);
    if (mapping) {
      if (mapping.resolution_status !== 'resolved' || !mapping.provider_vehicle_id) {
        mappingUnresolved += 1;
      } else if (mapping.vehicle_fingerprint === vehicleFingerprint(v)) {
        mappingValid += 1;
      } else {
        mappingStale += 1;
      }
    }
  }

  console.log('\nVEHICLE DATA QUALITY AUDIT');
  console.log('='.repeat(58));
  console.log(`Total vehicles: ${total}`);
  if (!migrated) {
    console.log('\n  NOTE: engine_code / displacement_l / cylinders not yet migrated —');
    console.log('        those three are reported as missing for every vehicle.');
  }
  console.log();
  console.log(`Core identity complete   : ${String(coreComplete).padStart(4)}  ${pct(coreComplete, total)}`);
  console.log(`Core identity incomplete : ${String(total - coreComplete).padStart(4)}  ${pct(total - coreComplete, total)}`);
  console.log();
  console.log('Missing fields:');
  for (const f of ['year', 'make', 'model', 'engine', 'engineCode',
    'displacementL', 'cylinders', 'fuelType', 'transmission', 'trim']) {
    const n = missing[f] ?? 0;
    console.log(`  ${f.padEnd(14)} ${String(n).padStart(4)}  ${pct(n, total)}`);
  }
  console.log();
  console.log('Provider mapping:');
  console.log(`  valid        ${String(mappingValid).padStart(4)}`);
  console.log(`  stale        ${String(mappingStale).padStart(4)}`);
  console.log(`  unresolved   ${String(mappingUnresolved).padStart(4)}`);
  console.log(`  none         ${String(total - mappings.size).padStart(4)}`);
  console.log();
  console.log(`Potential conflicts        : ${conflicts}`);
  console.log(`  of which display vs data : ${labelConflicts}`);
  console.log('\nRead-only. No vehicle was modified and no provider call was made.');
}

main().catch(e => { console.error(e); process.exit(1); });
