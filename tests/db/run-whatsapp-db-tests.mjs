#!/usr/bin/env node
/**
 * Proves the WhatsApp Business database changes:
 *   supabase/migrations/2026-10-19_whatsapp_business.sql (+ _rollback)
 * against a THROWAWAY local Postgres container, then removes it.
 *
 *   npm run test:db:whatsapp
 *
 * The Supabase image applies Supabase's default grants, so anon/authenticated
 * start with ALL on new public tables — the same starting point as
 * production. Stub shops / feature_flags tables shaped like production.
 * Synthetic rows only. Never connects to Supabase; needs the Supabase Postgres
 * image locally (never pulls).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const IMAGE = process.env.WHATSAPP_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.171';
const NAME = `rd1-whatsapp-dbtest-${process.pid}`;
const mig = f => readFileSync(resolve(root, 'supabase/migrations', f), 'utf8');
const APPLY = mig('2026-10-19_whatsapp_business.sql');
const ROLLBACK_LOCKED = mig('2026-10-19_whatsapp_business_rollback.sql');
const UNLOCK = `-- SELECT set_config('whatsapp.rollback', 'confirmed', true);`;
if (!ROLLBACK_LOCKED.includes(UNLOCK)) throw new Error('rollback unlock line not found — update this runner');
const ROLLBACK = ROLLBACK_LOCKED.replace(UNLOCK, UNLOCK.slice(3));

const L2 = '90b72748-bf01-4456-999f-f4ba48091606';
const D1 = '38d55fae-741b-4bac-b520-f96eed65bf38';
const OWNER = 'a0000000-0000-4000-8000-000000000001';
const TABLES = ['whatsapp_connections', 'whatsapp_connection_secrets', 'whatsapp_templates', 'whatsapp_consents', 'whatsapp_consent_events', 'whatsapp_messages'];
const KEY = n => n.toString(16).padStart(64, '0');

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
function psqlFails(sql) {
  const r = docker(psqlArgs, sql);
  if (r.code === 0) throw new Error(`expected failure but succeeded: ${sql.trim().slice(0, 140)}`);
  return r.out;
}
function scalar(sql) {
  const r = docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-X', '-tAc', sql]);
  if (r.code !== 0) throw new Error(r.out);
  return r.out.trim();
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); console.log('✓ ' + msg); };

const clientGrants = (table) => scalar(`
  SELECT COALESCE(string_agg(g.role || ':' || a.privilege_type, ',' ORDER BY g.role, a.privilege_type), '')
    FROM pg_class c, LATERAL aclexplode(c.relacl) a,
         LATERAL (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS role) g
   WHERE c.oid = 'public.${table}'::regclass AND g.role IN ('PUBLIC', 'anon', 'authenticated')`);

function schema() {
  psql(`
    CREATE TABLE public.shops (id uuid PRIMARY KEY, name text, archived_at timestamptz);
    INSERT INTO public.shops (id, name, archived_at) VALUES ('${L2}', 'D1 Imports', NULL), ('${D1}', 'D1 Imports (closed)', now());
    CREATE TABLE public.feature_flags (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), flag_key text NOT NULL, display_name text, description text,
      enabled boolean NOT NULL DEFAULT false, scope text NOT NULL DEFAULT 'global', shop_id uuid, user_id uuid,
      role text, environment text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX feature_flags_unique_scope ON public.feature_flags
      (flag_key, scope, COALESCE(shop_id::text, ''), COALESCE(user_id::text, ''), COALESCE(role, ''), COALESCE(environment, ''));
    CREATE TABLE public.invoices (number text PRIMARY KEY, shop_id uuid, status text);
    INSERT INTO public.invoices VALUES ('INV-1', '${D1}', 'Sent');
  `, 'schema');
}

function suite() {
  schema();
  assert(/anon:SELECT/.test(clientGrants('invoices')), 'baseline: Supabase default grants give anon SELECT on a new public table');

  psql(APPLY, 'migration');
  assert(TABLES.every(t => scalar(`SELECT to_regclass('public.${t}') IS NOT NULL`) === 't'), 'all six WhatsApp tables exist');
  assert(scalar(`SELECT count(*) || ':' || bool_and(NOT enabled) || ':' || min(scope) || ':' || min(shop_id::text) FROM public.feature_flags WHERE flag_key = 'whatsapp_business'`) === `1:true:shop:${L2}`,
    'flag seeded once: whatsapp_business, DISABLED, scoped to the merged D1 Imports shop only');
  psql(APPLY, 'migration re-run');
  assert(scalar(`SELECT count(*) FROM public.feature_flags WHERE flag_key = 'whatsapp_business'`) === '1', 're-running the migration is a no-op (no duplicate flag row)');

  // ── Lockdown ──────────────────────────────────────────────────────────
  for (const t of TABLES) {
    assert(clientGrants(t) === '', `catalog: no PUBLIC/anon/authenticated grant on ${t}`);
    assert(scalar(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${t}'::regclass`) === 't' && scalar(`SELECT count(*) FROM pg_policies WHERE tablename = '${t}'`) === '0', `${t}: RLS on, no policies`);
  }
  for (const role of ['anon', 'authenticated']) {
    assert(/permission denied/.test(psqlFails(`SET ROLE ${role}; SELECT count(*) FROM public.whatsapp_connection_secrets;`)), `${role} cannot read the token table`);
    assert(/permission denied/.test(psqlFails(`SET ROLE ${role}; SELECT count(*) FROM public.whatsapp_consents;`)), `${role} cannot read consents`);
    assert(/permission denied/.test(psqlFails(`SET ROLE ${role}; INSERT INTO public.whatsapp_messages (shop_id) VALUES ('${L2}');`)), `${role} cannot write messages`);
  }

  // ── Connection constraints ───────────────────────────────────────────
  psql(`SET ROLE service_role; INSERT INTO public.whatsapp_connections (shop_id, status, phone_number_id, onboarding_type) VALUES ('${L2}', 'connected', '1111111111', 'sandbox_test_number');`, 'connection insert');
  assert(scalar(`SELECT mode || ':' || enabled || ':' || automations_enabled FROM public.whatsapp_connections`) === 'sandbox:false:false', 'a new connection defaults to sandbox, switched off, no automations');
  assert(/live_needs_approval/.test(psqlFails(`SET ROLE service_role; UPDATE public.whatsapp_connections SET mode = 'live';`)), 'live mode without a recorded owner approval is impossible');
  assert(/live_needs_approval/.test(psqlFails(`SET ROLE service_role; UPDATE public.whatsapp_connections SET mode = 'live', live_approved_at = now(), live_approved_by = '${OWNER}';`)), 'live mode on a sandbox test number is impossible, even approved');
  psql(`SET ROLE service_role; UPDATE public.whatsapp_connections SET onboarding_type = 'coexistence', mode = 'live', live_approved_at = now(), live_approved_by = '${OWNER}';`, 'approved live');
  console.log('✓ live mode is accepted with an approval on a coexistence connection');
  psql(`SET ROLE service_role; UPDATE public.whatsapp_connections SET mode = 'sandbox', live_approved_at = NULL, live_approved_by = NULL;`, 'back to sandbox');
  assert(/sandbox_recipients_max/.test(psqlFails(`SET ROLE service_role; UPDATE public.whatsapp_connections SET sandbox_recipients = ARRAY['85620000001','85620000002','85620000003','85620000004','85620000005','85620000006'];`)), 'at most 5 sandbox test recipients');
  assert(/business_phone_digits_check/.test(psqlFails(`SET ROLE service_role; UPDATE public.whatsapp_connections SET business_phone_digits = '+856 20 5555';`)), 'business number must be E.164 digits');
  assert(/access_token_enc_check/.test(psqlFails(`SET ROLE service_role; INSERT INTO public.whatsapp_connection_secrets (shop_id, access_token_enc, token_kind) VALUES ('${L2}', 'EAAGplaintext', 'business_token');`)), 'a plaintext token is refused: only app-encrypted v1 values are stored');
  psql(`SET ROLE service_role; INSERT INTO public.whatsapp_connection_secrets (shop_id, access_token_enc, token_kind) VALUES ('${L2}', 'v1:aaa:bbb:ccc', 'business_token');`, 'secret insert');

  // ── Duplicate prevention ─────────────────────────────────────────────
  const msg = (key, req, status = 'sent') => `INSERT INTO public.whatsapp_messages (shop_id, resource_type, resource_id, resource_shop_id, to_phone_digits, template_name, template_language, trigger, mode, status, dedupe_key, client_request_id)
    VALUES ('${L2}', 'invoice', 'INV-1', '${D1}', '8562055551234', 'redline_invoice_ready', 'en', 'manual', 'sandbox', '${status}', '${KEY(key)}', '${req}');`;
  psql(`SET ROLE service_role; ${msg(1, '00000000-0000-4000-8000-000000000001')}`, 'first message');
  assert(/whatsapp_messages_dedupe_key/.test(psqlFails(`SET ROLE service_role; ${msg(1, '00000000-0000-4000-8000-000000000002')}`)), 'the same content cannot be sent twice (unique dedupe key)');
  assert(/whatsapp_messages_client_request_key/.test(psqlFails(`SET ROLE service_role; ${msg(2, '00000000-0000-4000-8000-000000000001')}`)), 'the same dialog request cannot create two sends');
  psql(`SET ROLE service_role; UPDATE public.whatsapp_messages SET status = 'failed' WHERE dedupe_key = '${KEY(1)}';`, 'mark failed');
  psql(`SET ROLE service_role; ${msg(1, '00000000-0000-4000-8000-000000000003')}`, 'retry after failure');
  console.log('✓ a failed send frees its key for a retry');
  assert(/dedupe_key_check/.test(psqlFails(`SET ROLE service_role; ${msg(0, '00000000-0000-4000-8000-000000000004').replace(KEY(0), 'not-a-hash')}`)), 'dedupe keys must be sha256 hex');
  assert(/to_phone_digits_check/.test(psqlFails(`SET ROLE service_role; ${msg(5, '00000000-0000-4000-8000-000000000005').replace("'8562055551234'", "'020 5555'")}`)), 'recipients are stored as E.164 digits only');
  assert(/permission denied/.test(psqlFails(`SET ROLE service_role; DELETE FROM public.whatsapp_messages;`)), 'even the server cannot delete delivery history');

  // ── Consent log is append-only ───────────────────────────────────────
  psql(`SET ROLE service_role; INSERT INTO public.whatsapp_consent_events (shop_id, phone_digits, status, source) VALUES ('${L2}', '8562055551234', 'opted_in', 'staff_verbal');
        INSERT INTO public.whatsapp_consents (shop_id, phone_digits, status, source) VALUES ('${L2}', '8562055551234', 'opted_in', 'staff_verbal');`, 'consent');
  assert(/permission denied/.test(psqlFails(`SET ROLE service_role; UPDATE public.whatsapp_consent_events SET status = 'opted_out';`)), 'the server cannot edit consent history');
  assert(/permission denied/.test(psqlFails(`SET ROLE service_role; DELETE FROM public.whatsapp_consent_events;`)), 'the server cannot delete consent history');
  assert(/append-only/.test(psqlFails(`UPDATE public.whatsapp_consent_events SET status = 'opted_out';`)), 'even a superuser UPDATE is stopped by the append-only trigger');
  assert(/permission denied/.test(psqlFails(`SET ROLE service_role; DELETE FROM public.whatsapp_consents;`)), 'the server cannot delete consent records');
  assert(/whatsapp_consents_source_check/.test(psqlFails(`SET ROLE service_role; UPDATE public.whatsapp_consents SET source = 'assumed';`)), 'consent needs a recognised source');

  // ── Rollback ─────────────────────────────────────────────────────────
  assert(/Rollback is locked/.test(psqlFails(ROLLBACK_LOCKED)), 'the rollback refuses to run until unlocked');
  assert(scalar(`SELECT to_regclass('public.whatsapp_messages') IS NOT NULL`) === 't', '…and changed nothing');
  psql(ROLLBACK, 'rollback');
  assert(TABLES.every(t => scalar(`SELECT to_regclass('public.${t}') IS NULL`) === 't'), 'unlocked rollback drops the six tables');
  assert(scalar(`SELECT count(*) FROM public.feature_flags WHERE flag_key = 'whatsapp_business'`) === '0', 'and the flag row');
  assert(scalar(`SELECT count(*) FROM public.invoices`) === '1' && scalar(`SELECT count(*) FROM public.shops`) === '2', 'business tables are untouched');
  psql(ROLLBACK, 'rollback re-run');
  console.log('✓ the rollback is re-runnable');
  psql(APPLY, 're-apply after rollback');
  console.log('✓ the migration re-applies cleanly after a rollback');
}

async function main() {
  if (docker(['image', 'inspect', IMAGE]).code !== 0) throw new Error(`Image ${IMAGE} not present locally; this runner never pulls.`);
  const s = docker(['run', '-d', '--name', NAME, '-e', 'POSTGRES_PASSWORD=local-throwaway', IMAGE]);
  if (s.code !== 0) throw new Error(s.out);
  for (let i = 0; i < 90; i++) {
    if (docker(['exec', NAME, 'psql', '-U', 'postgres', '-h', 'localhost', '-tAc', 'select 1']).code === 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  suite();
  console.log('\nALL WHATSAPP DATABASE CHECKS PASSED');
}

main().then(() => docker(['rm', '-f', NAME])).catch(e => {
  console.error('\n✗ ' + (e instanceof Error ? e.message : String(e)));
  docker(['rm', '-f', NAME]);
  process.exit(1);
});
