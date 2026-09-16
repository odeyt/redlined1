/**
 * PHASE A audit, EXECUTED against a real PostgreSQL.
 *
 *   npm run test:sql
 *
 * Two databases are compared: one granted the way production was found on
 * 2026-09-16, and one hardened. The audit must name every exposure in the first
 * and none in the second - and in both, it must print no queued header, no
 * request body, no response content and no secret.
 */
import {
  FIXTURE_FAKE_SECRET, GRANT_PG_NET_ACCESS_SQL, PLATFORM_ROLES_SQL, PRODUCTION_LIKE_NET_GRANTS,
  QUEUE_WITH_SECRET_SQL, ROLES_SQL, runOwnerSql, templateSql, type Row,
} from '../../marketing-capture/__tests__/support/ownerSqlFixture';
import { backendDescription, createTestDb, type TestDb } from '../../marketing-capture/__tests__/support/testDatabase';

const AUDIT = 'scripts/security/sql/pg-net-privilege-audit.sql';

const open: TestDb[] = [];

beforeAll(() => {
  console.log(`[pg_net audit tests] executing against ${backendDescription()}`);
});

afterAll(async () => {
  for (const db of open) await db.close().catch(() => undefined);
}, 60_000);

async function freshDb(extraSql = ''): Promise<TestDb> {
  const db = await createTestDb();
  open.push(db);
  await db.exec(ROLES_SQL);
  await db.exec(PLATFORM_ROLES_SQL);
  await db.exec(templateSql());
  await db.exec(QUEUE_WITH_SECRET_SQL);
  if (extraSql) await db.exec(extraSql);
  return db;
}

const audit = (db: TestDb) => runOwnerSql(db, AUDIT, {});
const row = (rows: Row[], ord: number) => {
  const r = rows.find(x => x.ord === ord);
  if (!r) throw new Error(`no row ${ord}`);
  return r;
};
const roleRow = (rows: Row[], rolname: string) => {
  const r = rows.find(x => x.label.startsWith(`role ${rolname} (`));
  if (!r) throw new Error(`no row for role ${rolname}`);
  return r;
};
const exposed = (rows: Row[]) => rows.filter(r => r.verdict === 'EXPOSED').map(r => r.label);
const dump = (rows: Row[]) => rows.map(r => [r.ord, r.section, r.label, r.expected, r.actual, r.verdict].join(' | ')).join('\n');

describe('production as it was found', () => {
  const scenario = `${PRODUCTION_LIKE_NET_GRANTS}\n${GRANT_PG_NET_ACCESS_SQL}
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA net GRANT SELECT ON TABLES TO anon;
    GRANT USAGE ON SCHEMA net TO sapelee_growth_reader;`;

  it('names PUBLIC, anon and authenticated as exposed, with the secret-bearing columns', async () => {
    const db = await freshDb(scenario);
    const rows = await audit(db);

    expect(row(rows, 999).verdict).toBe('EXPOSED');
    expect(exposed(rows)).toEqual(expect.arrayContaining([
      expect.stringContaining('role public'),
      expect.stringContaining('role anon'),
      expect.stringContaining('role authenticated'),
    ]));

    for (const role of ['anon', 'authenticated']) {
      const r = roleRow(rows, role);
      expect(r.verdict).toBe('EXPOSED');
      expect(r.actual).toContain('schema=USAGE');
      expect(r.actual).toContain('net.http_request_queue=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE');
      expect(r.actual).toContain('net._http_response=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE');
      expect(r.actual).toContain('secret-bearing columns readable=net._http_response.content, net._http_response.headers, net.http_request_queue.body, net.http_request_queue.headers');
      expect(r.actual).toContain('sequence=SELECT,USAGE');
      expect(r.actual).toContain('request/response/worker functions=http_post');
    }
    // PUBLIC holds the table grants even where schema USAGE was never granted to it.
    expect(roleRow(rows, 'public').actual).toContain('net.http_request_queue=DELETE,INSERT');
  });

  it('reports the ownership the remediation has to preserve', async () => {
    const db = await freshDb(scenario);
    const rows = await audit(db);
    expect(row(rows, 10).actual).toContain('not installed'); // no real extension in the fixture
    expect(row(rows, 11).actual).toMatch(/^owner postgres, acl /);
    expect(row(rows, 12).actual).toMatch(/owner postgres, rls false\/false, acl /);
    expect(row(rows, 14).actual).toContain('net.http_request_queue_id_seq: owner postgres');
    expect(row(rows, 15).actual).toContain('http_post(');
    expect(row(rows, 16).actual).toContain('SECURITY DEFINER');
  });

  it('finds the event trigger that re-grants, and says exactly when it fires and to whom', async () => {
    const db = await freshDb(scenario);
    const rows = await audit(db);
    expect(row(rows, 30).actual).toContain('extensions.grant_pg_net_access');
    expect(row(rows, 31)).toMatchObject({ verdict: 'REVIEW' });
    expect(row(rows, 31).actual).toContain('issue_pg_net_access on ddl_command_end tags CREATE EXTENSION enabled O');
    expect(row(rows, 33).actual).toContain('GRANT ALL ON ALL TABLES IN SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role');
  });

  it('flags default privileges that would recreate access, and login roles that hold it', async () => {
    const db = await freshDb(scenario);
    const rows = await audit(db);
    // Only schema net can recreate THIS exposure; other schemas are reported apart.
    expect(row(rows, 50)).toMatchObject({ verdict: 'EXPOSED' });
    expect(row(rows, 50).actual).toContain('anon=');
    expect(row(rows, 50).actual).not.toContain('public ');
    expect(row(rows, 51)).toMatchObject({ verdict: 'REVIEW' });
    expect(row(rows, 51).actual).toContain('public tables');
    expect(row(rows, 52).verdict).toBe('INFO');
    expect(row(rows, 60).actual).toContain('authenticator');
    expect(row(rows, 60).actual).toContain('sapelee_growth_reader');
    expect(row(rows, 60).actual).toContain('password set');
    expect(row(rows, 61)).toMatchObject({ verdict: 'EXPOSED' });
    expect(row(rows, 61).actual).toContain('sapelee_growth_reader');
  });

  it('lists only functions that can actually be called: not trigger or event-trigger ones', async () => {
    // A function returning event_trigger holds PUBLIC EXECUTE by default, but
    // PostgreSQL refuses a direct call ("trigger functions can only be called as
    // triggers"), so listing it as a way in was a false positive.
    const db = await freshDb(`${scenario}
      CREATE FUNCTION public.reachable_reader() RETURNS bigint LANGUAGE sql SECURITY DEFINER
        AS $$ SELECT count(*) FROM net._http_response $$;`);
    const rows = await audit(db);
    const listed = roleRow(rows, 'anon').actual;
    expect(listed).toContain('functions outside net=public.reachable_reader');
    expect(listed).not.toContain('grant_pg_net_access');
    expect(listed).not.toContain('notify_push_on_alert');
  });

  it('prints no queued header, no body, no response content and no secret', async () => {
    const db = await freshDb(scenario);
    const text = dump(await audit(db));
    expect(text).not.toContain(FIXTURE_FAKE_SECRET);
    expect(text).not.toContain('x-push-secret');
    expect(text).not.toContain('"record"');
    expect(text).not.toContain('"ok":true');
    expect(text).not.toContain('fixture-not-a-real-password');
    // The queue still holds the row it never read.
    const left = await db.query('SELECT count(*)::int AS n FROM net.http_request_queue');
    expect(left.rows[0].n).toBe(1);
  });
});

