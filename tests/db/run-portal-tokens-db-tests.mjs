#!/usr/bin/env node
/**
 * Proves the customer portal database changes:
 *   supabase/migrations/2026-10-13_customer_portal_tokens.sql (+ _rollback)
 *   supabase/migrations/2026-10-13_revoke_client_truncate_customers_estimates.sql (+ _rollback)
 * against a THROWAWAY local Postgres container, then removes it.
 *
 *   npm run test:db:portal-tokens
 *
 * Stub tables shaped like production (customers.id text, estimates.customer_id
 * text, shop-scoped RLS policies). The Supabase image applies Supabase's
 * default grants, so anon/authenticated start with ALL (incl. TRUNCATE) on new
 * public tables — the same starting point the owner found on production.
 * Synthetic rows only. Never connects to Supabase; needs the Supabase Postgres
 * image locally (never pulls). Prints no token values.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const IMAGE = process.env.PORTAL_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.171';
const NAME = `rd1-portal-dbtest-${process.pid}`;
const mig = f => readFileSync(resolve(root, 'supabase/migrations', f), 'utf8');
const TOKENS = mig('2026-10-13_customer_portal_tokens.sql');
const TOKENS_RB = mig('2026-10-13_customer_portal_tokens_rollback.sql');
const TRUNC = mig('2026-10-13_revoke_client_truncate_customers_estimates.sql');
const TRUNC_RB = mig('2026-10-13_revoke_client_truncate_customers_estimates_rollback.sql');

const SHOP_A = '38d55fae-0000-4000-8000-00000000000a';
const SHOP_B = '90b72748-0000-4000-8000-00000000000b';

const docker = (args, input) => {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') };
};
const psqlArgs = ['exec', '-i', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'];
function psql(sql, label = 'sql') {
  const r = docker(psqlArgs, sql);
  if (r.code !== 0) { console.error(r.out); throw new Error(`${label} failed`); }
  return r.out;
}
/** Runs SQL expecting failure; returns the error text. */
function psqlFails(sql) {
  const r = docker(psqlArgs, sql);
  if (r.code === 0) throw new Error(`expected failure but succeeded: ${sql.trim().slice(0, 120)}`);
  return r.out;
}
function scalar(sql) {
  const r = docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-tAc', sql]);
  if (r.code !== 0) throw new Error(r.out);
  return r.out.trim();
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); console.log('✓ ' + msg); };

/** Client-role grants on a table, read from the catalog (information_schema hides PUBLIC). */
const clientGrants = (table) => scalar(`
  SELECT COALESCE(string_agg(g.role || ':' || a.privilege_type, ',' ORDER BY g.role, a.privilege_type), '')
    FROM pg_class c, LATERAL aclexplode(c.relacl) a,
         LATERAL (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS role) g
   WHERE c.oid = 'public.${table}'::regclass AND g.role IN ('PUBLIC', 'anon', 'authenticated')`);

const tokenDigest = () => scalar(`SELECT md5(string_agg(customer_id || '=' || token, ',' ORDER BY customer_id)) FROM public.customer_portal_tokens`);

function schema() {
  psql(`
    DROP TABLE IF EXISTS public.estimates, public.customers CASCADE;
    CREATE OR REPLACE FUNCTION public.my_shop_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$ SELECT ARRAY['${SHOP_A}'::uuid] $$;
    CREATE TABLE public.customers (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name text, shop_id uuid
    );
    CREATE TABLE public.estimates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id text REFERENCES public.customers(id),
      shop_id uuid, status text, approved_date timestamptz
    );
    ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
    -- As on production: authenticated, shop-scoped. No anon policy.
    CREATE POLICY customers_shop_scoped ON public.customers FOR ALL TO authenticated
      USING (shop_id = ANY (public.my_shop_ids())) WITH CHECK (shop_id = ANY (public.my_shop_ids()));
    CREATE POLICY estimates_shop_scoped ON public.estimates FOR ALL TO authenticated
      USING (shop_id = ANY (public.my_shop_ids())) WITH CHECK (shop_id = ANY (public.my_shop_ids()));
    GRANT EXECUTE ON FUNCTION public.my_shop_ids() TO authenticated;

    INSERT INTO public.customers (id, name, shop_id) VALUES
      ('c-existing-1', 'Synthetic One',   '${SHOP_A}'),
      ('c-existing-2', 'Synthetic Two',   '${SHOP_A}'),
      ('c-other-shop', 'Synthetic Three', '${SHOP_B}');
    INSERT INTO public.estimates (id, customer_id, shop_id, status) VALUES
      ('11111111-1111-4111-8111-111111111111', 'c-existing-1', '${SHOP_A}', 'Sent'),
      ('22222222-2222-4222-8222-222222222222', 'c-existing-2', '${SHOP_A}', 'Sent'),
      ('33333333-3333-4333-8333-333333333333', 'c-existing-1', '${SHOP_B}', 'Sent');
  `, 'schema');
}

