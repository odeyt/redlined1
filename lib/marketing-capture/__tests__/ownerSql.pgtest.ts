/**
 * OWNER START SQL and OWNER FINISH SQL, EXECUTED against a real PostgreSQL.
 *
 *   npm run test:sql
 *
 * Not part of the default Jest run: it needs a PostgreSQL to execute against,
 * and it fails rather than skips when there is none (see
 * ./support/testDatabase.ts).
 * Every scenario runs the unedited repository SQL files against a fresh
 * production-shaped fixture whose alert triggers carry the bodies production
 * stores, byte for byte (../productionDefinitions.ts,
 * ./support/ownerSqlFixture.ts).
 */
import { EXPECTED_ALERTS } from '../alertExpectation';
import { ledgerToken, orderedAlertIdsMd5, withChecksum } from '../alertFinishGates';
import { backendDescription, createTestDb, type TestDb } from './support/testDatabase';
import {
  IDS, PRODUCTION_LIKE_NET_GRANTS, ROLES_SQL, changeStatus, drainQueue, functionStatement, newDemoAlertIds,
  productionStatement, readRepo, runOwnerSql, templateSql, walkthrough, type Responder, type Row,
} from './support/ownerSqlFixture';
import { PINNED_FUNCTIONS } from '../alertExpectation';

const START = 'scripts/marketing/sql/owner-start.sql';
const FINISH = 'scripts/marketing/sql/owner-finish.sql';

const open: TestDb[] = [];

beforeAll(() => {
  console.log(`[owner-sql tests] executing against ${backendDescription()}`);
});

afterAll(async () => {
  for (const db of open) await db.close().catch(() => undefined);
}, 60_000);

/** A fresh database with the fixture applied, plus any scenario SQL. */
async function freshDb(extraSql = ''): Promise<TestDb> {
  const db = await createTestDb();
  open.push(db);
  await db.exec(ROLES_SQL);
  await db.exec(templateSql('production'));
  if (extraSql) await db.exec(extraSql);
  return db;
}

const start = (db: TestDb, shop = IDS.demoShop) => runOwnerSql(db, START, { __DEMO_SHOP_ID__: shop });
const tokenOf = (rows: Row[]) => rows.find(r => r.ord === 900)!.actual;
const verdictOf = (rows: Row[]) => rows.find(r => r.ord === 999)!;
const row = (rows: Row[], ord: number) => {
  const r = rows.find(x => x.ord === ord);
  if (!r) throw new Error(`no row ${ord}`);
  return r;
};
const stops = (rows: Row[]) => rows.filter(r => r.ord < 999 && ['STOP', 'REVIEW'].includes(r.verdict)).map(r => r.ord);

async function finish(db: TestDb, startToken: string, ledger?: string) {
  const ids = await newDemoAlertIds(db);
  return runOwnerSql(db, FINISH, {
    __START_TOKEN__: startToken,
    __LEDGER_TOKEN__: ledger ?? ledgerToken(IDS.demoShop, ids),
  });
}

/** START, the walkthrough, then FINISH. */
async function take(db: TestDb, opts: Parameters<typeof walkthrough>[1] = {}) {
  const s = await start(db);
  await walkthrough(db, opts);
  return { s, f: await finish(db, tokenOf(s)) };
}

