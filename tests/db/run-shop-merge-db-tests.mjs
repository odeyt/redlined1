#!/usr/bin/env node
/**
 * Behavioural tests for the D1 location merge SQL:
 *   supabase/migrations/2026-10-16_shop_merge_preflight.sql  (read-only)
 *   supabase/migrations/2026-10-16_shop_merge.sql            (the merge)
 *   supabase/migrations/2026-10-16_shop_merge_rollback.sql   (emergency recovery)
 * against a THROWAWAY local Postgres container, then removes it.
 *
 *   npm run test:db:shop-merge
 *
 * Every scenario starts from a fresh stub schema and runs the files exactly as
 * the owner would paste them into the SQL editor. RLS is exercised as real
 * `authenticated` sessions (auth.uid() from the JWT claim), using the shipped
 * shops archive migration and the shipped shop_mirrors read policy.
 *
 * What it does NOT prove: compatibility with the full production schema, which
 * this repository cannot rebuild (see run-reminders-db-tests.mjs). Production
 * triggers and policies on shop_users / shops are read by the preflight (Q5-Q8)
 * and must be reviewed before the merge runs.
 *
 * Never connects to Supabase; needs the Supabase Postgres image locally (never pulls).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const IMAGE = process.env.SHOP_MERGE_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.171';
const NAME = `rd1-shopmerge-dbtest-${process.pid}`;
const mig = f => readFileSync(resolve(root, 'supabase/migrations', f), 'utf8');

const PREFLIGHT = mig('2026-10-16_shop_merge_preflight.sql');
const APPLY = mig('2026-10-16_shop_merge.sql');
const ROLLBACK_LOCKED = mig('2026-10-16_shop_merge_rollback.sql');
const UNLOCK = `-- SELECT set_config('shop_merge.rollback', 'd1-location-merge-2026-10', true);`;
if (!ROLLBACK_LOCKED.includes(UNLOCK)) throw new Error('rollback unlock line not found — update this runner');
const ROLLBACK = ROLLBACK_LOCKED.replace(UNLOCK, UNLOCK.slice(3));
const ARCHIVE_COLUMNS = mig('2026-09-01_shops_archive_column.sql');
const MIRROR_POLICY = mig('2026-07-31_shop_mirrors_read_access.sql');

const D1 = '38d55fae-741b-4bac-b520-f96eed65bf38';
const L2 = '90b72748-bf01-4456-999f-f4ba48091606';
const OTHER = 'eeeeeeee-0000-4000-8000-00000000000e';
const U = {
  owner: 'a0000000-0000-4000-8000-000000000001', // owner of both, before the merge
  tech: 'b0000000-0000-4000-8000-000000000002',  // D1 Imports only
  adv: 'c0000000-0000-4000-8000-000000000003',   // Location 2 only
  stranger: 'd0000000-0000-4000-8000-000000000004', // another tenant
  late: 'f0000000-0000-4000-8000-000000000006',  // added after the merge
};

const docker = (args, input) => {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') };
};
const psqlRaw = sql => docker(['exec', '-i', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], sql);
function psql(sql, label = 'sql') {
  const r = psqlRaw(sql);
  if (r.code !== 0) { console.error(r.out); throw new Error(`${label} failed`); }
  return r.out;
}
function scalar(sql) {
  const r = docker(['exec', '-i', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-tA', '-f', '-'], sql);
  if (r.code !== 0) throw new Error(r.out);
  return r.out.trim();
}
/** A query run as a signed-in user, through RLS. */
function asUser(userId, sql) {
  return scalar(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub', '${userId}', true),
           set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true) \\g /dev/null
    ${sql};
    COMMIT;`);
}
let passed = 0;
const assert = (cond, msg) => { if (!cond) throw new Error(msg); passed++; console.log('✓ ' + msg); };

// Full membership rows, including created_at, so "restored exactly" means exactly.
const memberships = () => scalar(`SELECT coalesce(string_agg(format('%s|%s|%s|%s', shop_id, user_id, role, created_at), E'\\n' ORDER BY shop_id, user_id), '') FROM public.shop_users`);
const business = () => scalar(`
  SELECT string_agg(t || ':' || coalesce(shop_id::text, '-') || ':' || n, ',' ORDER BY t, shop_id) FROM (
    SELECT 'customers' t, shop_id, count(*) n FROM public.customers GROUP BY shop_id
    UNION ALL SELECT 'vehicles', shop_id, count(*) FROM public.vehicles GROUP BY shop_id
    UNION ALL SELECT 'job_cards', shop_id, count(*) FROM public.job_cards GROUP BY shop_id
    UNION ALL SELECT 'repair_orders', shop_id, count(*) FROM public.repair_orders GROUP BY shop_id
    UNION ALL SELECT 'estimates', shop_id, count(*) FROM public.estimates GROUP BY shop_id
    UNION ALL SELECT 'invoices', shop_id, count(*) FROM public.invoices GROUP BY shop_id
    UNION ALL SELECT 'payments', shop_id, count(*) FROM public.payments GROUP BY shop_id) x`);
const archiveOf = id => scalar(`SELECT coalesce(archived_at::text, 'active') || '|' || coalesce(archived_reason, '') FROM public.shops WHERE id = '${id}'`);
const ledger = () => scalar(`SELECT to_regclass('public.shop_merge_ledger') IS NULL`) === 't'
  ? 'none'
  : scalar(`SELECT coalesce(string_agg(kind || ':' || status, ',' ORDER BY kind, status), '') FROM public.shop_merge_ledger`);
const countWhere = sql => Number(scalar(`SELECT count(*) FROM ${sql}`));
const ledgerId = (shop, user) => scalar(`SELECT id FROM public.shop_merge_ledger WHERE kind = 'membership' AND shop_id = '${shop}' AND user_id = '${user}' AND status = 'applied'`);

function reset({ mirror = true, d1Archived = null, l2Archived = false } = {}) {
  psql(`
    DROP TABLE IF EXISTS public.shop_merge_ledger, public.customers, public.vehicles, public.job_cards, public.repair_orders, public.estimates,
                         public.invoices, public.payments, public.shop_mirrors, public.shop_users,
                         public.shops CASCADE;
    DELETE FROM auth.users WHERE id IN ('${Object.values(U).join("','")}');

    CREATE TABLE public.shops (id uuid PRIMARY KEY, name text NOT NULL, created_at timestamptz DEFAULT now());
    CREATE TABLE public.shop_users (
      shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'owner',
      created_at timestamptz DEFAULT now(),
      PRIMARY KEY (shop_id, user_id));
    CREATE TABLE public.shop_mirrors (
      shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
      mirror_shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now(),
      PRIMARY KEY (shop_id, mirror_shop_id), CHECK (shop_id <> mirror_shop_id));
  `, 'base schema');
  psql(ARCHIVE_COLUMNS, 'shops archive migration');

  // The BEFORE UPDATE trigger production has on public.shops (preflight Q5/Q6,
  // 2026-10-17), copied verbatim from 2026-09-15_shops_is_synthetic.sql. The
  // merge's archive UPDATE fires it; it must let that through untouched.
  psql(`
    ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;
    CREATE OR REPLACE FUNCTION public.shops_guard_is_synthetic()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
        RETURN NEW;
      END IF;
      IF TG_OP = 'INSERT' AND NEW.is_synthetic THEN
        RAISE EXCEPTION 'shops.is_synthetic is platform-managed' USING ERRCODE = '42501';
      END IF;
      IF TG_OP = 'UPDATE' AND NEW.is_synthetic IS DISTINCT FROM OLD.is_synthetic THEN
        RAISE EXCEPTION 'shops.is_synthetic is platform-managed' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END
    $fn$;
    DROP TRIGGER IF EXISTS shops_guard_is_synthetic ON public.shops;
    CREATE TRIGGER shops_guard_is_synthetic
      BEFORE INSERT OR UPDATE ON public.shops
      FOR EACH ROW EXECUTE FUNCTION public.shops_guard_is_synthetic();
  `, 'production shops trigger');

  // Business tables, membership-scoped the way production's *_shop_scoped policies are.
  for (const t of ['customers', 'vehicles', 'job_cards', 'repair_orders', 'estimates', 'invoices', 'payments']) {
    psql(`
      CREATE TABLE public.${t} (id serial PRIMARY KEY, shop_id uuid NOT NULL REFERENCES public.shops(id), status text DEFAULT 'Open');
      ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY ${t}_shop_scoped ON public.${t} FOR ALL TO authenticated
        USING (shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()))
        WITH CHECK (shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()));
      GRANT SELECT, INSERT, UPDATE ON public.${t} TO authenticated;
      GRANT USAGE ON SEQUENCE public.${t}_id_seq TO authenticated;`, `${t} table`);
  }
  psql(`
    ALTER TABLE public.shop_users ENABLE ROW LEVEL SECURITY;
    CREATE POLICY shop_users_own ON public.shop_users FOR SELECT TO authenticated USING (user_id = auth.uid());
    GRANT SELECT ON public.shop_users, public.shops TO authenticated;

    INSERT INTO auth.users (id, email) VALUES
      ('${U.owner}', 'owner@d1.test'), ('${U.tech}', 'tech@d1.test'), ('${U.adv}', 'adv@d1.test'),
      ('${U.stranger}', 'stranger@other.test'), ('${U.late}', 'late@d1.test');
    INSERT INTO public.shops (id, name) VALUES
      ('${D1}', 'D1 Imports'), ('${L2}', 'D1 Imports - Location 2'), ('${OTHER}', 'Other Shop');
    INSERT INTO public.shop_users (shop_id, user_id, role, created_at) VALUES
      ('${D1}', '${U.owner}', 'owner', '2026-01-01T00:00:00Z'), ('${L2}', '${U.owner}', 'owner', '2026-01-02T00:00:00Z'),
      ('${D1}', '${U.tech}', 'technician', '2026-02-01T00:00:00Z'),
      ('${L2}', '${U.adv}', 'advisor', '2026-03-01T00:00:00Z'),
      ('${OTHER}', '${U.stranger}', 'owner', '2026-04-01T00:00:00Z');
    INSERT INTO public.customers (shop_id) VALUES ('${D1}'), ('${D1}'), ('${D1}'), ('${L2}'), ('${OTHER}');
    INSERT INTO public.vehicles (shop_id) VALUES ('${D1}'), ('${D1}'), ('${L2}');
    INSERT INTO public.job_cards (shop_id, status) VALUES ('${D1}', 'Closed'), ('${D1}', 'Open'), ('${L2}', 'Open');
    INSERT INTO public.repair_orders (shop_id, status) VALUES ('${D1}', 'Closed'), ('${L2}', 'In Progress');
    INSERT INTO public.estimates (shop_id, status) VALUES ('${D1}', 'Approved'), ('${D1}', 'Draft');
    INSERT INTO public.invoices (shop_id, status) VALUES ('${D1}', 'Paid'), ('${L2}', 'Paid');
    INSERT INTO public.payments (shop_id) VALUES ('${D1}'), ('${D1}'), ('${L2}');
  `, 'seed');
  if (mirror) psql(`INSERT INTO public.shop_mirrors (shop_id, mirror_shop_id) VALUES ('${D1}', '${L2}'), ('${L2}', '${D1}');`, 'mirrors');
  psql(MIRROR_POLICY, 'shop_mirrors read policy');
  if (d1Archived) psql(`UPDATE public.shops SET archived_at = '2026-05-01T00:00:00Z', archived_reason = '${d1Archived}' WHERE id = '${D1}'`);
  if (l2Archived) psql(`UPDATE public.shops SET archived_at = now(), archived_reason = 'x' WHERE id = '${L2}'`);
}

function scenario(title, fn) { console.log(`\n── ${title} ──`); fn(); }

async function main() {
  if (docker(['image', 'inspect', IMAGE]).code !== 0) throw new Error(`Image ${IMAGE} not present locally; this runner never pulls.`);
  const s = docker(['run', '-d', '--name', NAME, '-e', 'POSTGRES_PASSWORD=local-throwaway', IMAGE]);
  if (s.code !== 0) throw new Error(s.out);
  for (let i = 0; i < 90; i++) {
    if (docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-tAc', 'select 1']).code === 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  scenario('preflight is read-only', () => {
    reset();
    const before = memberships() + business() + archiveOf(D1) + ledger();
    const out = psql(PREFLIGHT, 'preflight');
    assert(/job_cards\s*\|\s*2\s*\|\s*1/.test(out), 'Q1 counts job cards per shop (2 at D1 Imports, 1 at Location 2)');
    assert(before === memberships() + business() + archiveOf(D1) + ledger(), 'running the whole preflight changes nothing');
  });

  scenario('merge: memberships, archive, history visible, nothing moved', () => {
    reset();
    const biz = business();
    assert(asUser(U.adv, `SELECT count(*) FROM public.customers WHERE shop_id = '${D1}'`) === '0', 'before: a Location 2-only advisor sees no D1 Imports customers');
    assert(asUser(U.adv, `SELECT count(*) FROM public.shop_mirrors`) === '0', 'before: …and cannot see the mirror link');
    psql(APPLY, 'merge');
    const m = memberships();
    assert(m.includes(`${L2}|${U.tech}|technician`), 'the D1-only technician joins Location 2 as technician');
    assert(m.includes(`${D1}|${U.adv}|advisor`), 'the Location 2-only advisor joins D1 Imports as advisor');
    assert(m.includes(`${D1}|${U.owner}|owner|2026-01-01`) && m.includes(`${L2}|${U.owner}|owner|2026-01-02`), "the owner's existing memberships are untouched");
    assert(m.includes(`${OTHER}|${U.stranger}|owner`) && countWhere(`public.shop_users WHERE user_id = '${U.stranger}'`) === 1, 'another tenant is untouched');
    assert(countWhere('public.shop_users') === 7, 'exactly 2 memberships added (5 -> 7)');
    assert(archiveOf(D1).startsWith('20') && archiveOf(D1).includes('merged into D1 Imports'), 'D1 Imports is archived with the merge reason');
    assert(archiveOf(L2).startsWith('active'), 'Location 2 stays active');
    assert(business() === biz, 'every business row keeps its shop_id (per-shop counts identical)');
    assert(countWhere('public.shop_mirrors') === 2, 'both mirror links remain');
    assert(ledger() === 'archive:applied,membership:applied,membership:applied', 'the ledger records 2 memberships and the archive');
    assert(asUser(U.adv, `SELECT count(*) FROM public.customers WHERE shop_id IN ('${D1}', '${L2}')`) === '4', 'after: the advisor sees D1 Imports and Location 2 customers (3 + 1)');
    assert(asUser(U.adv, `SELECT count(*) FROM public.shop_mirrors WHERE shop_id = '${L2}' AND mirror_shop_id = '${D1}'`) === '1', 'after: the advisor can read the Location 2 -> D1 Imports link (useShop builds the mirror scope from it)');
    assert(asUser(U.tech, `SELECT count(*) FROM public.job_cards WHERE shop_id = '${L2}'`) === '1', 'after: the former D1-only technician sees Location 2 work');
    assert(asUser(U.stranger, `SELECT count(*) FROM public.customers WHERE shop_id IN ('${D1}', '${L2}')`) === '0', 'after: another tenant still sees nothing of D1');
    // Supabase grants new public tables to authenticated by default; RLS with
    // no policy must still hide every row. Either outcome hides the ledger.
    let ledgerSeen;
    try { ledgerSeen = asUser(U.owner, `SELECT count(*) FROM public.shop_merge_ledger`); } catch (e) { ledgerSeen = /permission denied/.test(String(e)) ? '0' : String(e); }
    psql(`GRANT SELECT ON public.shop_merge_ledger TO authenticated`);
    assert(ledgerSeen === '0' && asUser(U.owner, `SELECT count(*) FROM public.shop_merge_ledger`) === '0', 'signed-in users read no ledger rows, even when granted SELECT (RLS, no policy)');
  });

  scenario('merge twice is a no-op', () => {
    reset();
    psql(APPLY, 'merge');
    const m = memberships(); const a = archiveOf(D1); const l = ledger();
    psql(APPLY, 'merge again');
    assert(memberships() === m, 'second run adds or changes no membership');
    assert(archiveOf(D1) === a, 'second run keeps the original archived_at');
    assert(ledger() === l, 'second run records nothing new');
  });

  scenario('merge refuses atomically', () => {
    reset({ mirror: false });
    const before = memberships() + archiveOf(D1);
    const r = psqlRaw(APPLY);
    assert(r.code !== 0 && /does not mirror D1 Imports/.test(r.out), 'without the Location 2 -> D1 Imports mirror the merge stops with a clear error');
    assert(memberships() + archiveOf(D1) === before && ledger() === 'none', '…and changes nothing: no membership, no archive, no ledger table');
    reset({ l2Archived: true });
    const r2 = psqlRaw(APPLY);
    assert(r2.code !== 0 && /Location 2 is archived/.test(r2.out) && ledger() === 'none', 'refuses when Location 2 itself is archived');
  });

  scenario('rollback is locked unless deliberately unlocked', () => {
    reset();
    psql(APPLY, 'merge');
    const after = memberships() + archiveOf(D1) + ledger();
    const r = psqlRaw(ROLLBACK_LOCKED);
    assert(r.code !== 0 && /rollback is locked/.test(r.out), 'the file as shipped refuses to run');
    assert(memberships() + archiveOf(D1) + ledger() === after, '…and changes nothing');
  });

  scenario('rollback of an untouched merge restores the exact prior state', () => {
    reset();
    const m0 = memberships(); const biz = business(); const a0 = archiveOf(D1);
    psql(APPLY, 'merge');
    psql(ROLLBACK, 'rollback');
    assert(memberships() === m0, 'memberships are exactly as before, created_at included');
    assert(archiveOf(D1) === a0, 'D1 Imports is active again');
    assert(business() === biz, 'no business row changed');
    assert(ledger() === 'archive:rolled_back,membership:rolled_back,membership:rolled_back', 'the ledger marks all three rolled back');
    psql(ROLLBACK, 'rollback again');
    assert(memberships() === m0 && ledger() === 'archive:rolled_back,membership:rolled_back,membership:rolled_back', 'a second rollback is a no-op');
    psql(APPLY, 'merge after rollback');
    assert(countWhere('public.shop_users') === 7 && archiveOf(D1).includes('merged into'), 'the merge can be applied again after a rollback');
    assert(countWhere(`public.shop_merge_ledger WHERE status = 'applied'`) === 3, '…recording fresh entries');
    psql(ROLLBACK, 'second rollback cycle');
    assert(memberships() === m0 && archiveOf(D1) === a0, 'and rolled back again, exactly');
  });

  scenario('rollback preserves memberships changed after the merge', () => {
    reset();
    psql(APPLY, 'merge');
    psql(`UPDATE public.shop_users SET role = 'manager' WHERE shop_id = '${L2}' AND user_id = '${U.tech}'`);
    const state = memberships() + archiveOf(D1) + ledger();
    const r = psqlRaw(ROLLBACK);
    const id = ledgerId(L2, U.tech);
    assert(r.code !== 0 && r.out.includes(`ledger id ${id}`) && /merge set role technician, now manager/.test(r.out), 'a role change aborts the rollback and names the row, the old and new role');
    assert(memberships() + archiveOf(D1) + ledger() === state, '…atomically: nothing deleted, D1 Imports still archived, ledger unchanged');
    psql(`UPDATE public.shop_merge_ledger SET status = 'kept_by_owner', resolved_at = now() WHERE id = ${id} AND status = 'applied'`, 'owner keeps the row');
    psql(ROLLBACK, 'rollback after resolution');
    assert(memberships().includes(`${L2}|${U.tech}|manager`), 'the kept row survives with its new role');
    assert(!memberships().includes(`${D1}|${U.adv}|`), 'the untouched merge membership is removed');
    assert(archiveOf(D1).startsWith('active'), 'D1 Imports is un-archived');
    assert(ledger() === 'archive:rolled_back,membership:kept_by_owner,membership:rolled_back', 'the ledger says kept_by_owner for that row, never rolled_back');
  });

  scenario('rollback detects delete + recreate and no-op rewrites', () => {
    reset();
    psql(APPLY, 'merge');
    // Recreated with the SAME role: role equality alone would wrongly delete it.
    psql(`DELETE FROM public.shop_users WHERE shop_id = '${D1}' AND user_id = '${U.adv}';
          INSERT INTO public.shop_users (shop_id, user_id, role) VALUES ('${D1}', '${U.adv}', 'advisor');`);
    // Rewritten with identical values (what an invite upsert does).
    psql(`UPDATE public.shop_users SET role = role WHERE shop_id = '${L2}' AND user_id = '${U.tech}'`);
    const state = memberships() + ledger();
    const r = psqlRaw(ROLLBACK);
    assert(r.code !== 0 && r.out.includes(`ledger id ${ledgerId(D1, U.adv)}`), 'a deleted-and-recreated membership (same role) is a conflict');
    assert(r.out.includes(`ledger id ${ledgerId(L2, U.tech)}`), 'a no-op rewrite of a membership is a conflict');
    assert(memberships() + ledger() === state, '…and nothing changed');
  });

  scenario('rollback when a merge membership is already gone', () => {
    reset();
    psql(APPLY, 'merge');
    psql(`DELETE FROM public.shop_users WHERE shop_id = '${D1}' AND user_id = '${U.adv}'`);
    psql(ROLLBACK, 'rollback');
    assert(ledger() === 'archive:rolled_back,membership:absent_at_rollback,membership:rolled_back', 'it is recorded absent_at_rollback, not rolled_back');
    assert(!memberships().includes(`${L2}|${U.tech}|`), 'the other merge membership is removed');
  });

  scenario('rollback never touches memberships the merge did not create', () => {
    reset();
    psql(APPLY, 'merge');
    psql(`INSERT INTO public.shop_users (shop_id, user_id, role) VALUES ('${L2}', '${U.late}', 'technician')`);
    psql(ROLLBACK, 'rollback');
    assert(countWhere(`public.shop_users WHERE user_id = '${U.late}'`) === 1, 'a membership added after the merge survives');
    assert(memberships().includes(`${D1}|${U.owner}|owner|2026-01-01`) && memberships().includes(`${D1}|${U.tech}|technician|2026-02-01`), 'pre-existing memberships survive unchanged');
  });

  scenario('archive: pre-merge state is preserved, later edits are conflicts', () => {
    reset({ d1Archived: 'closed earlier by hand' });
    const a0 = archiveOf(D1);
    psql(APPLY, 'merge on an already-archived D1 Imports');
    assert(archiveOf(D1) === a0, 'an archive that predates the merge is left exactly as it was');
    assert(ledger() === 'membership:applied,membership:applied', '…and is not recorded as the merge\'s');
    psql(ROLLBACK, 'rollback');
    assert(archiveOf(D1) === a0, 'rollback leaves that earlier archive in place');

    reset();
    psql(APPLY, 'merge');
    psql(`UPDATE public.shops SET archived_reason = 'edited later' WHERE id = '${D1}'`);
    const state = memberships() + archiveOf(D1);
    const r = psqlRaw(ROLLBACK);
    assert(r.code !== 0 && /archive shop 38d55fae/.test(r.out), 'an archive edited after the merge aborts the rollback');
    assert(memberships() + archiveOf(D1) === state, '…changing nothing');
  });

  scenario('time zone of the session does not cause false conflicts', () => {
    reset();
    const m0 = memberships();
    psql(`SET TimeZone = 'Asia/Vientiane';\n` + APPLY, 'merge in Asia/Vientiane');
    psql(`SET TimeZone = 'America/New_York';\n` + ROLLBACK, 'rollback in America/New_York');
    assert(memberships() === m0 && archiveOf(D1).startsWith('active'), 'merge and rollback in different session time zones still match');
  });

  console.log(`\nALL ${passed} SHOP-MERGE DATABASE CHECKS PASSED`);
}

main().then(() => docker(['rm', '-f', NAME])).catch(e => {
  console.error('\n✗ ' + (e instanceof Error ? e.message : String(e)));
  docker(['rm', '-f', NAME]);
  process.exit(1);
});
