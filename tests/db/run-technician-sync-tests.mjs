#!/usr/bin/env node
/**
 * Proves the two-way technician sync between repair orders and job cards:
 *   supabase/migrations/2026-09-27_sync_ro_technician_to_job_card.sql  (RO -> job card)
 *   supabase/migrations/2026-10-09_sync_job_card_technicians_to_ro.sql (job card -> RO)
 * against a THROWAWAY local Postgres container, then removes it.
 *
 *   npm run test:db:technician-sync
 *
 * Stub tables only (the columns the triggers read), run once with
 * job_cards.technicians as text[] and once as jsonb, since both have been used.
 * Never connects to Supabase; needs the Supabase Postgres image locally (never pulls).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const IMAGE = process.env.TECH_SYNC_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.171';
const NAME = `rd1-techsync-dbtest-${process.pid}`;
const RO_HALF = readFileSync(resolve(root, 'supabase/migrations/2026-09-27_sync_ro_technician_to_job_card.sql'), 'utf8');
const JC_HALF = readFileSync(resolve(root, 'supabase/migrations/2026-10-09_sync_job_card_technicians_to_ro.sql'), 'utf8');

const SHOP_A = '38d55fae-0000-4000-8000-00000000000a';
const SHOP_B = '90b72748-0000-4000-8000-00000000000b';

const docker = (args, input) => {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') };
};
function psqlRaw(sql) {
  return docker(['exec', '-i', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], sql);
}
function psql(sql, label = sql) {
  const r = psqlRaw(sql);
  if (r.code !== 0) { console.error(r.out); throw new Error(`${label} failed`); }
  return r.out;
}
function scalar(sql) {
  const r = docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-tAc', sql]);
  if (r.code !== 0) throw new Error(r.out);
  return r.out.trim();
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); console.log('✓ ' + msg); };

/** The job card's technicians as a plain comma list, whatever the column type. */
const jcTechs = (id) => scalar(`SELECT COALESCE(string_agg(x, ','), '') FROM jsonb_array_elements_text(to_jsonb((SELECT technicians FROM job_cards WHERE id='${id}'))) AS x`);
const roTech = (id) => scalar(`SELECT COALESCE(technician, '<null>') FROM repair_orders WHERE id='${id}'`);
const writes = (table) => Number(scalar(`SELECT count(*) FROM write_log WHERE tbl='${table}'`));

function schema(techType) {
  const empty = techType === 'jsonb' ? `'[]'::jsonb` : `'{}'::text[]`;
  const list = (...names) => techType === 'jsonb'
    ? `'${JSON.stringify(names)}'::jsonb`
    : `ARRAY[${names.map(n => `'${n}'`).join(',')}]::text[]`;
  return { empty, list, sql: `
    DROP TABLE IF EXISTS public.repair_orders, public.job_cards, public.write_log CASCADE;
    CREATE TABLE public.write_log (tbl text, at timestamptz DEFAULT clock_timestamp());
    CREATE TABLE public.job_cards (
      id text PRIMARY KEY, shop_id uuid NOT NULL, customer text, vehicle text,
      technicians ${techType} NOT NULL DEFAULT ${empty}, notes text, status text DEFAULT 'In Progress');
    CREATE TABLE public.repair_orders (
      id text PRIMARY KEY, ro_number text, shop_id uuid NOT NULL, job_card_id text,
      customer_name text, vehicle text, technician text, notes text, status text DEFAULT 'In Progress');

    -- Stand-ins for the real AFTER UPDATE triggers (job.assigned alert etc.): count every write.
    CREATE FUNCTION public.log_write() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN INSERT INTO public.write_log (tbl) VALUES (TG_TABLE_NAME); RETURN NEW; END $f$;
    CREATE TRIGGER jc_log AFTER UPDATE ON public.job_cards FOR EACH ROW EXECUTE FUNCTION public.log_write();
    CREATE TRIGGER ro_log AFTER UPDATE ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.log_write();

    -- A repair order write that fails, to prove the job card save is never blocked.
    CREATE FUNCTION public.ro_boom() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN IF NEW.technician = 'BOOM' THEN RAISE EXCEPTION 'simulated RO failure'; END IF; RETURN NEW; END $f$;
    CREATE TRIGGER ro_boom BEFORE UPDATE ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.ro_boom();
  ` };
}