describe('a clean take', () => {
  it('START allows the capture; FINISH proves every alert against its request', async () => {
    const db = await freshDb();
    const s = await start(db);
    expect(stops(s)).toEqual([]);
    expect(verdictOf(s)).toMatchObject({ actual: 'CAPTURE MAY START', verdict: 'PASS' });
    expect(tokenOf(s)).toMatch(/^RL1S;SHOP=5a000000-0000-4000-8000-000000000001;S0=0;C0=0;T0=\S+Z;I0=154;NP=[0-9a-f]{32};CHK=[0-9a-f]{8}$/);

    await walkthrough(db);
    const f = await finish(db, tokenOf(s));
    expect(f.filter(r => r.verdict !== 'PASS').map(r => `${r.ord} ${r.verdict} ${r.actual}`)).toEqual([]);
    expect(verdictOf(f)).toMatchObject({ actual: 'PROVEN', verdict: 'PASS' });
    for (let k = 1; k <= 5; k++) {
      expect(row(f, 40 + k).actual).toMatch(new RegExp(`request=${k} response=${k} status=200 timed_out=false error=- body=keys=ok,sent sent=0$`));
    }
  });

  it('executing the production trigger bodies yields exactly EXPECTED_ALERTS; Pending Approval raises ro.pending_approval only', async () => {
    const db = await freshDb();
    await walkthrough(db);
    const alerts = await db.query(`
      SELECT a.event_type, a.title, s.old_status, s.new_status, a.target_user_id, a.target_role, a.created_by::text AS created_by,
             a.xmin::text = s.xmin::text AS same_tx
      FROM public.alert_events a JOIN public.ro_status_events s ON s.xmin::text = a.xmin::text
      ORDER BY a.created_at`);
    expect(alerts.rows.map(r => ({ eventType: r.event_type, title: r.title, oldStatus: r.old_status, newStatus: r.new_status })))
      .toEqual(EXPECTED_ALERTS.map(({ eventType, title, oldStatus, newStatus }) => ({ eventType, title, oldStatus, newStatus })));
    expect(alerts.rows.every(r => r.same_tx && r.target_user_id === null && r.target_role === null && r.created_by === IDS.demoOwner)).toBe(true);
    const pendingApproval = alerts.rows.filter(r => r.new_status === 'Pending Approval');
    expect(pendingApproval.map(r => r.event_type)).toEqual(['ro.pending_approval']);
    // One request per alert, carrying that alert.
    const sent = await db.query(`SELECT count(*)::int AS n FROM net._http_response`);
    expect(sent.rows[0].n).toBe(5);
  });

  it('START and FINISH change nothing', async () => {
    const db = await freshDb();
    const s = await start(db);
    await walkthrough(db);
    const snapshot = async () => (await db.query(`SELECT
      (SELECT last_value FROM net.http_request_queue_id_seq) AS req_seq,
      (SELECT last_value FROM public.invoice_number_seq) AS inv_seq,
      (SELECT count(*) FROM public.alert_events) AS alerts,
      (SELECT count(*) FROM net._http_response) AS responses,
      (SELECT count(*) FROM net.http_request_queue) AS queued`)).rows[0];
    const beforeRun = await snapshot();
    await start(db);
    await finish(db, tokenOf(s));
    expect(await snapshot()).toEqual(beforeRun);
  });
});

