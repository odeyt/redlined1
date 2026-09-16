/**
 * A database shaped like production for the parts the owner SQL reads.
 *
 * The six pinned trigger functions are created from the repository's own
 * migration text, byte for byte, so executing the walkthrough here runs the
 * real source. pg_net is simulated: a `net` schema with the same queue and
 * response tables, a sequence-backed request id, and an http_post that queues.
 * notify_push_on_alert is shaped like the live one (secret read from a vault
 * table, never a literal).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import type { TestDb } from './testDatabase';
import { ALERT_EVENTS, ALERT_ROLES } from '@/lib/alerts/catalogue';
import { PINNED_FUNCTIONS, RO_WALKTHROUGH_TRANSITIONS } from '../../alertExpectation';

export const ROOT = join(__dirname, '..', '..', '..', '..');
export const readRepo = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r/g, '');

export const IDS = {
  demoOrg: '0a000000-0000-4000-8000-000000000001',
  realOrg: '0a000000-0000-4000-8000-000000000002',
  demoShop: '5a000000-0000-4000-8000-000000000001',
  realShop: '5a000000-0000-4000-8000-000000000002',
  demoOwner: 'd0000000-0000-4000-8000-000000000001',
  realOwner: 'd0000000-0000-4000-8000-000000000002',
  demoRo: 'a0000000-0000-4000-8000-000000000001',
  realRo: 'a0000000-0000-4000-8000-000000000002',
};

/** The full CREATE statement of the last definition of public.<name> in a migration. */
export function functionStatement(sql: string, name: string): string {
  const header = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const at = sql.lastIndexOf(header);
  if (at === -1) throw new Error(`no definition of ${name}`);
  const open = sql.indexOf('$fn$', at);
  const close = sql.indexOf('$fn$', open + 4);
  if (open === -1 || close === -1 || sql.slice(close, close + 5) !== '$fn$;') throw new Error(`unterminated definition of ${name}`);
  return sql.slice(at, close + 5);
}

export function mutedPreferences(): Record<string, string[]> {
  return Object.fromEntries(ALERT_ROLES.map(role => [role, ALERT_EVENTS.filter(e => e.roles.includes(role)).map(e => e.id)]));
}

export const ROLES_SQL = `
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $r$;`;

