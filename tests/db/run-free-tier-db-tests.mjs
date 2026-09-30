#!/usr/bin/env node
/**
 * Proves supabase/migrations/2026-09-30_free_tier_caps_race_safe.sql against a
 * THROWAWAY local Postgres container, then removes the container.
 *
 *   npm run test:db:free-tier
 *
 * The stub schema has NO cap function and NO cap triggers (production and
 * staging had neither). The migration itself must install them; nothing in the
 * stub pre-installs enforcement, so a migration that only defined the function
 * would fail here.
 *
 * Flow:
 *   1. stub schema; assert no cap function/triggers; seed shops that are
 *      ALREADY over their limits (before enforcement exists).
 *   2. control: the ORIGINAL free_tier_usage_limits.sql overshoots under
 *      concurrency (the test can see the bug); then reset to the empty state.
 *   3. conflicts: a foreign trg_free_tier_limit, or an overload, makes the
 *      migration refuse and change nothing.
 *   4. atomicity: a failure part-way (no ownership of one table) rolls back all.
 *   5. apply the migration; its embedded acceptance checks run.
 *   6. concurrency as the `authenticated` role: exactly 10 / 10 / 5.
 *   7. sequential error text, paid / unresolved owners, other shops unblocked,
 *      unrelated triggers intact, over-limit shops keep data, re-run idempotent.
 *
 * Does NOT prove compatibility with the real schema: that needs the staging
 * database (see docs/free-tier-caps-rollout.md). Never connects to Supabase;
 * needs the Supabase Postgres image locally (never pulls).
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const IMAGE = process.env.FREE_TIER_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.171';
const NAME = `rd1-freetier-dbtest-${process.pid}`;
const SESSIONS = 14;
const HOLD_SECONDS = 3;

const docker = (args, input) => {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') };
};
const PSQL = ['exec', '-i', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'];
function psql(sql, label) {
  const r = docker(PSQL, sql);
  if (r.code !== 0) { console.error(r.out); throw new Error(`${label} failed`); }
  return r.out;
}
/** Runs SQL expected to fail; returns the output (throws if it succeeds). */
function psqlFails(sql, label) {
  const r = docker(PSQL, sql);
  if (r.code === 0) throw new Error(`${label}: expected failure but it succeeded`);
  return r.out;
}
function scalar(sql) {
  const r = docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-tAc', sql]);
  if (r.code !== 0) throw new Error(r.out);
  return r.out.trim();
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const TABLES = {
  customers: { limit: 10, insert: s => `INSERT INTO public.customers (shop_id, name) VALUES ('${s}', 'race')` },
  vehicles: { limit: 10, insert: s => `INSERT INTO public.vehicles (shop_id, label) VALUES ('${s}', 'race')` },
  job_cards: { limit: 5, insert: s => `INSERT INTO public.job_cards (shop_id) VALUES ('${s}')` },
};

let seq = 0;
function makeShop(plan, role = 'owner', trialDays = null) {
  const n = String(++seq).padStart(12, '0');
  const shop = `dddddddd-0000-0000-0000-${n}`;
  const user = `eeeeeeee-0000-0000-0000-${n}`;
  const trial = trialDays === null ? 'NULL' : `now() + interval '${trialDays} days'`;
  psql(`INSERT INTO auth.users (id, email) VALUES ('${user}', 'ft-${n}@test.local');
    INSERT INTO public.shops (id, name) VALUES ('${shop}', 'ft ${n}');
    INSERT INTO public.shop_users (shop_id, user_id, role) VALUES ('${shop}', '${user}', '${role}');
    ${plan ? `INSERT INTO public.profiles (id, plan, trial_ends_at) VALUES ('${user}', '${plan}', ${trial});` : ''}`, 'fixtures');
  return shop;
}

/** One session: insert as the application role, hold the transaction, commit. */
function one(shop, table) {
  const sql = `BEGIN; SET LOCAL ROLE authenticated; ${TABLES[table].insert(shop)}; SELECT pg_sleep(${HOLD_SECONDS}); COMMIT;`;
  return new Promise(res => {
    const c = spawn('docker', ['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'ignore' });
    c.on('close', code => res(code === 0));
  });
}
async function race(shop, table) {
  const ok = (await Promise.all(Array.from({ length: SESSIONS }, () => one(shop, table)))).filter(Boolean).length;
  const rows = Number(scalar(`SELECT count(*) FROM public.${table} WHERE shop_id = '${shop}'`));
  return { ok, rows };
}

const capObjects = () => scalar(`SELECT
    (SELECT count(*) FROM pg_proc WHERE proname = 'enforce_free_tier_count_limit')
  + (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_free_tier_limit')`);
const otherTriggers = () => scalar(`SELECT string_agg(tgrelid::regclass::text || ':' || tgname::text || ':' || tgenabled::text, ',' ORDER BY tgrelid::regclass::text, tgname)
  FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.customers'::regclass,'public.vehicles'::regclass,'public.job_cards'::regclass)
  AND tgname <> 'trg_free_tier_limit'`);
const capTriggerDefs = () => scalar(`SELECT string_agg(pg_get_triggerdef(oid), ' ; ' ORDER BY tgrelid::regclass::text)
  FROM pg_trigger WHERE tgname = 'trg_free_tier_limit'`);

async function main() {
  if (docker(['image', 'inspect', IMAGE]).code !== 0) throw new Error(`Image ${IMAGE} not present locally; this runner never pulls.`);
  const s = docker(['run', '-d', '--name', NAME, '-e', 'POSTGRES_PASSWORD=local-throwaway', IMAGE]);
  if (s.code !== 0) throw new Error(s.out);
  for (let i = 0; i < 90; i++) {
    if (docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-tAc', 'select 1']).code === 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  const original = readFileSync(resolve(root, 'supabase/migrations/free_tier_usage_limits.sql'), 'utf8');
  const migration = readFileSync(resolve(root, 'supabase/migrations/2026-09-30_free_tier_caps_race_safe.sql'), 'utf8');
  psql(readFileSync(resolve(here, 'free-tier/stub_schema.sql'), 'utf8'), 'stub schema');
  assert(capObjects() === '0', 'the stub must start with no cap function and no cap triggers');
  console.log('✓ stub starts with no cap function and no cap triggers (as on production and staging)');

  // Shops already over their limits BEFORE enforcement exists.
  const over = makeShop('free');
  psql(`INSERT INTO public.customers (shop_id, name) SELECT '${over}', 'pre' FROM generate_series(1,12);
        INSERT INTO public.job_cards (shop_id) SELECT '${over}' FROM generate_series(1,7);`, 'over-limit seed');

  // ── Control: the original file overshoots ──────────────────────────────────
  psql(original, 'original limits');
  for (const [t, c] of Object.entries(TABLES)) {
    const r = await race(makeShop('free'), t);
    console.log(`  CONTROL (original file) ${t}: ${r.ok}/${SESSIONS} committed, ${r.rows} rows (cap ${c.limit})`);
    assert(r.rows > c.limit, `control: ${t} did not overshoot; the race test is not sensitive enough`);
  }
  psql(`DROP TRIGGER trg_free_tier_limit ON public.customers;
        DROP TRIGGER trg_free_tier_limit ON public.vehicles;
        DROP TRIGGER trg_free_tier_limit ON public.job_cards;
        DROP FUNCTION public.enforce_free_tier_count_limit();`, 'reset');
  assert(capObjects() === '0', 'reset did not return to the empty state');
  console.log('✓ the original file overshoots every cap; reset to the empty state');

  // ── Conflicts: refuse, change nothing ──────────────────────────────────────
  const before = otherTriggers();
  psql(`CREATE FUNCTION public.foreign_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
        CREATE TRIGGER trg_free_tier_limit BEFORE INSERT ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.foreign_fn();`, 'conflict fixture');
  let out = psqlFails(migration, 'foreign trigger conflict');
  assert(/conflicting trigger trg_free_tier_limit on public\.vehicles/.test(out), 'wrong conflict message: ' + out);
  assert(scalar(`SELECT count(*) FROM pg_proc WHERE proname = 'enforce_free_tier_count_limit'`) === '0', 'conflict left the function behind');
  assert(scalar(`SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_free_tier_limit'`) === '1', 'conflict changed triggers');
  assert(scalar(`SELECT p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE t.tgname = 'trg_free_tier_limit'`) === 'foreign_fn', 'the foreign trigger was replaced');
  psql('DROP TRIGGER trg_free_tier_limit ON public.vehicles; DROP FUNCTION public.foreign_fn();', 'conflict cleanup');
  console.log('✓ a foreign trigger named trg_free_tier_limit stops the migration; it is not replaced');

  psql(`CREATE FUNCTION public.enforce_free_tier_count_limit(x int) RETURNS int LANGUAGE sql AS 'SELECT 1';`, 'overload fixture');
  out = psqlFails(migration, 'overload conflict');
  assert(/overload|with arguments/.test(out), 'wrong overload message: ' + out);
  psql('DROP FUNCTION public.enforce_free_tier_count_limit(int);', 'overload cleanup');
  console.log('✓ an overload of the function stops the migration');

  psql(`CREATE FUNCTION public.other_free_tier_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
        CREATE TRIGGER trg_other_cap BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.other_free_tier_guard();`, 'lookalike fixture');
  out = psqlFails(migration, 'lookalike cap conflict');
  assert(/conflicting trigger trg_other_cap/.test(out), 'wrong lookalike message: ' + out);
  psql('DROP TRIGGER trg_other_cap ON public.customers; DROP FUNCTION public.other_free_tier_guard();', 'lookalike cleanup');
  console.log('✓ another free-tier trigger on the same table stops the migration');
  assert(otherTriggers() === before && capObjects() === '0', 'conflict runs changed something');

  // ── Atomicity: fails part-way, everything rolls back ───────────────────────
  // `mig` owns customers and job_cards but not vehicles, so CREATE TRIGGER on
  // vehicles fails AFTER the function and the customers trigger were created.
  psql(`CREATE ROLE mig NOLOGIN;
        GRANT mig TO postgres;
        GRANT USAGE, CREATE ON SCHEMA public TO mig;
        GRANT SELECT ON public.shop_users, public.profiles TO mig;
        ALTER TABLE public.customers OWNER TO mig;
        ALTER TABLE public.job_cards OWNER TO mig;`, 'atomicity fixture');
  out = psqlFails(`SET ROLE mig;\n${migration}`, 'partial failure');
  assert(/CREATE TRIGGER trg_free_tier_limit BEFORE INSERT ON public\.vehicles/.test(out) && /permission denied|must be owner/.test(out), 'atomicity: failed for an unexpected reason: ' + out);
  assert(capObjects() === '0', 'atomicity: a failed migration left cap objects behind');
  assert(otherTriggers() === before, 'atomicity: a failed migration changed unrelated triggers');
  psql(`ALTER TABLE public.customers OWNER TO postgres; ALTER TABLE public.job_cards OWNER TO postgres;
        REVOKE ALL ON public.shop_users, public.profiles FROM mig; REVOKE ALL ON SCHEMA public FROM mig; DROP ROLE mig;`, 'atomicity cleanup');
  console.log('✓ a migration failing part-way (after creating the function and a trigger) rolls back completely');

  // ── Apply for real ─────────────────────────────────────────────────────────
  const applied = psql(migration, 'migration');
  assert(/acceptance checks passed/.test(applied), 'acceptance notice missing');
  assert(capObjects() === '4', 'expected 1 function + 3 triggers');
  assert(otherTriggers() === before, 'the migration changed unrelated triggers');
  console.log('✓ migration installed the function and 3 triggers itself; acceptance checks passed');

  const defs = capTriggerDefs();
  assert((defs.match(/BEFORE INSERT ON public\.\w+ FOR EACH ROW EXECUTE FUNCTION enforce_free_tier_count_limit\(\)/g) ?? []).length === 3,
    'trigger definitions are not BEFORE INSERT FOR EACH ROW x3: ' + defs);
  console.log('✓ triggers are BEFORE INSERT, FOR EACH ROW, on customers/vehicles/job_cards; unrelated triggers intact');

  // ── Privileges ─────────────────────────────────────────────────────────────
  assert(scalar(`SELECT has_function_privilege('authenticated','public.enforce_free_tier_count_limit()','EXECUTE')`) === 'f', 'authenticated can execute the function');
  assert(scalar(`SELECT has_function_privilege('anon','public.enforce_free_tier_count_limit()','EXECUTE')`) === 'f', 'anon can execute the function');
  assert(scalar(`SELECT (prosecdef AND 'search_path=""' = ANY (proconfig))::text FROM pg_proc WHERE proname='enforce_free_tier_count_limit'`) === 'true', 'function is not SECURITY DEFINER with empty search_path');
  console.log('✓ EXECUTE is revoked from PUBLIC/anon/authenticated; SECURITY DEFINER with empty search_path');

  // ── Concurrency, as the application role ───────────────────────────────────
  for (const [t, c] of Object.entries(TABLES)) {
    const r = await race(makeShop('free'), t);
    console.log(`  ${t}: ${r.ok}/${SESSIONS} committed, ${r.rows} rows (cap ${c.limit})`);
    assert(r.rows === c.limit && r.ok === c.limit, `${t}: cap not exact under concurrency`);
  }
  console.log('✓ concurrent inserts (separate sessions, role authenticated) stop at exactly 10 / 10 / 5');

  // ── Established behaviour ──────────────────────────────────────────────────
  out = docker(PSQL, `SET ROLE authenticated; INSERT INTO public.job_cards (shop_id) SELECT '${makeShop('free')}' FROM generate_series(1,6);`).out;
  assert(/FREE_TIER_LIMIT:job_cards:5/.test(out), 'error message changed: ' + out);
  console.log('✓ a sequential over-cap insert raises FREE_TIER_LIMIT:job_cards:5');

  for (const [label, shop] of [
    ['starter owner', makeShop('starter')],
    ['professional owner', makeShop('professional')],
    ['owner with no profile row', makeShop(null)],
    ['shop with only a manager', makeShop('free', 'manager')],
  ]) {
    psql(`SET ROLE authenticated; INSERT INTO public.customers (shop_id, name) SELECT '${shop}', 'x' FROM generate_series(1,15);`, label);
    console.log(`✓ ${label}: not capped (15 customers inserted)`);
  }
  const trialing = makeShop('free', 'owner', 14);
  out = docker(PSQL, `SET ROLE authenticated; INSERT INTO public.customers (shop_id, name) SELECT '${trialing}', 'x' FROM generate_series(1,11);`).out;
  assert(/FREE_TIER_LIMIT:customers:10/.test(out), "established behaviour changed for plan='free' with a live trial: " + out);
  console.log("✓ plan='free' with a live trial_ends_at is capped (established behaviour, documented in the migration)");

  // Shops already over their limit keep their data; only new inserts are refused.
  assert(scalar(`SELECT count(*) FROM public.customers WHERE shop_id = '${over}'`) === '12', 'over-limit data changed');
  assert(scalar(`SELECT count(*) FROM public.job_cards WHERE shop_id = '${over}'`) === '7', 'over-limit data changed');
  psql(`SET ROLE authenticated; UPDATE public.customers SET name = 'renamed' WHERE shop_id = '${over}';`, 'update over-limit shop');
  out = docker(PSQL, `SET ROLE authenticated; INSERT INTO public.customers (shop_id, name) VALUES ('${over}', 'one more');`).out;
  assert(/FREE_TIER_LIMIT:customers:10/.test(out), 'over-limit shop was allowed to add more');
  console.log('✓ a free shop already at 12 customers / 7 jobs keeps its rows, can edit them, and cannot add more');

  // Unrelated triggers still fire.
  const audits = Number(scalar(`SELECT count(*) FROM public.audit_log`));
  assert(audits > 0, 'the unrelated audit triggers stopped firing');
  console.log(`✓ unrelated audit triggers still fire (${audits} audit rows)`);

  // A lock held by one shop does not block another shop or another table.
  const a = makeShop('free');
  const b = makeShop('free');
  const held = one(a, 'customers');
  await new Promise(r => setTimeout(r, 800));
  for (const [label, shop, table] of [['another shop', b, 'customers'], ['same shop, other table', a, 'vehicles']]) {
    const t0 = Date.now();
    psql(`${TABLES[table].insert(shop)};`, label);
    const ms = Date.now() - t0;
    assert(ms < 2000, `${label} waited ${ms}ms on an unrelated lock`);
    console.log(`✓ ${label} is not blocked by the held lock (${ms}ms)`);
  }
  await held;

  // ── Re-run: no duplicates, nothing changes ─────────────────────────────────
  const fingerprint = () => scalar(`SELECT md5(prosrc) || coalesce(proacl::text, '') || coalesce(proconfig::text, '') FROM pg_proc WHERE proname = 'enforce_free_tier_count_limit'`) + '|' + capTriggerDefs();
  const fp = fingerprint();
  const rerun = psql(migration, 'migration re-run');
  assert(/acceptance checks passed/.test(rerun), 're-run acceptance missing');
  assert(fingerprint() === fp, 're-running changed the installed objects');
  assert(scalar(`SELECT count(*) FROM pg_trigger WHERE tgname='trg_free_tier_limit'`) === '3', 're-run created duplicate triggers');
  assert(otherTriggers() === before, 're-run changed unrelated triggers');
  console.log('✓ re-running the identical file creates no duplicate triggers and changes nothing');

  console.log('\nALL FREE-TIER DATABASE CHECKS PASSED');
}

main().then(() => docker(['rm', '-f', NAME])).catch(e => {
  console.error('\n✗ ' + (e instanceof Error ? e.message : String(e)));
  docker(['rm', '-f', NAME]);
  process.exit(1);
});
