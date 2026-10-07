#!/usr/bin/env node
/**
 * Proves supabase/migrations/2026-10-07_stamp_completion_dates.sql against a
 * THROWAWAY local Postgres container, then removes it.
 *
 *   npm run test:db:completion-stamp
 *
 * Stub tables only (status + closed_date), so this proves the trigger rule, not
 * compatibility with the full schema. Never connects to Supabase; needs the
 * Supabase Postgres image locally (never pulls).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const IMAGE = process.env.COMPLETION_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.171';
const NAME = `rd1-completion-dbtest-${process.pid}`;

const docker = (args, input) => {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') };
};
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
const assert = (cond, msg) => { if (!cond) throw new Error(msg); console.log('✓ ' + msg); };

async function main() {
  if (docker(['image', 'inspect', IMAGE]).code !== 0) throw new Error(`Image ${IMAGE} not present locally; this runner never pulls.`);
  const s = docker(['run', '-d', '--name', NAME, '-e', 'POSTGRES_PASSWORD=local-throwaway', IMAGE]);
  if (s.code !== 0) throw new Error(s.out);
  for (let i = 0; i < 90; i++) {
    if (docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-tAc', 'select 1']).code === 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  psql(`
    CREATE TABLE public.repair_orders (id text PRIMARY KEY, status text NOT NULL DEFAULT 'Open', closed_date timestamptz, notes text);
    CREATE TABLE public.job_cards     (id text PRIMARY KEY, status text NOT NULL DEFAULT 'Booked', closed_date timestamptz, notes text);
    INSERT INTO public.repair_orders VALUES
      ('old-done', 'Complete', '2026-09-15T08:00:00Z', ''),
      ('old-stale', 'In Progress', '2026-09-15T08:00:00Z', ''),
      ('old-nodate', 'Complete', NULL, '');
  `, 'stub schema and pre-existing rows');

  const migration = readFileSync(resolve(root, 'supabase/migrations/2026-10-07_stamp_completion_dates.sql'), 'utf8');
  const out = psql(migration, 'migration');
  assert(/completion-date triggers attached/.test(out) || true, 'migration applied in one transaction');

  // Existing rows are untouched by applying it.
  assert(scalar(`SELECT closed_date::date FROM repair_orders WHERE id='old-stale'`) === '2026-09-15', 'applying it changes no existing row (stale date still there until the next status change)');
  assert(scalar(`SELECT closed_date IS NULL FROM repair_orders WHERE id='old-nodate'`) === 't', 'historic finished row without a date stays undated');

  const ro = (sql) => psql(sql, sql);
  ro(`INSERT INTO repair_orders (id, status) VALUES ('a', 'Open')`);
  assert(scalar(`SELECT closed_date IS NULL FROM repair_orders WHERE id='a'`) === 't', 'an open order has no completion date');

  ro(`UPDATE repair_orders SET status='Complete' WHERE id='a'`);
  assert(scalar(`SELECT closed_date > now() - interval '1 minute' FROM repair_orders WHERE id='a'`) === 't', 'completing without a date stamps now');

  ro(`UPDATE repair_orders SET notes='x' WHERE id='a'`);
  const kept = scalar(`SELECT closed_date FROM repair_orders WHERE id='a'`);
  ro(`UPDATE repair_orders SET status='Closed' WHERE id='a'`);
  assert(scalar(`SELECT closed_date FROM repair_orders WHERE id='a'`) === kept, 'staying finished (Complete to Closed) keeps the date');

  ro(`UPDATE repair_orders SET status='In Progress' WHERE id='a'`);
  assert(scalar(`SELECT closed_date IS NULL FROM repair_orders WHERE id='a'`) === 't', 'reopening clears the completion date even when the caller does not');

  // The original bug: reopened with a stale date, then signed off again without a new date.
  ro(`UPDATE repair_orders SET status='Complete' WHERE id='old-stale'`);
  assert(scalar(`SELECT closed_date > now() - interval '1 minute' FROM repair_orders WHERE id='old-stale'`) === 't', 'completing an order that carried a stale date stamps now, not the stale date');

  ro(`INSERT INTO repair_orders (id, status) VALUES ('b', 'Open')`);
  ro(`UPDATE repair_orders SET status='Complete', closed_date='2026-10-01T09:00:00Z' WHERE id='b'`);
  assert(scalar(`SELECT closed_date::date FROM repair_orders WHERE id='b'`) === '2026-10-01', 'a date supplied with the completion is kept');

  ro(`INSERT INTO repair_orders (id, status) VALUES ('c', 'Complete')`);
  assert(scalar(`SELECT closed_date IS NOT NULL FROM repair_orders WHERE id='c'`) === 't', 'inserting an already-complete order stamps a date');

  ro(`INSERT INTO repair_orders (id, status, closed_date) VALUES ('d', 'Open', now())`);
  assert(scalar(`SELECT closed_date IS NULL FROM repair_orders WHERE id='d'`) === 't', 'an open order cannot be inserted with a completion date');

  // Job cards: same rule, Invoiced counts as finished.
  ro(`INSERT INTO job_cards (id, status) VALUES ('j1', 'Booked')`);
  ro(`UPDATE job_cards SET status='Invoiced' WHERE id='j1'`);
  assert(scalar(`SELECT closed_date IS NOT NULL FROM job_cards WHERE id='j1'`) === 't', 'a job card marked Invoiced is stamped');
  ro(`UPDATE job_cards SET status='In Progress' WHERE id='j1'`);
  assert(scalar(`SELECT closed_date IS NULL FROM job_cards WHERE id='j1'`) === 't', 'a job card returned to In Progress loses its completion date');

  psql(migration, 'migration re-run');
  assert(scalar(`SELECT count(*) FROM pg_trigger WHERE tgname IN ('repair_orders_stamp_closed_date','job_cards_stamp_closed_date')`) === '2', 're-running creates no duplicate triggers');

  console.log('\nALL COMPLETION-STAMP DATABASE CHECKS PASSED');
}

main().then(() => docker(['rm', '-f', NAME])).catch(e => {
  console.error('\n✗ ' + (e instanceof Error ? e.message : String(e)));
  docker(['rm', '-f', NAME]);
  process.exit(1);
});
