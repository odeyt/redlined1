/**
 * ONE controlled call to document the real vehicle-parts response shape.
 *
 * Staging returned 186 rows that all rendered with the same title and no
 * brand, part number, image or product group. Either the endpoint returns
 * something other than articles, or it names those fields differently — the
 * M-PARTS2A lesson repeating. Guessing between those is exactly the
 * speculative fixing this milestone forbids, so this asks once and records
 * the answer.
 *
 * Prints STRUCTURE ONLY: status, envelope shape, row count, key names, value
 * types, and a couple of short descriptive samples. No API key (it travels in
 * a header and is never read here), no raw URL, no VIN, no customer data.
 *
 *   npx tsx --conditions=react-server scripts/qa-parts2c-shape-probe.ts
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

/** Never print a value that could be a secret or identify a person. */
function safeSample(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') {
    if (v.length > 48) return `"${v.slice(0, 45)}…"`;
    return `"${v}"`;
  }
  if (Array.isArray(v)) return `[array len=${v.length}]`;
  return `{object keys=${Object.keys(v as object).length}}`;
}

async function main() {
  const { autoPartsApiRequest } = await import('../lib/parts/providers/autopartsapi/client');
  const { oemPartsForVehiclePath, AUTOPARTS_TYPE_ID, AUTOPARTS_ENGLISH_LANG_ID } =
    await import('../lib/parts/providers/autopartsapi/endpoints');

  const { data: map } = await admin
    .from('parts_provider_vehicle_mappings')
    .select('provider_vehicle_id, provider_manufacturer_name, provider_model_name, resolution_status')
    .eq('resolution_status', 'resolved')
    .not('provider_vehicle_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (!map?.provider_vehicle_id) {
    console.error('No resolved mapping available. Nothing probed, no call spent.');
    process.exit(1);
  }

  console.log('\nM-PARTS2C RESPONSE SHAPE PROBE  (exactly one external call)');
  console.log('='.repeat(66));
  console.log(`vehicle : ${map.provider_manufacturer_name} ${map.provider_model_name} (provider id ${map.provider_vehicle_id})`);
  console.log('query   : "brake pads"');

  const path = oemPartsForVehiclePath({
    typeId: AUTOPARTS_TYPE_ID.passengerCar,
    vehicleId: map.provider_vehicle_id,
    langId: AUTOPARTS_ENGLISH_LANG_ID,
    searchParam: 'brake pads',
  });
  console.log(`path    : ${path.split('/search-param/')[0]}/search-param/<term>`);

  const payload = await autoPartsApiRequest<unknown>(path, undefined, {
    category: 'vehicle_parts_search',
    callContext: 'manual_probe',
  });

  console.log('\n── envelope ───────────────────────────────────────────────────');
  if (Array.isArray(payload)) {
    console.log(`top level: ARRAY, length ${payload.length}`);
  } else if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    console.log('top level: OBJECT, keys:', Object.keys(o).join(', '));
    for (const [k, v] of Object.entries(o)) {
      console.log(`   ${k}: ${Array.isArray(v) ? `ARRAY len=${v.length}` : typeof v}`);
    }
  } else {
    console.log('top level:', typeof payload);
  }

  const rows: Record<string, unknown>[] = Array.isArray(payload)
    ? payload as Record<string, unknown>[]
    : (() => {
      for (const k of ['data', 'items', 'articles', 'result', 'results', 'parts']) {
        const v = (payload as Record<string, unknown>)?.[k];
        if (Array.isArray(v)) return v as Record<string, unknown>[];
      }
      return [];
    })();

  console.log(`\n── rows: ${rows.length} ───────────────────────────────────────────────`);
  if (!rows.length) { console.log('no rows found under any known envelope key'); return; }

  // Every key seen anywhere, with how often it is populated. A key present on
  // one row and absent on the rest is exactly what breaks a normalizer.
  const keys = new Map<string, { seen: number; nonEmpty: number; types: Set<string> }>();
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      const e = keys.get(k) ?? { seen: 0, nonEmpty: 0, types: new Set<string>() };
      e.seen += 1;
      if (v !== null && v !== undefined && v !== '') e.nonEmpty += 1;
      e.types.add(Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
      keys.set(k, e);
    }
  }
  console.log('\nkey                          populated/rows   types');
  for (const [k, e] of [...keys.entries()].sort()) {
    console.log(`  ${k.padEnd(28)} ${String(e.nonEmpty).padStart(4)}/${String(e.seen).padEnd(5)}   ${[...e.types].join('|')}`);
  }

  console.log('\n── first row, structure only ──────────────────────────────────');
  for (const [k, v] of Object.entries(rows[0])) console.log(`  ${k.padEnd(28)} = ${safeSample(v)}`);

  // Are the rows actually distinct? 186 identical titles is the symptom.
  const titleKeys = [...keys.keys()].filter(k => /name|description|title/i.test(k));
  console.log('\n── distinctness across rows ───────────────────────────────────');
  for (const k of titleKeys) {
    const vals = new Set(rows.map(r => String(r[k] ?? '')));
    console.log(`  ${k.padEnd(28)} distinct values: ${vals.size} of ${rows.length}`);
  }
  for (const k of [...keys.keys()].filter(k => /id$|no$|number/i.test(k))) {
    const vals = new Set(rows.map(r => String(r[k] ?? '')));
    console.log(`  ${k.padEnd(28)} distinct values: ${vals.size} of ${rows.length}`);
  }
}

main().catch(e => { console.error('probe failed:', e instanceof Error ? e.message : e); process.exit(1); });
