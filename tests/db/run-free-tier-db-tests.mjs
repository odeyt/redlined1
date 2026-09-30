#!/usr/bin/env node
/**
 * Proves the Free Forever caps (customers 10, vehicles 10, job cards 5/month)
 * hold under concurrency, against a THROWAWAY local Postgres container.
 *
 *   npm run test:db:free-tier
 *
 * Steps: stub schema -> ORIGINAL free_tier_usage_limits.sql -> race (expects
 * overshoot: proves the test sees the bug) -> new migration -> race (expects
 * exact caps) -> paid/ownerless shops unaffected -> re-run migration.
 * Never touches Supabase; needs the Supabase Postgres image locally (never pulls).
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
function scalar(sql) {
  const r = docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-tAc', sql]);
  if (r.code !== 0) throw new Error(r.out);
  return r.out.trim();
}

const TABLES = {
  customers: { limit: 10, insert: s => `INSERT INTO public.customers (shop_id, name) VALUES ('${s}', 'race')` },
  vehicles: { limit: 10, insert: s => `INSERT INTO public.vehicles (shop_id, label) VALUES ('${s}', 'race')` },
  job_cards: { limit: 5, insert: s => `INSERT INTO public.job_cards (shop_id) VALUES ('${s}')` },
};

let seq = 0;
function makeShop(plan, role = 'owner') {
  const n = String(++seq).padStart(12, '0');
  const shop = `dddddddd-0000-0000-0000-${n}`;
  const user = `eeeeeeee-0000-0000-0000-${n}`;
  psql(`INSERT INTO auth.users (id, email) VALUES ('${user}', 'ft-${n}@test.local');
    INSERT INTO public.shops (id, name) VALUES ('${shop}', 'ft ${n}');
    INSERT INTO public.shop_users (shop_id, user_id, role) VALUES ('${shop}', '${user}', '${role}');
    ${plan ? `INSERT INTO public.profiles (id, plan) VALUES ('${user}', '${plan}');` : ''}`, 'fixtures');
  return shop;
}

function one(shop, table) {
  const sql = `BEGIN; ${TABLES[table].insert(shop)}; SELECT pg_sleep(${HOLD_SECONDS}); COMMIT;`;
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
  psql(original, 'original limits');
  console.log('✓ stub schema + original free_tier_usage_limits.sql');

  // Baseline: the old check-then-insert must overshoot, or the test is blind.
  for (const [t, c] of Object.entries(TABLES)) {
    const r = await race(makeShop('free'), t);
    console.log(`  BEFORE ${t}: ${r.ok}/${SESSIONS} committed, ${r.rows} rows (cap ${c.limit})`);
    if (r.rows <= c.limit) throw new Error(`control: ${t} did not overshoot; the race test is not sensitive enough`);
  }
  console.log('✓ original triggers overshoot every cap under concurrency (test sees the bug)');

  psql(migration, 'migration');
  console.log('✓ migration applied');

  for (const [t, c] of Object.entries(TABLES)) {
    const r = await race(makeShop('free'), t);
    console.log(`  AFTER  ${t}: ${r.ok}/${SESSIONS} committed, ${r.rows} rows (cap ${c.limit})`);
    if (r.rows !== c.limit || r.ok !== c.limit) throw new Error(`${t}: cap not exact under concurrency`);
  }
  console.log('✓ concurrent inserts stop at exactly 10 / 10 / 5');

  // Unchanged behaviour: message, paid, ownerless, per-shop independence.
  const msg = docker(PSQL, `INSERT INTO public.job_cards (shop_id) SELECT '${makeShop('free')}' FROM generate_series(1,6);`);
  if (!/FREE_TIER_LIMIT:job_cards:5/.test(msg.out)) throw new Error('error message changed: ' + msg.out);
  console.log('✓ sequential over-cap insert still raises FREE_TIER_LIMIT:job_cards:5');

  for (const [label, shop] of [['paid', makeShop('pro')], ['no owner profile', makeShop(null)], ['manager only', makeShop('free', 'manager')]]) {
    psql(`INSERT INTO public.customers (shop_id, name) SELECT '${shop}', 'x' FROM generate_series(1,15);`, label);
    console.log(`✓ ${label} shop is not capped (15 customers inserted)`);
  }

  // A different shop's held lock must not block this shop's inserts.
  const a = makeShop('free');
  const b = makeShop('free');
  const held = one(a, 'customers');
  await new Promise(r => setTimeout(r, 800));
  const t0 = Date.now();
  psql(`INSERT INTO public.customers (shop_id, name) VALUES ('${b}', 'x');`, 'other shop insert');
  const ms = Date.now() - t0;
  await held;
  if (ms > 2000) throw new Error(`other shop's insert waited ${ms}ms on an unrelated lock`);
  console.log(`✓ another shop is not blocked by the lock (${ms}ms while shop A held it)`);

  psql(migration, 'migration re-run');
  console.log('✓ migration re-runs cleanly');
  console.log('\nALL FREE-TIER DATABASE CHECKS PASSED');
}

main().then(() => docker(['rm', '-f', NAME])).catch(e => {
  console.error('\n✗ ' + (e instanceof Error ? e.message : String(e)));
  docker(['rm', '-f', NAME]);
  process.exit(1);
});