describe('OWNER START SQL privilege audit', () => {
  it('STOPs on production-like pg_net grants, naming every exposure', async () => {
    const db = await freshDb(PRODUCTION_LIKE_NET_GRANTS);
    const s = await start(db);
    expect(verdictOf(s).verdict).toBe('STOP');
    expect(stops(s)).toEqual([33, 34, 35, 36, 37, 38]);
    expect(row(s, 32).actual).toBe('anon, authenticated');
    expect(row(s, 33).actual).toBe(
      'PUBLIC DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE [latent]; '
      + 'anon DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE [effective]; '
      + 'authenticated DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE [effective]');
    expect(row(s, 34).actual).toBe('PUBLIC body,headers; anon body,headers; authenticated body,headers');
    expect(row(s, 36).actual).toBe('PUBLIC content,headers; anon content,headers; authenticated content,headers');
    expect(row(s, 37).actual).toBe('anon SELECT,USAGE; authenticated SELECT,USAGE');
    expect(row(s, 38).actual).toBe('anon http_post; authenticated http_post');
  });

  it('STOPs on CREATE in net, and on a callable function outside net that reads responses', async () => {
    const db = await freshDb(`
      GRANT CREATE ON SCHEMA net TO authenticated;
      CREATE FUNCTION public.peek_responses() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*) FROM net._http_response $$;`);
    const s = await start(db);
    // Row 50 too: reading the response table is also making the database's HTTP traffic reachable.
    expect(stops(s)).toEqual([31, 40, 50]);
    expect(row(s, 40).actual).toBe('PUBLIC public.peek_responses; anon public.peek_responses; authenticated public.peek_responses');
    expect(row(s, 50).actual).toBe('public.notify_push_on_alert, public.peek_responses');
  });

  it('does not count an event-trigger function as a way in, but still catches callable ones', async () => {
    // Supabase's own extensions.grant_pg_net_access returns event_trigger and
    // holds PUBLIC EXECUTE. PostgreSQL refuses a direct call of any function
    // returning trigger or event_trigger, so listing it was a false positive.
    const db = await freshDb(`
      CREATE SCHEMA extensions;
      CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger LANGUAGE plpgsql AS $$
        BEGIN PERFORM 1 FROM net._http_response; END $$;
      CREATE FUNCTION public.peek_queue() RETURNS bigint LANGUAGE sql SECURITY DEFINER
        AS $$ SELECT count(*) FROM net.http_request_queue $$;`);
    const s = await start(db);
    expect(row(s, 40).actual).toContain('public.peek_queue');
    expect(row(s, 40).actual).not.toContain('grant_pg_net_access');
    expect(row(s, 40).verdict).toBe('STOP');
  });

  it('STOPs when a second function makes HTTP calls, or a Database Webhook trigger exists', async () => {
    const db = await freshDb(`
      CREATE FUNCTION public.ping_out() RETURNS bigint LANGUAGE sql AS $$ SELECT net.http_post('https://example.com/') $$;
      REVOKE ALL ON FUNCTION public.ping_out() FROM PUBLIC;
      CREATE SCHEMA supabase_functions;
      CREATE FUNCTION supabase_functions.http_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE TRIGGER hook AFTER INSERT ON public.shop_mirrors FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request();`);
    const s = await start(db);
    expect(stops(s)).toEqual([50, 52]);
    expect(row(s, 50).actual).toBe('public.notify_push_on_alert, public.ping_out');
  });

  it('STOPs unless the request-id sequence hands out ids one at a time', async () => {
    const db = await freshDb('ALTER SEQUENCE net.http_request_queue_id_seq CACHE 10;');
    expect(stops(await start(db))).toEqual([71]);
  });

  it('STOPs on isolation failures: a second member, a subscription, an unmuted alert, contact details, outbox rows', async () => {
    const db = await freshDb(`
      INSERT INTO public.shop_users VALUES ('${IDS.realOwner}', '${IDS.demoShop}', 'manager');
      INSERT INTO public.push_subscriptions (user_id, shop_id, endpoint) VALUES ('${IDS.demoOwner}', '${IDS.demoShop}', 'https://push.invalid/1');
      UPDATE public.shop_settings SET alert_preferences = '{}'::jsonb WHERE shop_id = '${IDS.demoShop}';
      UPDATE public.customers SET email = 'someone@example.com' WHERE shop_id = '${IDS.demoShop}';
      INSERT INTO public.sapelee_event_outbox (shop_id) VALUES ('${IDS.demoShop}');`);
    expect(stops(await start(db))).toEqual([12, 13, 14, 16, 17, 19]);
  });

  it('STOPs on an unedited or malformed shop id', async () => {
    const db = await freshDb();
    const rows = await runOwnerSql(db, START, { __DEMO_SHOP_ID__: '__DEMO_SHOP_ID__' });
    expect(row(rows, 10).verdict).toBe('STOP');
    expect(verdictOf(rows).verdict).toBe('STOP');
  });
});