describe('a hardened database', () => {
  // What Phase B is meant to achieve, expressed as the state the audit must call clean.
  const hardened = `
    REVOKE ALL ON net.http_request_queue, net._http_response FROM PUBLIC;
    REVOKE ALL ON SEQUENCE net.http_request_queue_id_seq FROM PUBLIC;
    REVOKE ALL ON SCHEMA net FROM PUBLIC;`;

  it('reports no exposure at all', async () => {
    const db = await freshDb(hardened);
    const rows = await audit(db);
    expect(exposed(rows)).toEqual([]);
    // postgres owns pg_net's objects and the login-role row stays REVIEW: both need a human, neither is an exposure.
    expect(row(rows, 999)).toMatchObject({ verdict: 'PASS', actual: '0 EXPOSED, 2 REVIEW' });
    expect(roleRow(rows, 'postgres').verdict).toBe('REVIEW');
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(roleRow(rows, role)).toMatchObject({ verdict: 'PASS' });
    }
  });

  it('still reports the facts the remediation is verified against', async () => {
    const db = await freshDb(hardened);
    const rows = await audit(db);
    expect(row(rows, 40).actual).toContain('pg_net.');
    // Statistics are approximate and can be reset; the audit reports them, never row contents.
    expect(row(rows, 42).actual).toMatch(/http_request_queue: live \d+, inserted \d+, deleted \d+/);
    expect(row(rows, 60).verdict).toBe('REVIEW');
  });

  it('changes nothing itself', async () => {
    const db = await freshDb(hardened);
    const snapshot = async () => (await db.query(`SELECT
      (SELECT count(*) FROM net.http_request_queue) AS queued,
      (SELECT count(*) FROM net._http_response) AS responses,
      (SELECT last_value FROM net.http_request_queue_id_seq) AS seq,
      (SELECT count(*) FROM pg_proc) AS procs,
      (SELECT count(*) FROM pg_roles) AS roles`)).rows[0];
    const before = await snapshot();
    await audit(db);
    expect(await snapshot()).toEqual(before);
  });
});

describe('the audit needs no privileges it should not have', () => {
  it('runs with pg_authid unreadable and says so rather than failing', async () => {
    const db = await freshDb(`REVOKE SELECT ON pg_authid FROM postgres;`);
    const rows = await audit(db);
    // Either it read it (superuser) or it reported it as unreadable; never an error.
    expect(row(rows, 60).actual).toMatch(/password set|no password|not readable/);
  });

  it('survives pg_net not being installed at all', async () => {
    const db = await createTestDb();
    open.push(db);
    await db.exec(ROLES_SQL);
    await db.exec(PLATFORM_ROLES_SQL);
    await db.exec(`CREATE TABLE public.placeholder (id int);`);
    const rows = await audit(db);
    expect(row(rows, 10).actual).toBe('not installed');
    expect(row(rows, 11).actual).toBe('schema net does not exist');
    expect(row(rows, 42).actual).toBe('(no pg_net tables)');
    expect(row(rows, 999).verdict).toBe('PASS');
  });
});
