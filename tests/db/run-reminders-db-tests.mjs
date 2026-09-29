#!/usr/bin/env node
/**
 * Runs the internal-reminders migration and its behavioural tests against a
 * THROWAWAY local Postgres container, then removes the container.
 *
 *   npm run test:db:reminders
 *
 * What this proves, and what it does not.
 *
 * It proves the migration's own logic against a real Postgres with the real
 * Supabase roles: RLS, the feature flag failing closed, the triggers, the
 * Free Forever cap under concurrency, history, grants and search_path.
 *
 * It does NOT prove compatibility with the full production schema. The
 * repository cannot rebuild that locally: supabase/migrations is not a
 * replayable chain (no Supabase-format names, no config.toml, and replaying the
 * dated files onto the base schema fails in 41 of 69), and the documented way
 * to get the full schema is a dump from production. So the tables the
 * migration depends on are stubbed (tests/db/reminders/stub_schema.sql) with
 * the column types production uses, and full-schema validation must happen on
 * a staging copy.
 *
 * It also runs the shared scenario tables (tests/db/reminders/*Scenarios.json)
 * through the SQL functions; Jest runs the same tables through the TypeScript,
 * so the two cannot drift apart silently.
 *
 * Safety:
 *   - Never connects to Supabase, staging or production. It talks only to a
 *     container it starts itself, by name, and removes it afterwards.
 *   - Uses the Supabase Postgres image so the anon / authenticated /
 *     service_role roles and auth.uid() match production. It must already be
 *     present locally (REMINDERS_DB_IMAGE overrides); nothing is pulled.
 *
 * The concurrency test starts several sessions that each insert one reminder
 * into an empty Free Forever shop and hold their transaction open before
 * committing. With the cap's advisory lock exactly 3 may succeed. A negative
 * control then repeats it with the lock removed and expects MORE than 3, to
 * prove the test can see the race it is guarding against.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const IMAGE = process.env.REMINDERS_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.171';
const NAME = `rd1-reminders-dbtest-${process.pid}`;
const SESSIONS = 6;
const HOLD_SECONDS = 3;

function docker(args, input) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

function psql(sql, label) {
  const r = docker(['exec', '-i', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X',
    '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], sql);
  if (r.code !== 0) {
    console.error(r.out);
    throw new Error(`${label} failed`);
  }
  return r.out;
}

function scalar(sql) {
  const r = docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-tAc', sql]);
  if (r.code !== 0) throw new Error(r.out);
  return r.out.trim();
}

function session(shopId, ownerId, n) {
  const sql = [
    'BEGIN;',
    'SET LOCAL ROLE authenticated;',
    `SELECT set_config('request.jwt.claim.sub', '${ownerId}', true);`,
    `INSERT INTO public.shop_reminders (shop_id, title, due_at) VALUES ('${shopId}', 'race ${n}', now());`,
    `SELECT pg_sleep(${HOLD_SECONDS});`,
    'COMMIT;',
  ].join(' ');
  return new Promise(resolveSession => {
    const child = spawn('docker', ['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X',
      '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'ignore' });
    child.on('close', code => resolveSession(code === 0));
  });
}

async function race(label, shopSuffix) {
  const shopId = `dddddddd-0000-0000-0000-0000000000${shopSuffix}`;
  const ownerId = `eeeeeeee-0000-0000-0000-0000000000${shopSuffix}`;
  psql(`
    INSERT INTO auth.users (id, email) VALUES ('${ownerId}', 'race-${shopSuffix}@test.local');
    INSERT INTO public.shops (id, name) VALUES ('${shopId}', 'Race ${shopSuffix}');
    INSERT INTO public.shop_users (shop_id, user_id, role) VALUES ('${shopId}', '${ownerId}', 'owner');
    INSERT INTO public.profiles (id, plan) VALUES ('${ownerId}', 'free');
  `, `${label} fixtures`);

  const results = await Promise.all(
    Array.from({ length: SESSIONS }, (_, i) => session(shopId, ownerId, i + 1)));
  const succeeded = results.filter(Boolean).length;
  const open = Number(scalar(
    `SELECT count(*) FROM public.shop_reminders WHERE shop_id = '${shopId}' AND status = 'open'`));
  return { succeeded, open };
}

function cleanup() {
  docker(['rm', '-f', NAME]);
}

async function main() {
  if (docker(['image', 'inspect', IMAGE]).code !== 0) {
    throw new Error(`Image ${IMAGE} is not present locally. This runner never pulls images.`);
  }

  const started = docker(['run', '-d', '--name', NAME, '-e', 'POSTGRES_PASSWORD=local-throwaway', IMAGE]);
  if (started.code !== 0) throw new Error(started.out);

  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    ready = docker(['exec', NAME, 'pg_isready', '-U', 'postgres', '-h', 'localhost']).code === 0;
    if (!ready) await new Promise(r => setTimeout(r, 1000));
  }
  if (!ready) throw new Error('Postgres did not become ready');
  // pg_isready can pass during the image's init restart; confirm a query runs.
  for (let i = 0; i < 30; i++) {
    if (docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-tAc', 'select 1']).code === 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  const stub = readFileSync(resolve(here, 'reminders', 'stub_schema.sql'), 'utf8');
  const migration = readFileSync(resolve(root, 'supabase', 'migrations', '2026-09-29_internal_reminders.sql'), 'utf8');
  const tests = readFileSync(resolve(here, 'reminders', 'reminders.test.sql'), 'utf8');

  psql(stub, 'stub schema');
  console.log('✓ stub schema');

  const migrationOut = psql(migration, 'migration');
  console.log('✓ migration applied; its embedded checks:');
  console.log(migrationOut.split('\n').filter(l => l.includes('|') || /expect/i.test(l)).map(l => '    ' + l).join('\n'));

  // Re-running must be harmless (IF NOT EXISTS / OR REPLACE / ON CONFLICT).
  psql(migration, 'migration re-run');
  console.log('✓ migration re-run is idempotent');

  const testOut = psql(tests, 'behavioural tests');
  const passes = testOut.split('\n').filter(l => l.includes('PASS:'));
  for (const line of passes) console.log('  ' + line.replace(/^.*PASS:/, '✓'));
  if (!testOut.includes('ALL REMINDER DATABASE TESTS PASSED')) throw new Error('behavioural tests did not finish');
  console.log(`✓ ${passes.length} behavioural assertions passed`);

  // ── Shared scenario tables ────────────────────────────────────────────────
  const flagScenarios = JSON.parse(readFileSync(resolve(here, 'reminders', 'flagScenarios.json'), 'utf8')).scenarios;
  // The Jest side evaluates for USER, a technician in SHOP; these are that
  // user and those shops in the fixtures.
  const TOKENS = {
    SHOP: 'aaaaaaaa-0000-0000-0000-00000000000a',
    OTHER_SHOP: 'aaaaaaaa-0000-0000-0000-00000000000b',
    USER: '00000000-0000-0000-0000-000000000003',
    OTHER_USER: '00000000-0000-0000-0000-000000000004',
  };
  const lit = v => (v === undefined || v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
  const flagSql = flagScenarios.map(sc => [
    'BEGIN;',
    "DELETE FROM public.feature_flags WHERE flag_key = 'internal_reminders';",
    ...sc.rows.map(r => `INSERT INTO public.feature_flags (flag_key, enabled, scope, shop_id, user_id, role, environment) VALUES ('internal_reminders', ${r.enabled}, ${lit(r.scope)}, ${r.shop ? lit(TOKENS[r.shop]) + '::uuid' : 'NULL'}, ${r.user ? lit(TOKENS[r.user]) + '::uuid' : 'NULL'}, ${lit(r.role)}, ${lit(r.environment)});`),
    'SET LOCAL ROLE authenticated;',
    `SELECT set_config('request.jwt.claim.sub', '${TOKENS.USER}', true);`,
    `SELECT tests.ok(public.internal_reminders_enabled('${TOKENS.SHOP}') = ${sc.sql}, ${lit('flag scenario: ' + sc.name)});`,
    'ROLLBACK;',
  ].join('\n')).join('\n');
  const flagOut = psql(flagSql, 'flag scenarios');
  const flagPasses = flagOut.split('\n').filter(l => l.includes('PASS:')).length;
  if (flagPasses !== flagScenarios.length) throw new Error(`flag scenarios: ${flagPasses}/${flagScenarios.length}`);
  console.log(`✓ ${flagPasses} flag scenarios match the shared table (SQL side)`);

  const tierScenarios = JSON.parse(readFileSync(resolve(here, 'reminders', 'planTierScenarios.json'), 'utf8')).scenarios;
  const tierSql = tierScenarios.map((sc, i) => {
    const shop = `eeeeeeee-0000-0000-0000-${String(i).padStart(12, '0')}`;
    return [
      'BEGIN;',
      `INSERT INTO public.shops (id, name) VALUES ('${shop}', 'tier ${i}');`,
      ...sc.owners.map((o, j) => {
        const user = `ffffffff-0000-0000-${String(i).padStart(4, '0')}-${String(j).padStart(12, '0')}`;
        const trial = o.trialDays === null ? 'NULL' : `now() + interval '${o.trialDays} days'`;
        return `INSERT INTO auth.users (id, email) VALUES ('${user}', 'tier-${i}-${j}@test.local');
INSERT INTO public.shop_users (shop_id, user_id, role) VALUES ('${shop}', '${user}', 'owner');
INSERT INTO public.profiles (id, plan, trial_ends_at) VALUES ('${user}', ${lit(o.plan)}, ${trial});`;
      }),
      `SELECT tests.ok(public.reminder_plan_tier('${shop}') = '${sc.tier}', ${lit('tier scenario: ' + sc.name)});`,
      'ROLLBACK;',
    ].join('\n');
  }).join('\n');
  const tierOut = psql(tierSql, 'plan tier scenarios');
  const tierPasses = tierOut.split('\n').filter(l => l.includes('PASS:')).length;
  if (tierPasses !== tierScenarios.length) throw new Error(`tier scenarios: ${tierPasses}/${tierScenarios.length}`);
  console.log(`✓ ${tierPasses} plan-tier scenarios match the shared table (SQL side)`);

  const locked = await race('concurrency', '01');
  console.log(`  concurrency: ${locked.succeeded}/${SESSIONS} sessions committed, ${locked.open} open reminders`);
  if (locked.open !== 3 || locked.succeeded !== 3) {
    throw new Error('Free Forever cap is not race-safe: expected exactly 3');
  }
  console.log('✓ concurrent inserts into a Free Forever shop stop at exactly 3');

  // Negative control: the same guard with the advisory lock removed.
  const guard = /CREATE OR REPLACE FUNCTION public\.shop_reminders_guard\(\)[\s\S]*?END \$fn\$;/.exec(migration)?.[0];
  if (!guard || !guard.includes('pg_advisory_xact_lock')) throw new Error('could not locate the guard for the control');
  const unlocked = guard.replace(/PERFORM pg_advisory_xact_lock\([\s\S]*?\);/, '-- lock removed for the control');
  psql(unlocked, 'control guard');
  const control = await race('control', '02');
  console.log(`  control (no lock): ${control.succeeded}/${SESSIONS} committed, ${control.open} open`);
  psql(guard, 'restore guard');
  if (control.open <= 3) {
    throw new Error('control did not reproduce the race; the concurrency test is not sensitive enough');
  }
  console.log('✓ control without the lock overshoots the cap, so the test detects the race');

  console.log('\nALL REMINDER DATABASE CHECKS PASSED');
}

main()
  .then(() => { cleanup(); })
  .catch(err => {
    console.error('\n✗ ' + (err instanceof Error ? err.message : String(err)));
    cleanup();
    process.exit(1);
  });