describe('OWNER START SQL live-definition proof', () => {
  it('a changed alert trigger (Pending Approval also announced) STOPs START and FAILS FINISH on the count', async () => {
    const db = await freshDb();
    const live = productionStatement(readRepo('supabase/migrations/2026-08-13_alert_ro_status_changed.sql'), 'alert_ro_status_changed');
    const changed = live.replace("IF NEW.status <> 'Pending Approval' THEN", 'IF true THEN');
    expect(changed).not.toBe(live);
    await db.query(changed);
    const s = await start(db);
    expect(stops(s)).toEqual([55, 61]);
    expect(row(s, 55).verdict).toBe('STOP');

    await walkthrough(db);
    const f = await finish(db, tokenOf(s));
    expect(row(f, 21).verdict).toBe('FAIL');
    expect(row(f, 33)).toMatchObject({ actual: '6', verdict: 'FAIL' });
    expect(verdictOf(f).verdict).toBe('FAIL');
  });

  it('a whitespace-only difference is REVIEW, never PASS', async () => {
    const db = await freshDb();
    const live = productionStatement(readRepo('supabase/migrations/2026-08-03_ro_status_events.sql'), 'record_ro_status_change');
    const spaced = live.replace('BEGIN\r\n', 'BEGIN\r\n\r\n    ');
    expect(spaced).not.toBe(live);
    await db.query(spaced);
    const s = await start(db);
    expect(row(s, 58).verdict).toBe('REVIEW');
    expect(stops(s)).toEqual([58, 61]);
  });

  it('a disabled or extra trigger STOPs START', async () => {
    const db = await freshDb(`
      ALTER TABLE public.repair_orders DISABLE TRIGGER repair_orders_alert_status_changed;
      CREATE TRIGGER zz_extra AFTER INSERT ON public.standard_labor_guides FOR EACH ROW EXECUTE FUNCTION public.audit_events_are_append_only();`);
    const s = await start(db);
    expect(stops(s)).toEqual([54, 61]);
    expect(row(s, 54).actual).toContain('repair_orders.repair_orders_alert_status_changed D AFTER UPDATE ROW');
    expect(row(s, 54).actual).toContain('standard_labor_guides.zz_extra O AFTER INSERT ROW');
  });

  it("the migration text is not what production stores: START STOPs where the audit said DIFFERS and REVIEWs where it said WHITESPACE", async () => {
    const db = await freshDb();
    for (const f of PINNED_FUNCTIONS) await db.query(functionStatement(readRepo(f.file), f.name));
    const s = await start(db);
    expect([55, 56, 57, 58, 59, 60].map(ord => `${ord} ${row(s, ord).verdict}`))
      .toEqual(['55 STOP', '56 REVIEW', '57 REVIEW', '58 REVIEW', '59 STOP', '60 STOP']);
    expect(row(s, 61).verdict).toBe('STOP');
  });

  it('START pins production without trg_free_tier_limit: restoring that trigger STOPs row 54', async () => {
    const db = await freshDb(`
      CREATE FUNCTION public.enforce_free_tier_count_limit() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RETURN NEW; END $fn$;
      CREATE TRIGGER trg_free_tier_limit BEFORE INSERT ON public.job_cards FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_count_limit();`);
    const s = await start(db);
    expect(stops(s)).toEqual([54, 61]);
    expect(row(s, 54).actual).toContain('job_cards.trg_free_tier_limit O BEFORE INSERT ROW');
  });
});