export function templateSql(): string {
  const functions = PINNED_FUNCTIONS.map(f => functionStatement(readRepo(f.file), f.name)).join('\n\n');
  return `
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets (name text, decrypted_secret text);
INSERT INTO vault.decrypted_secrets VALUES ('push_webhook_secret', 'fixture-value-not-a-secret');

CREATE SCHEMA net;
CREATE TABLE net.http_request_queue (
  id bigserial PRIMARY KEY, method text NOT NULL, url text NOT NULL, headers jsonb, body bytea,
  timeout_milliseconds integer NOT NULL DEFAULT 5000
);
CREATE TABLE net._http_response (
  id bigint, status_code integer, content_type text, headers jsonb, content text,
  timed_out boolean, error_msg text, created timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE rid bigint;
BEGIN
  INSERT INTO net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  VALUES ('POST', url, headers, convert_to(body::text, 'UTF8'), timeout_milliseconds) RETURNING id INTO rid;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION net.http_post(text, jsonb, jsonb, jsonb, integer) FROM PUBLIC;

CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
CREATE TABLE public.shops (id uuid PRIMARY KEY, name text NOT NULL, slug text, organization_id uuid, is_synthetic boolean NOT NULL DEFAULT false);
CREATE TABLE public.shop_users (user_id uuid NOT NULL, shop_id uuid NOT NULL, role text NOT NULL);
CREATE TABLE public.shop_settings (id serial PRIMARY KEY, shop_id uuid UNIQUE, alert_preferences jsonb);
CREATE TABLE public.push_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, shop_id uuid NOT NULL, endpoint text NOT NULL);
CREATE TABLE public.customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid, name text, phone text, email text);
CREATE TABLE public.technicians (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid, name text, phone text, email text, user_id uuid);
CREATE TABLE public.sapelee_event_outbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid, status text NOT NULL DEFAULT 'pending');
CREATE TABLE public.shop_mirrors (shop_id uuid, mirror_shop_id uuid);
CREATE TABLE public.repair_orders (id uuid PRIMARY KEY, shop_id uuid NOT NULL, ro_number text, status text, invoice_number text, customer_name text, vehicle text, notes text);
CREATE TABLE public.job_cards (id text PRIMARY KEY, shop_id uuid NOT NULL, customer text, vehicle text, status text,
  technicians text[] NOT NULL DEFAULT '{}', service_type text, notes text, labor_hours numeric, parts_total numeric);
CREATE TABLE public.alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, event_type text NOT NULL,
  target_user_id uuid, target_role text, title text NOT NULL, body text, entity_type text, entity_id text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ro_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, repair_order_id uuid NOT NULL,
  ro_number text, customer_name text, vehicle text, old_status text, new_status text NOT NULL,
  changed_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, entity_type text, entity_id text);
CREATE TABLE public.standard_labor_guides (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, times_performed int NOT NULL DEFAULT 1);
CREATE SEQUENCE public.invoice_number_seq;
SELECT setval('public.invoice_number_seq', 154);

${functions}

CREATE OR REPLACE FUNCTION public.notify_push_on_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $fn$
BEGIN
  PERFORM net.http_post(
    url     := 'https://www.redlined1.com/api/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret',
                 (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret')),
    body    := jsonb_build_object('record', to_jsonb(NEW))
  );
  RETURN NEW;
END
$fn$;
CREATE FUNCTION public.audit_events_are_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN RAISE EXCEPTION 'audit_events is append-only (attempted %)', TG_OP; END $fn$;
CREATE FUNCTION public.enforce_free_tier_count_limit() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN RETURN NEW; END $fn$;

CREATE TRIGGER alert_events_push AFTER INSERT ON public.alert_events FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_alert();
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.audit_events_are_append_only();
CREATE TRIGGER job_cards_alert_assigned AFTER UPDATE ON public.job_cards FOR EACH ROW EXECUTE FUNCTION public.alert_job_assigned();
CREATE TRIGGER job_cards_alert_work_added AFTER UPDATE ON public.job_cards FOR EACH ROW EXECUTE FUNCTION public.alert_job_work_added();
CREATE TRIGGER trg_free_tier_limit BEFORE INSERT ON public.job_cards FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_count_limit();
CREATE TRIGGER repair_orders_alert_pending_approval AFTER UPDATE ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.alert_ro_pending_approval();
CREATE TRIGGER repair_orders_alert_status_changed AFTER UPDATE ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.alert_ro_status_changed();
CREATE TRIGGER repair_orders_status_change AFTER UPDATE ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.record_ro_status_change();

INSERT INTO public.organizations VALUES ('${IDS.demoOrg}', 'Redlined1 Demo Workshop'), ('${IDS.realOrg}', 'Real org');
INSERT INTO public.shops VALUES
  ('${IDS.demoShop}', 'Redlined1 Demo Workshop', 'demo', '${IDS.demoOrg}', true),
  ('${IDS.realShop}', 'D1 Imports', 'd1', '${IDS.realOrg}', false);
INSERT INTO public.shop_users VALUES ('${IDS.demoOwner}', '${IDS.demoShop}', 'owner'), ('${IDS.realOwner}', '${IDS.realShop}', 'owner');
INSERT INTO public.shop_settings (shop_id, alert_preferences) VALUES
  ('${IDS.demoShop}', '${JSON.stringify(mutedPreferences())}'::jsonb), ('${IDS.realShop}', '{}'::jsonb);
INSERT INTO public.customers (shop_id, name) VALUES ('${IDS.demoShop}', 'Jordan Blake');
INSERT INTO public.customers (shop_id, name, phone) VALUES ('${IDS.realShop}', 'Real customer', '+856 20 0000 0000');
INSERT INTO public.technicians (shop_id, name) VALUES ('${IDS.demoShop}', 'Alex Morgan');
INSERT INTO public.repair_orders VALUES
  ('${IDS.demoRo}', '${IDS.demoShop}', 'RO-DEMO-330', 'Open', 'INV-DEMO-330', 'Jordan Blake', '2021 BMW 330i', ''),
  ('${IDS.realRo}', '${IDS.realShop}', 'RO-1001', 'Open', NULL, 'Real customer', 'Real car', '');
INSERT INTO public.job_cards (id, shop_id, customer, vehicle, status) VALUES
  ('JC-DEMO', '${IDS.demoShop}', 'Jordan Blake', '2021 BMW 330i', 'Booked');
`;
}