/** Two sessions race the conditional update the estimate route issues. */
function raceUpdate() {
  const stmt = (status, hold) => `
    BEGIN;
    UPDATE public.estimates SET status = '${status}'
     WHERE id = '11111111-1111-4111-8111-111111111111' AND customer_id = 'c-existing-1'
       AND shop_id = '${SHOP_A}' AND status IN ('Sent', 'Pending');
    ${hold ? 'SELECT pg_sleep(1.5);' : ''}
    COMMIT;`;
  const run = (sql) => new Promise(res => {
    const p = spawn('docker', ['exec', '-i', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-v', 'ON_ERROR_STOP=1', '-f', '-']);
    let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
    p.on('close', () => res(out)); p.stdin.end(sql);
  });
  const first = run(stmt('Approved', true));
  return new Promise(r => setTimeout(r, 400)).then(() => Promise.all([first, run(stmt('Declined', false))]));
}

async function suite() {
  schema();

  // ── Starting point mirrors production ──────────────────────────────────
  assert(/anon:TRUNCATE/.test(clientGrants('customers')), 'baseline: anon holds TRUNCATE on customers (Supabase default grants, as on production)');
  assert(/anon:TRUNCATE/.test(clientGrants('estimates')), 'baseline: anon holds TRUNCATE on estimates');

  // ── Token migration ───────────────────────────────────────────────────
  psql(TOKENS, 'token migration');
  assert(scalar(`SELECT count(*) FROM public.customer_portal_tokens`) === '3', 'backfill: every existing customer has a token');
  assert(scalar(`SELECT count(*) FROM public.customer_portal_tokens WHERE token !~ '^[0-9a-f]{64}$'`) === '0', 'every token is 64 lowercase hex');
  assert(scalar(`SELECT count(DISTINCT token) FROM public.customer_portal_tokens`) === '3', 'tokens are distinct');
  assert(scalar(`SELECT indisunique FROM pg_index WHERE indexrelid = 'public.customer_portal_tokens_token_key'::regclass`) === 't', 'a unique index enforces token uniqueness');
  psqlFails(`INSERT INTO public.customer_portal_tokens SELECT 'c-other-shop', token FROM public.customer_portal_tokens WHERE customer_id = 'c-existing-1';`);
  console.log('✓ a duplicate token is rejected');

  // Randomness sanity on 2,000 tokens. Each token is two UUIDv4s, which fix
  // 4 of the 64 characters (the version '4' at 13 and 45, a variant digit
  // 8-b at 17 and 49, 1-based): 60 random hex chars = 240 bits, plus 2 random
  // bits in each variant digit = 244. The other 60 positions must be uniform.
  const gen = scalar(`
    WITH t AS (SELECT public.new_customer_portal_token() AS tok FROM generate_series(1, 2000)),
         ch AS (SELECT substr(tok, p, 1) AS c, p FROM t, generate_series(1, 64) p)
    SELECT (SELECT count(DISTINCT tok) FROM t) || ',' ||
           (SELECT bool_and(c = '4') FROM ch WHERE p IN (13, 45)) || ',' ||
           (SELECT bool_and(c IN ('8','9','a','b')) FROM ch WHERE p IN (17, 49)) || ',' ||
           (SELECT max(n) - min(n) FROM (SELECT count(*) n FROM ch WHERE p NOT IN (13, 17, 45, 49) GROUP BY c) s) || ',' ||
           (SELECT count(DISTINCT c) FROM ch WHERE p NOT IN (13, 17, 45, 49))`);
  const [distinct, version, variant, spread, symbols] = gen.split(',');
  assert(Number(distinct) === 2000, 'generator: 2,000 tokens, no repeats');
  assert(version === 'true' && variant === 'true', 'generator: only the 4 UUID-structure characters are fixed, as documented (244 random bits)');
  // 120,000 random characters over 16 symbols: 7,500 each, sd ≈ 84. A 1,000 spread is >5 sd from expected.
  assert(Number(symbols) === 16 && Number(spread) < 1000, `generator: the other 60 positions use all 16 hex digits evenly (max-min count ${spread})`);

  // ── Provisioning for new and imported customers ───────────────────────
  psql(`
    SET ROLE authenticated;
    INSERT INTO public.customers (name, shop_id) VALUES ('Synthetic New', '${SHOP_A}');
    RESET ROLE;`, 'staff insert');
  assert(scalar(`SELECT count(*) FROM public.customers c JOIN public.customer_portal_tokens t ON t.customer_id = c.id WHERE c.name = 'Synthetic New'`) === '1',
    'a customer created by staff (authenticated role) gets a token from the trigger');
  psql(`
    SET ROLE authenticated;
    INSERT INTO public.customers (name, shop_id) SELECT 'Synthetic Import ' || g, '${SHOP_A}' FROM generate_series(1, 200) g;
    RESET ROLE;`, 'bulk import');
  assert(scalar(`SELECT count(*) FROM public.customers c LEFT JOIN public.customer_portal_tokens t ON t.customer_id = c.id WHERE t.token IS NULL`) === '0',
    'a 200-row import: every imported customer has a token');

  // ── Re-running preserves tokens ───────────────────────────────────────
  const before = tokenDigest();
  psql(TOKENS, 'token migration re-run');
  assert(tokenDigest() === before, 're-running the migration keeps every existing token unchanged');
  assert(scalar(`SELECT count(*) FROM pg_trigger WHERE tgname = 'customers_provision_portal_token'`) === '1', 're-running creates no duplicate trigger');

  // ── A provisioning failure never blocks a customer save ───────────────
  psql(`ALTER TABLE public.customer_portal_tokens ADD CONSTRAINT boom CHECK (false) NOT VALID;`, 'inject failure');
  const warn = docker(psqlArgs, `SET ROLE authenticated; INSERT INTO public.customers (id, name, shop_id) VALUES ('c-no-token', 'Synthetic Unlucky', '${SHOP_A}'); RESET ROLE;`);
  psql(`ALTER TABLE public.customer_portal_tokens DROP CONSTRAINT boom;`, 'remove failure');
  assert(warn.code === 0 && scalar(`SELECT count(*) FROM public.customers WHERE id = 'c-no-token'`) === '1', 'customer is still saved when token provisioning fails');
  assert(/saved without a portal token/.test(warn.out) && !/[0-9a-f]{64}/.test(warn.out), 'the failure raises a WARNING naming the customer, with no token in it');
  assert(scalar(`SELECT count(*) FROM public.customer_portal_tokens WHERE customer_id = 'c-no-token'`) === '0', '…and that customer simply has no token yet (the staff link route provisions it)');

  // ── Client roles cannot see or touch tokens ───────────────────────────
  assert(clientGrants('customer_portal_tokens') === '', 'catalog: no PUBLIC/anon/authenticated grant on customer_portal_tokens');
  assert(scalar(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.customer_portal_tokens'::regclass`) === 't', 'RLS is on for customer_portal_tokens');
  assert(scalar(`SELECT count(*) FROM pg_policies WHERE tablename = 'customer_portal_tokens'`) === '0', 'and it has no policies');
  for (const role of ['anon', 'authenticated']) {
    assert(/permission denied/.test(psqlFails(`SET ROLE ${role}; SELECT count(*) FROM public.customer_portal_tokens;`)), `${role} cannot read customer_portal_tokens`);
    assert(/permission denied/.test(psqlFails(`SET ROLE ${role}; INSERT INTO public.customer_portal_tokens VALUES ('c-existing-1', repeat('a', 64));`)), `${role} cannot write customer_portal_tokens`);
    assert(/permission denied/.test(psqlFails(`SET ROLE ${role}; SELECT public.new_customer_portal_token();`)), `${role} cannot call the token generator`);
  }
  assert(scalar(`SET ROLE service_role; SELECT count(*) > 0 FROM public.customer_portal_tokens;`).endsWith('t'), 'service_role (the server) can read tokens');

  // ── What the server adapters do, as service_role ──────────────────────
  const tok1 = scalar(`SELECT token FROM public.customer_portal_tokens WHERE customer_id = 'c-existing-1'`);
  assert(scalar(`SET ROLE service_role; SELECT customer_id FROM public.customer_portal_tokens WHERE token = '${tok1}';`).endsWith('c-existing-1'), 'adapter: a token resolves to exactly its customer');
  assert(scalar(`SET ROLE service_role; SELECT count(*) FROM public.customer_portal_tokens WHERE token = '${'f'.repeat(64)}';`).endsWith('0'), 'adapter: an unknown token resolves to nothing');
  const crossShop = scalar(`SET ROLE service_role; WITH u AS (UPDATE public.estimates SET status = 'Approved'
      WHERE id = '33333333-3333-4333-8333-333333333333' AND customer_id = 'c-existing-1' AND shop_id = '${SHOP_A}'
        AND status IN ('Sent','Pending') RETURNING 1) SELECT count(*) FROM u;`);
  assert(crossShop.endsWith('0'), 'adapter: the scoped update cannot touch the same customer id under another shop');
  const [s1, s2] = await raceUpdate();
  const won = [s1, s2].map(o => (o.match(/UPDATE (\d)/) ?? [])[1]);
  assert(won.sort().join(',') === '0,1', `adapter: two concurrent answers — exactly one updates (UPDATE ${won.join(' / UPDATE ')})`);
  assert(scalar(`SELECT status FROM public.estimates WHERE id = '11111111-1111-4111-8111-111111111111'`) === 'Approved', '…and the first answer stands');

  // ── Anon cannot read customers or change estimates (RLS, no anon policy) ─
  assert(scalar(`SET ROLE anon; SELECT count(*) FROM public.customers;`).endsWith('0'), 'anon reads no customer rows');
  assert(scalar(`SET ROLE anon; WITH u AS (UPDATE public.estimates SET status = 'Declined' RETURNING 1) SELECT count(*) FROM u;`).endsWith('0'), 'anon updates no estimates');

  // ── TRUNCATE hardening ────────────────────────────────────────────────
  psql(TRUNC, 'truncate revoke');
  for (const t of ['customers', 'estimates']) {
    assert(!/TRUNCATE/.test(clientGrants(t)), `catalog: no client role holds TRUNCATE on ${t}`);
    assert(/permission denied/.test(psqlFails(`SET ROLE anon; TRUNCATE public.${t} CASCADE;`)), `anon TRUNCATE ${t} is refused (disposable local table)`);
  }
  assert(/SELECT/.test(clientGrants('customers')) && /INSERT/.test(clientGrants('estimates')), 'other client grants are untouched (RLS still governs them)');
  psql(`SET ROLE authenticated; INSERT INTO public.customers (name, shop_id) VALUES ('Synthetic After Revoke', '${SHOP_A}'); UPDATE public.estimates SET status = 'Pending' WHERE id = '22222222-2222-4222-8222-222222222222'; RESET ROLE;`, 'staff after revoke');
  console.log('✓ staff can still create customers and update estimates after the revoke');
  psql(TRUNC, 'truncate revoke re-run');
  console.log('✓ the revoke migration is re-runnable');

  // ── Rollbacks ─────────────────────────────────────────────────────────
  psql(TRUNC_RB, 'truncate rollback');
  assert(/anon:TRUNCATE/.test(clientGrants('customers')) && !/PUBLIC:TRUNCATE/.test(clientGrants('customers')), 'truncate rollback restores exactly the anon/authenticated grant');
  psql(TRUNC, 'truncate re-apply');

  const customersBefore = scalar(`SELECT count(*) FROM public.customers`);
  psql(TOKENS_RB, 'token rollback');
  assert(scalar(`SELECT to_regclass('public.customer_portal_tokens') IS NULL`) === 't', 'token rollback removes the table');
  assert(scalar(`SELECT count(*) FROM pg_trigger WHERE tgname = 'customers_provision_portal_token'`) === '0', 'and the trigger');
  assert(scalar(`SELECT count(*) FROM pg_proc WHERE proname IN ('new_customer_portal_token', 'provision_customer_portal_token')`) === '0', 'and both functions');
  assert(scalar(`SELECT count(*) FROM public.customers`) === customersBefore, 'customers are untouched by the rollback');
  psql(`SET ROLE authenticated; INSERT INTO public.customers (name, shop_id) VALUES ('Synthetic After Rollback', '${SHOP_A}'); RESET ROLE;`, 'staff after rollback');
  console.log('✓ staff can still create customers after the rollback');
  psql(TOKENS_RB, 'token rollback re-run');
  console.log('✓ the rollback is re-runnable');
}

async function main() {
  if (docker(['image', 'inspect', IMAGE]).code !== 0) throw new Error(`Image ${IMAGE} not present locally; this runner never pulls.`);
  const s = docker(['run', '-d', '--name', NAME, '-e', 'POSTGRES_PASSWORD=local-throwaway', IMAGE]);
  if (s.code !== 0) throw new Error(s.out);
  for (let i = 0; i < 90; i++) {
    if (docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-tAc', 'select 1']).code === 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  await suite();
  console.log('\nALL PORTAL TOKEN DATABASE CHECKS PASSED');
}

main().then(() => docker(['rm', '-f', NAME])).catch(e => {
  console.error('\n✗ ' + (e instanceof Error ? e.message : String(e)));
  docker(['rm', '-f', NAME]);
  process.exit(1);
});