function suite(techType) {
  console.log(`\n── job_cards.technicians as ${techType} ──`);
  const s = schema(techType);
  psql(s.sql, `stub schema (${techType})`);

  // The job card half refuses to install without the RO half.
  const early = psqlRaw(JC_HALF);
  assert(early.code !== 0 && /Apply 2026-09-27_sync_ro_technician_to_job_card\.sql first/.test(early.out),
    'the new migration stops with a clear message if the 2026-09-27 half is missing');
  assert(scalar(`SELECT count(*) FROM pg_trigger WHERE tgname='job_cards_sync_ro_technician'`) === '0', '…and installs nothing');

  // Rows that already disagree before the migration.
  psql(`
    INSERT INTO job_cards (id, shop_id, customer, vehicle, technicians) VALUES
      ('JC-JEEP',  '${SHOP_A}', 'JEEP WRANGLER #2222', '2018 Jeep Wrangler', ${s.list('WALLY')}),
      ('JC-OTHER', '${SHOP_B}', 'X', 'Car', ${s.empty}),
      ('JC-TEXT',  '${SHOP_A}', 'AI JOY', 'Camry', ${s.empty}),
      ('JC-BOOM',  '${SHOP_A}', 'BOOM CO', 'Truck', ${s.empty});
    INSERT INTO repair_orders (id, ro_number, shop_id, job_card_id, customer_name, vehicle, technician) VALUES
      ('ro-jeep',  'RO-00020', '${SHOP_A}', 'JC-JEEP',  'JEEP WRANGLER #2222', '2018 Jeep Wrangler', ''),
      ('ro-cross', 'RO-00021', '${SHOP_A}', 'JC-OTHER', 'X', 'Car', ''),
      ('ro-text',  'RO-00022', '${SHOP_A}', 'JC-TEXT',  'AI JOY', 'Camry (edited)', ''),
      ('ro-boom',  'RO-00023', '${SHOP_A}', 'JC-BOOM',  'BOOM CO', 'Truck', 'KAT');
  `, 'seed rows');

  psql(RO_HALF, '2026-09-27 migration');
  psql(JC_HALF, '2026-10-09 migration');
  assert(scalar(`SELECT count(*) FROM pg_trigger WHERE tgname IN ('repair_orders_sync_job_card_technicians','job_cards_sync_ro_technician')`) === '2', 'both halves installed');
  assert(roTech('ro-jeep') === '', 'applying it rewrites no existing row (the Jeep RO is still blank until the next save)');

  // Job card -> RO: the reported case.
  psql(`DELETE FROM write_log`);
  psql(`UPDATE job_cards SET technicians = ${s.list('WALLY', 'BEE')} WHERE id='JC-JEEP'`);
  assert(roTech('ro-jeep') === 'WALLY, BEE', 'assigning on the job card sets the RO technician (names joined by ", ")');
  assert(writes('job_cards') === 1 && writes('repair_orders') === 1, 'one save on each side: no echo back to the job card');

  // RO -> job card still works, and does not echo back.
  psql(`DELETE FROM write_log`);
  psql(`UPDATE repair_orders SET technician = 'KAT' WHERE id='ro-jeep'`);
  assert(jcTechs('JC-JEEP') === 'KAT', 'assigning on the RO sets the job card (the 2026-09-27 half)');
  assert(writes('job_cards') === 1 && writes('repair_orders') === 1, 'one save on each side: no echo back to the RO');

  // A job card save that does not change technicians leaves the RO alone.
  psql(`DELETE FROM write_log`);
  psql(`UPDATE job_cards SET notes = 'brake fluid' WHERE id='JC-JEEP'`);
  assert(writes('repair_orders') === 0 && roTech('ro-jeep') === 'KAT', 'a job card save without a technician change does not touch the RO');

  // Clearing.
  psql(`UPDATE job_cards SET technicians = ${s.empty} WHERE id='JC-JEEP'`);
  assert(roTech('ro-jeep') === '', 'clearing the job card clears the RO');

  // Blanks and stray spaces are dropped.
  psql(`UPDATE job_cards SET technicians = ${s.list(' WALLY ', '', 'BEE')} WHERE id='JC-JEEP'`);
  assert(roTech('ro-jeep') === 'WALLY, BEE', 'blank names and stray spaces are dropped');

  // Safety guards.
  psql(`UPDATE job_cards SET technicians = ${s.list('POPEYE')} WHERE id='JC-OTHER'`);
  assert(roTech('ro-cross') === '', 'never writes an RO in another shop');
  psql(`UPDATE job_cards SET technicians = ${s.list('POPEYE')} WHERE id='JC-TEXT'`);
  assert(roTech('ro-text') === '', 'skips an RO whose customer or vehicle text does not match (same rule as the 2026-09-27 half)');

  // A failing RO write never blocks the job card save.
  const boom = psqlRaw(`UPDATE job_cards SET technicians = ${s.list('BOOM')} WHERE id='JC-BOOM'`);
  assert(boom.code === 0 && jcTechs('JC-BOOM') === 'BOOM', 'the job card save succeeds when the RO write fails');
  assert(roTech('ro-boom') === 'KAT', '…the RO is left exactly as it was');
  assert(/not synced to its repair order/.test(boom.out), '…and a WARNING names the job card');

  // Re-running is harmless.
  psql(JC_HALF, '2026-10-09 migration re-run');
  assert(scalar(`SELECT count(*) FROM pg_trigger WHERE tgname='job_cards_sync_ro_technician'`) === '1', 're-running creates no duplicate trigger');
  assert(scalar(`SELECT has_function_privilege('public', 'public.sync_job_card_technicians_to_ro()', 'EXECUTE')`) === 'f', 'PUBLIC cannot execute the sync function');
}

async function main() {
  if (docker(['image', 'inspect', IMAGE]).code !== 0) throw new Error(`Image ${IMAGE} not present locally; this runner never pulls.`);
  const s = docker(['run', '-d', '--name', NAME, '-e', 'POSTGRES_PASSWORD=local-throwaway', IMAGE]);
  if (s.code !== 0) throw new Error(s.out);
  for (let i = 0; i < 90; i++) {
    if (docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-tAc', 'select 1']).code === 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  for (const techType of ['text[]', 'jsonb']) {
    // Start each run with neither half installed (CASCADE drops their triggers).
    psql(`
      DROP FUNCTION IF EXISTS public.sync_ro_technician_to_job_card(), public.sync_job_card_technicians_to_ro(),
                              public.log_write(), public.ro_boom() CASCADE;
    `, 'reset');
    suite(techType);
  }

  console.log('\nALL TECHNICIAN-SYNC DATABASE CHECKS PASSED');
}

main().then(() => docker(['rm', '-f', NAME])).catch(e => {
  console.error('\n✗ ' + (e instanceof Error ? e.message : String(e)));
  docker(['rm', '-f', NAME]);
  process.exit(1);
});