describe('OWNER FINISH SQL failure modes', () => {
  it('unexpected concurrent real-shop alert: UNPROVEN', async () => {
    const db = await freshDb();
    const { f } = await take(db, {
      between: async k => { if (k === 2) { await changeStatus(db, IDS.realRo, 'In Progress', IDS.realOwner); await drainQueue(db); } },
    });
    expect(verdictOf(f).verdict).toBe('UNPROVEN');
    expect(row(f, 30)).toMatchObject({ actual: '6', verdict: 'UNPROVEN' });
    expect(row(f, 31)).toMatchObject({ actual: '6', verdict: 'UNPROVEN' });
    expect(row(f, 32)).toMatchObject({ actual: '6, 1', verdict: 'UNPROVEN' });
    // Request 3 belongs to the real shop, so no pairing after it may pass.
    expect([43, 44, 45].map(o => row(f, o).verdict)).toEqual(['UNPROVEN', 'UNPROVEN', 'UNPROVEN']);
  });

  it('sequence gap (a request id taken outside the alert path): UNPROVEN', async () => {
    const db = await freshDb();
    const { f } = await take(db, { between: async k => { if (k === 3) await db.query(`SELECT nextval('net.http_request_queue_id_seq')`); } });
    expect(row(f, 30)).toMatchObject({ actual: '6', verdict: 'UNPROVEN' });
    expect(row(f, 31).verdict).toBe('PASS');
    expect(verdictOf(f).verdict).toBe('UNPROVEN');
  });

  it('pending response: PENDING, then PROVEN once pg_net answers', async () => {
    const db = await freshDb();
    const s = await start(db);
    await walkthrough(db, { respond: id => (id === 5 ? 'leave-queued' : { status_code: 200, content: '{"ok":true,"sent":0}' }) });
    const pending = await finish(db, tokenOf(s));
    expect(row(pending, 45).verdict).toBe('PENDING');
    expect(row(pending, 50)).toMatchObject({ actual: '1', verdict: 'PENDING' });
    expect(verdictOf(pending).verdict).toBe('PENDING');
    await drainQueue(db);
    expect(verdictOf(await finish(db, tokenOf(s))).verdict).toBe('PASS');
  });

  it('a lost response is FAIL, and UNPROVEN once past pg_net.ttl', async () => {
    const db = await freshDb();
    const s = await start(db);
    await walkthrough(db, { respond: id => (id === 2 ? 'lose' : { status_code: 200, content: '{"ok":true,"sent":0}' }) });
    expect(row(await finish(db, tokenOf(s)), 42).verdict).toBe('FAIL');
    await db.query(`SET pg_net.ttl = '1 microsecond'`);
    expect(row(await finish(db, tokenOf(s)), 42).verdict).toBe('UNPROVEN');
  });

  it.each<[string, Responder, string, string]>([
    ['non-200 response', () => ({ status_code: 401, content: '{"error":"Unauthorized"}' }), 'FAIL', 'status=401'],
    ['timeout', () => ({ status_code: null, content: null, timed_out: true, error_msg: 'Timeout of 5000 ms reached' }), 'FAIL', 'timed_out=true'],
    ['transport error', () => ({ status_code: null, content: null, error_msg: 'Couldn\'t resolve host name' }), 'FAIL', 'error=Couldn'],
    ['non-JSON body', () => ({ status_code: 200, content: '<html>error</html>' }), 'FAIL', 'body=not JSON'],
    ['sent > 0', () => ({ status_code: 200, content: '{"ok":true,"sent":1,"pruned":0}' }), 'CRITICAL', 'sent=1'],
    ['pruned key with sent 0', () => ({ status_code: 200, content: '{"ok":true,"sent":0,"pruned":1}' }), 'CRITICAL', 'keys=ok,pruned,sent'],
    ['extra key', () => ({ status_code: 200, content: '{"ok":true,"sent":0,"note":"x"}' }), 'FAIL', 'keys=note,ok,sent'],
    ['ok false', () => ({ status_code: 200, content: '{"ok":false,"sent":0}' }), 'FAIL', 'sent=0'],
  ])('%s on request 4: %s', async (_name, bad, verdict, detail) => {
    const db = await freshDb();
    const { f } = await take(db, { respond: (id, body) => (id === 4 ? bad(id, body) : { status_code: 200, content: '{"ok":true,"sent":0}' }) });
    expect(row(f, 44).verdict).toBe(verdict);
    expect(row(f, 44).actual).toContain(detail);
    expect([41, 42, 43, 45].map(o => row(f, o).verdict)).toEqual(['PASS', 'PASS', 'PASS', 'PASS']);
    expect(verdictOf(f).verdict).toBe(verdict);
  });

  it('unexpected event type in the demo shop: FAIL on count and pairing', async () => {
    const db = await freshDb();
    const { f } = await take(db, {
      between: async k => {
        if (k === 1) {
          await db.query(`SELECT public.emit_alert_event('${IDS.demoShop}', 'invoice.paid', NULL, 'Invoice INV-DEMO-330 paid', '', 'invoice', 'INV-DEMO-330')`);
          await drainQueue(db);
        }
      },
    });
    expect(row(f, 33)).toMatchObject({ actual: '6', verdict: 'FAIL' });
    expect(row(f, 42).verdict).toBe('FAIL');
    expect(row(f, 42).actual).toContain('type=invoice.paid');
    expect(verdictOf(f).verdict).toBe('FAIL');
  });

  it('unexpected target on an alert: FAIL', async () => {
    const db = await freshDb();
    const s = await start(db);
    await walkthrough(db);
    // Rewriting the row also gives it a new xmin, so its transaction link breaks too.
    await db.query(`UPDATE public.alert_events SET target_role = 'owner' WHERE event_type = 'ro.pending_approval'`);
    const f = await finish(db, tokenOf(s));
    expect(row(f, 44).verdict).toBe('FAIL');
    expect(verdictOf(f).verdict).toBe('FAIL');
  });

  it('subscription appearing during the take: CRITICAL', async () => {
    const db = await freshDb();
    const { f } = await take(db, {
      between: async k => {
        if (k === 3) await db.query(`INSERT INTO public.push_subscriptions (user_id, shop_id, endpoint) VALUES ('${IDS.demoOwner}', '${IDS.demoShop}', 'https://push.invalid/x')`);
      },
    });
    expect(row(f, 61)).toMatchObject({ actual: '1, 1', verdict: 'CRITICAL' });
    expect(verdictOf(f).verdict).toBe('CRITICAL');
  });

  it('Sapelee outbox row created: CRITICAL', async () => {
    const db = await freshDb();
    const { f } = await take(db, { between: async k => { if (k === 5) await db.query(`INSERT INTO public.sapelee_event_outbox (shop_id) VALUES ('${IDS.demoShop}')`); } });
    expect(row(f, 62)).toMatchObject({ actual: '1', verdict: 'CRITICAL' });
    expect(verdictOf(f).verdict).toBe('CRITICAL');
  });

  it('invoice sequence movement: CRITICAL', async () => {
    const db = await freshDb();
    const { f } = await take(db, { between: async k => { if (k === 4) await db.query(`SELECT nextval('public.invoice_number_seq')`); } });
    expect(row(f, 60)).toMatchObject({ expected: '154', actual: '155', verdict: 'CRITICAL' });
    expect(verdictOf(f).verdict).toBe('CRITICAL');
  });

  it('alert count differing from the live-proven expectation in the ledger: FAIL', async () => {
    const db = await freshDb();
    const s = await start(db);
    await walkthrough(db);
    const ids = await newDemoAlertIds(db);
    const six = withChecksum(`RL1L;SHOP=${IDS.demoShop};N=6;MD5=${orderedAlertIdsMd5(ids)}`);
    const f = await finish(db, tokenOf(s), six);
    expect(row(f, 13)).toMatchObject({ expected: '5', actual: '6', verdict: 'FAIL' });
    expect(verdictOf(f).verdict).toBe('FAIL');
  });

  it('a ledger whose alert ids differ from the database: FAIL', async () => {
    const db = await freshDb();
    const s = await start(db);
    await walkthrough(db);
    const ids = await newDemoAlertIds(db);
    const swapped = [ids[1], ids[0], ...ids.slice(2)];
    const f = await finish(db, tokenOf(s), ledgerToken(IDS.demoShop, swapped));
    expect(row(f, 35).verdict).toBe('FAIL');
  });

  it('mangled tokens are refused by checksum', async () => {
    const db = await freshDb();
    const s = await start(db);
    await walkthrough(db);
    const mangled = tokenOf(s).replace(';C0=0;', ';C0=1;');
    const f = await finish(db, mangled);
    expect(row(f, 10).verdict).toBe('FAIL');
    expect(verdictOf(f).verdict).toBe('FAIL');
  });

  it('a live definition changed during the window: FAIL', async () => {
    const db = await freshDb();
    const s = await start(db);
    await walkthrough(db);
    await db.query(`CREATE OR REPLACE FUNCTION public.notify_push_on_alert() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RETURN NEW; END $fn$`);
    const f = await finish(db, tokenOf(s));
    expect(row(f, 27).verdict).toBe('FAIL');
  });
});
