#!/usr/bin/env node
/**
 * Runs the trial-tips migration and its tests against a THROWAWAY local
 * Postgres container, then removes it.
 *
 *   npm run test:db:trial-tips
 *
 * Never connects to Supabase, staging or production. Uses the Supabase
 * Postgres image already present locally (never pulled) so auth.users, the
 * anon / authenticated / service_role roles and auth.uid() are real.
 *
 * Proves the migration's own logic: consent, eligibility, step windows,
 * claiming, suppression, webhook dedupe, access. It does NOT prove
 * compatibility with the full production schema — the repository cannot
 * rebuild that locally — so the dependent tables are stubbed with production's
 * column types (tests/db/trial-tips/stub_schema.sql).
 *
 * Also:
 *   - atomicity: the migration made to fail at its last statement leaves nothing;
 *   - re-running the identical file changes nothing it installed;
 *   - concurrency: several sessions claim the same send at once; exactly one wins.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const IMAGE = process.env.REMINDERS_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.171';
const NAME = `rd1-trial-tips-dbtest-${process.pid}`;
const SESSIONS = 6;

function docker(args, input) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') };
}
function psql(sql, label) {
  const r = docker(['exec', '-i', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], sql);
  if (r.code !== 0) { console.error(r.out); throw new Error(`${label} failed`); }
  return r.out;
}
function scalar(sql) {
  const r = docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-tAc', sql]);
  if (r.code !== 0) throw new Error(r.out);
  return r.out.trim();
}
function claimSession(user, step, now) {
  // Each session holds its transaction open so the others really overlap.
  const sql = `BEGIN; SET LOCAL ROLE service_role;
    SELECT 'CLAIM=' || public.trial_tips_claim('${user}', '${step}', '${now}');
    SELECT pg_sleep(2); COMMIT;`;
  return new Promise(res => {
    let out = '';
    const child = spawn('docker', ['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-tA', '-v', 'ON_ERROR_STOP=1', '-c', sql]);
    child.stdout.on('data', d => { out += d; });
    child.on('close', () => res(/CLAIM=true/.test(out)));
  });
}
const cleanup = () => docker(['rm', '-f', NAME]);

async function main() {
  if (docker(['image', 'inspect', IMAGE]).code !== 0) throw new Error(`Image ${IMAGE} is not present locally. This runner never pulls images.`);
  const started = docker(['run', '-d', '--name', NAME, '-e', 'POSTGRES_PASSWORD=local-throwaway', IMAGE]);
  if (started.code !== 0) throw new Error(started.out);
  for (let i = 0; i < 60; i++) {
    if (docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-tAc', 'select 1']).code === 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  const stub = readFileSync(resolve(here, 'trial-tips', 'stub_schema.sql'), 'utf8');
  const migration = readFileSync(resolve(root, 'supabase', 'migrations', '2026-09-30_trial_tips_email.sql'), 'utf8');
  const tests = readFileSync(resolve(here, 'trial-tips', 'trial_tips.test.sql'), 'utf8');

  // auth.users here lacks GoTrue's email_confirmed_at (see stub_schema.sql).
  // Only the image's superuser, over the local socket, may alter it.
  const authCol = docker(['exec', NAME, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-tAc',
    'ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ;']);
  if (authCol.code !== 0) throw new Error('could not add email_confirmed_at to the throwaway auth.users: ' + authCol.out);

  psql(stub, 'stub schema');
  console.log('✓ stub schema');

  // Atomicity: the real file with one failing statement injected just before
  // its only COMMIT — after every table, function and grant has been created.
  if (migration.split('\nCOMMIT;').length !== 2) throw new Error('expected exactly one COMMIT in the migration');
  const poisoned = migration.replace('\nCOMMIT;', "\nSELECT 1 / 0 AS injected_failure;\nCOMMIT;");
  const failed = docker(['exec', '-i', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], poisoned);
  if (failed.code === 0 || !/division by zero/.test(failed.out)) {
    console.error(`psql exit ${failed.code}:\n` + failed.out.slice(-1500));
    throw new Error('atomicity test: expected the injected failure (the migration failed earlier — see above)');
  }
  const left = scalar(`SELECT (SELECT count(*) FROM pg_tables WHERE tablename IN ('trial_tip_subscriptions','trial_tip_consent_events','trial_tip_sends','resend_webhook_events'))
    + (SELECT count(*) FROM pg_proc WHERE proname LIKE 'trial_tips_%' OR proname LIKE 'resend_webhook_%')`);
  if (left !== '0') throw new Error(`atomicity test: ${left} objects left behind`);
  console.log('✓ a migration that fails part-way leaves nothing behind (one transaction)');

  const out = psql(migration, 'migration');
  console.log('✓ migration applied; its checks:');
  console.log(out.split('\n').filter(l => l.includes('|') && !l.includes('check_name')).map(l => '    ' + l.trim()).join('\n'));

  const fingerprint = () => scalar(`SELECT md5(concat_ws('|',
    (SELECT string_agg(proname || md5(prosrc) || coalesce(proconfig::text,'') || coalesce(proacl::text,''), ',' ORDER BY proname)
       FROM pg_proc WHERE proname LIKE 'trial_tips_%' OR proname LIKE 'resend_webhook_%'),
    (SELECT string_agg(relname || coalesce(relacl::text,'') || relrowsecurity::text, ',' ORDER BY relname)
       FROM pg_class WHERE relname IN ('trial_tip_subscriptions','trial_tip_consent_events','trial_tip_sends','resend_webhook_events')),
    (SELECT string_agg(indexdef, ',' ORDER BY indexname) FROM pg_indexes WHERE tablename LIKE 'trial_tip%' OR tablename = 'resend_webhook_events')))`);
  const before = fingerprint();
  psql(migration, 'migration re-run');
  if (fingerprint() !== before) throw new Error('re-running the identical migration changed what it installed');
  console.log('✓ re-running the identical file changes nothing');

  const testOut = psql(tests, 'behavioural tests');
  const passes = testOut.split('\n').filter(l => l.includes('PASS:'));
  for (const l of passes) console.log('  ' + l.replace(/^.*PASS:/, '✓'));
  if (!testOut.includes('ALL TRIAL TIPS DATABASE TESTS PASSED')) throw new Error('behavioural tests did not finish');
  console.log(`✓ ${passes.length} behavioural assertions passed`);

  // Concurrency: a fresh due person, six overlapping claims for one send.
  psql(`SELECT tests.person('20000000-0000-4000-8000-000000000001', 'race@test.local', true, 'trial', '1 hour', 'Race');
        SELECT public.trial_tips_record_consent('20000000-0000-4000-8000-000000000001', 'v1', 'signup', now());`, 'race fixture');
  const now = scalar(`SELECT tests.now()`);
  const results = await Promise.all(Array.from({ length: SESSIONS }, () =>
    claimSession('20000000-0000-4000-8000-000000000001', 'first_job', now)));
  const winners = results.filter(Boolean).length;
  const rows = scalar(`SELECT count(*) FROM public.trial_tip_sends WHERE user_id = '20000000-0000-4000-8000-000000000001'`);
  console.log(`  concurrency: ${winners}/${SESSIONS} overlapping claims won; ${rows} ledger row`);
  if (winners !== 1 || rows !== '1') throw new Error('overlapping runs could both claim the same send');
  console.log('✓ overlapping runs cannot both send the same email');

  console.log('\nALL TRIAL TIPS DATABASE CHECKS PASSED');
}

main().then(cleanup).catch(err => {
  console.error('\n✗ ' + (err instanceof Error ? err.message : String(err)));
  cleanup();
  process.exit(1);
});