/** Production as the 2026-09-15 reconciliation found it: PUBLIC holds every table privilege on pg_net's tables. */
export const PRODUCTION_LIKE_NET_GRANTS = `
GRANT USAGE ON SCHEMA net TO anon, authenticated;
GRANT ALL ON net.http_request_queue, net._http_response TO PUBLIC;
GRANT USAGE, SELECT ON SEQUENCE net.http_request_queue_id_seq TO anon, authenticated;
GRANT EXECUTE ON FUNCTION net.http_post(text, jsonb, jsonb, jsonb, integer) TO anon, authenticated;
`;

export interface Row { ord: number; section: string; check_name: string; expected: string; actual: string; verdict: string }

/** Runs a whole owner SQL file as the editor would, returning the one result with rows. */
export async function runOwnerSql(db: TestDb, file: string, replacements: Record<string, string>): Promise<Row[]> {
  let text = readRepo(file);
  for (const [placeholder, value] of Object.entries(replacements)) {
    if (!text.includes(placeholder)) throw new Error(`${placeholder} not in ${file}`);
    text = text.split(placeholder).join(value);
  }
  const results = await db.exec(text);
  const withRows = results.filter(r => r.fields && r.fields.length === 6) as unknown as { rows: Row[] }[];
  if (withRows.length !== 1) throw new Error(`${file}: expected one result set, got ${withRows.length}`);
  return withRows[0].rows.map(r => ({ ...r, ord: Number(r.ord) }));
}

/** One repair-order status change, in its own transaction, as the demo owner. */
export async function changeStatus(db: TestDb, roId: string, status: string, actor = IDS.demoOwner) {
  await db.query('BEGIN');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [actor]);
  await db.query('UPDATE public.repair_orders SET status = $1 WHERE id = $2', [status, roId]);
  await db.query('COMMIT');
}

export type Responder = (id: number, body: { record?: { shop_id?: string } }) =>
  { status_code: number | null; content: string | null; timed_out?: boolean; error_msg?: string | null } | 'leave-queued' | 'lose';

export const harmless: Responder = () => ({ status_code: 200, content: '{"ok":true,"sent":0}' });

/** Plays pg_net's worker: answers and removes queued requests. */
export async function drainQueue(db: TestDb, respond: Responder = harmless) {
  const q = await db.query(`SELECT id, convert_from(body, 'UTF8')::jsonb AS body FROM net.http_request_queue ORDER BY id`);
  for (const row of q.rows) {
    const id = Number(row.id);
    const r = respond(id, row.body as { record?: { shop_id?: string } });
    if (r === 'leave-queued') continue;
    if (r !== 'lose') {
      await db.query(
        'INSERT INTO net._http_response (id, status_code, content, timed_out, error_msg) VALUES ($1, $2, $3, $4, $5)',
        [id, r.status_code, r.content, r.timed_out ?? false, r.error_msg ?? null],
      );
    }
    await db.query('DELETE FROM net.http_request_queue WHERE id = $1', [id]);
  }
}

/** The walkthrough's five status changes, draining the queue after each unless told otherwise. */
export async function walkthrough(db: TestDb, opts: { respond?: Responder; between?: (k: number) => Promise<void> } = {}) {
  let k = 0;
  for (const t of RO_WALKTHROUGH_TRANSITIONS) {
    k += 1;
    await changeStatus(db, IDS.demoRo, t.to);
    await drainQueue(db, opts.respond ?? harmless);
    if (opts.between) await opts.between(k);
  }
}

/** Demo alert ids created after `sinceIds`, oldest first: what the capture's collector records. */
export async function newDemoAlertIds(db: TestDb, sinceIds: string[] = []): Promise<string[]> {
  const r = await db.query(
    'SELECT id::text AS id FROM public.alert_events WHERE shop_id = $1 ORDER BY created_at, id', [IDS.demoShop]);
  return r.rows.map(x => x.id as string).filter(id => !sinceIds.includes(id));
}
