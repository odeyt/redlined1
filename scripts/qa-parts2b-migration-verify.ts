/**
 * Verify the M-PARTS2B migration landed and the permissions are what the SQL
 * claims — with a positive AND a negative control on every check.
 *
 * A `head`-count existence probe previously reported three absent tables as
 * present, including one named `definitely_not_a_real_table_xyz`. Every
 * assertion here is paired with a control that must come out the other way,
 * so a check that has stopped discriminating fails loudly instead of passing
 * everything.
 *
 *   npx tsx --conditions=react-server scripts/qa-parts2b-migration-verify.ts
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
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

const MAPPINGS = 'parts_provider_vehicle_mappings';
const USAGE = 'parts_provider_usage_events';
const CONTROL_ABSENT = 'definitely_not_a_real_table_xyz';

let failed = 0;
const pass = (l: string) => console.log(`  PASS   ${l}`);
const fail = (l: string) => { console.log(`  FAIL   ${l}`); failed += 1; };
const check = (l: string, ok: boolean) => (ok ? pass(l) : fail(l));

async function existsForServiceRole(table: string): Promise<boolean> {
  const { error } = await admin.from(table).select('*').limit(1);
  return !error;
}

async function main() {
  console.log('\nM-PARTS2B MIGRATION VERIFICATION');
  console.log('='.repeat(60));

  // ── Existence, with a negative control ──────────────────────────────────
  const mappingsExist = await existsForServiceRole(MAPPINGS);
  const usageExist = await existsForServiceRole(USAGE);
  const controlExists = await existsForServiceRole(CONTROL_ABSENT);

  check(`${MAPPINGS} exists`, mappingsExist);
  check(`${USAGE} exists`, usageExist);
  // The control proves the probe still discriminates.
  check('negative control (a table that must NOT exist) is absent', !controlExists);

  if (!mappingsExist || !usageExist) {
    console.log('\nMigration has not been applied. Nothing further to check.\n');
    process.exit(1);
  }

  // ── Columns ─────────────────────────────────────────────────────────────
  const { data: mapRow } = await admin.from(MAPPINGS).select('*').limit(1);
  const cols = mapRow && mapRow[0] ? Object.keys(mapRow[0]) : null;
  if (cols) {
    for (const c of ['shop_id', 'vehicle_id', 'provider_vehicle_id', 'vehicle_fingerprint', 'resolution_status']) {
      check(`${MAPPINGS}.${c} present`, cols.includes(c));
    }
  } else {
    console.log('  (table empty — column shape checked on first insert below)');
  }

  // ── The browser must not be able to write ───────────────────────────────
  //
  // anon stands in for an unauthenticated browser. A member session is
  // `authenticated`, which the migration grants SELECT and nothing else.
  const { error: anonInsert } = await anon.from(USAGE).insert({
    shop_id: '00000000-0000-4000-8000-000000000000',
    endpoint_category: 'reference',
  });
  check('anon INSERT into usage is denied', Boolean(anonInsert));

  const { error: anonMapInsert } = await anon.from(MAPPINGS).insert({
    shop_id: '00000000-0000-4000-8000-000000000000',
    vehicle_id: '00000000-0000-4000-8000-000000000000',
    resolution_status: 'resolved',
    vehicle_fingerprint: 'x',
  });
  check('anon INSERT into mappings is denied', Boolean(anonMapInsert));

  // Positive control: the same anon client CAN reach a table whose RLS simply
  // returns nothing.
  //
  // NOT `shops` — anon holds no grant there and is refused outright, which is
  // correct security and made this control fail against a perfectly good
  // migration. `vehicles` is grant-visible and RLS-empty for anon, so a
  // success here proves the client works and the denials above are RLS doing
  // its job rather than the client being broken.
  const { error: anonReadAllowed } = await anon.from('vehicles').select('id').limit(1);
  check('positive control — anon client reaches an RLS-empty table', !anonReadAllowed);

  // And the negative half of the same control: a table anon has no grant on
  // must still be refused, so "denied" above is not simply how this client
  // answers everything.
  const { error: anonDeniedElsewhere } = await anon.from('shop_settings').select('id').limit(1);
  check('negative control — anon is refused on a table it has no grant for', Boolean(anonDeniedElsewhere));

  // ── service_role can write, and cleans up after itself ──────────────────
  const { data: shop } = await admin.from('shops').select('id').limit(1).single();
  const { data: vehicle } = await admin.from('vehicles').select('id, shop_id').limit(1).single();

  if (shop && vehicle) {
    const { data: inserted, error: insErr } = await admin.from(MAPPINGS).insert({
      shop_id: vehicle.shop_id ?? shop.id,
      vehicle_id: vehicle.id,
      provider: 'autopartsapi',
      provider_type_id: 1,
      provider_manufacturer_id: 74,
      provider_model_id: 9001,
      provider_vehicle_id: 5501,
      resolution_status: 'resolved',
      resolution_evidence: [{ step: 'manufacturer', outcome: 'matched', detail: 'QA' }],
      vehicle_fingerprint: 'qa-fingerprint-0000',
    }).select('id').single();

    check('service_role INSERT into mappings succeeds', !insErr && Boolean(inserted));

    if (inserted) {
      // The unique index must refuse a second live mapping for the same pair.
      const { error: dupeErr } = await admin.from(MAPPINGS).insert({
        shop_id: vehicle.shop_id ?? shop.id,
        vehicle_id: vehicle.id,
        provider: 'autopartsapi',
        resolution_status: 'resolved',
        vehicle_fingerprint: 'qa-fingerprint-1111',
      });
      check('unique index refuses a duplicate (shop, vehicle, provider)', Boolean(dupeErr));

      // A bad status must be refused by the CHECK constraint.
      const { error: badStatus } = await admin.from(MAPPINGS).update({
        resolution_status: 'definitely-not-a-status',
      }).eq('id', inserted.id);
      check('resolution_status CHECK constraint holds', Boolean(badStatus));

      await admin.from(MAPPINGS).delete().eq('id', inserted.id);
      const { data: gone } = await admin.from(MAPPINGS).select('id').eq('id', inserted.id).maybeSingle();
      check('QA mapping row removed', !gone);
    }

    const { data: usageRow, error: usageErr } = await admin.from(USAGE).insert({
      shop_id: vehicle.shop_id ?? shop.id,
      endpoint_category: 'reference',
      cache_hit: true,
      success: true,
    }).select('id').single();
    check('service_role INSERT into usage succeeds', !usageErr && Boolean(usageRow));

    const { error: badCategory } = await admin.from(USAGE).insert({
      shop_id: vehicle.shop_id ?? shop.id,
      endpoint_category: 'not-a-category',
    });
    check('endpoint_category CHECK constraint holds', Boolean(badCategory));

    if (usageRow) {
      await admin.from(USAGE).delete().eq('id', usageRow.id);
      const { data: goneU } = await admin.from(USAGE).select('id').eq('id', usageRow.id).maybeSingle();
      check('QA usage row removed', !goneU);
    }
  } else {
    fail('no shop/vehicle available to exercise writes');
  }

  console.log('='.repeat(60));
  console.log(failed ? `\n${failed} CHECK(S) FAILED\n` : '\nALL CHECKS PASSED\n');
  process.exit(failed ? 1 : 0);
}

main().catch(e => {
  console.error('unexpected: ' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
