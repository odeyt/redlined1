/**
 * The cli_login_postgres dependency audit, EXECUTED against a real PostgreSQL.
 *
 *   npm run test:sql
 *
 * Four databases: a role with nothing depending on it, a role that owns things
 * and has issued grants, a role reachable by SET ROLE, and no role at all. The
 * audit must reach the right verdict in each, and never print a password hash
 * or a statement someone is running.
 */
import { runOwnerSql, type Row } from '../../marketing-capture/__tests__/support/ownerSqlFixture';
import { backendDescription, createTestDb, type TestDb } from '../../marketing-capture/__tests__/support/testDatabase';

const AUDIT = 'scripts/security/sql/cli-login-role-audit.sql';
const ROLE = 'cli_login_postgres';

const open: TestDb[] = [];

beforeAll(() => {
  console.log(`[cli-role audit tests] executing against ${backendDescription()}`);
});

afterAll(async () => {
  for (const db of open) await db.close().catch(() => undefined);
}, 60_000);

/** An expired login role, as production has it, plus whatever the scenario adds. */
async function freshDb(extraSql = '', createRole = true): Promise<TestDb> {
  const db = await createTestDb();
  open.push(db);
  if (createRole) {
    await db.exec(`CREATE ROLE ${ROLE} LOGIN PASSWORD 'fixture-not-a-real-password' VALID UNTIL '2026-09-08';`);
  }
  if (extraSql) await db.exec(extraSql);
  return db;
}

const audit = (db: TestDb) => runOwnerSql(db, AUDIT, {});
const row = (rows: Row[], ord: number) => {
  const r = rows.find(x => x.ord === ord);
  if (!r) throw new Error(`no row ${ord}`);
  return r;
};
const blocks = (rows: Row[]) => rows.filter(r => r.ord < 900 && r.verdict === 'BLOCKS').map(r => r.ord);
const dump = (rows: Row[]) => rows.map(r => [r.ord, r.section, r.label, r.expected, r.actual, r.verdict].join(' | ')).join('\n');

describe('a role nothing depends on', () => {
  it('reports the attributes, the expiry and that both NOLOGIN and DROP are safe', async () => {
    const db = await freshDb();
    const rows = await audit(db);
    expect(row(rows, 10).actual).toMatch(/^yes: login=true, superuser=false/);
    // The stored timestamp is resolved in the session's time zone, so the date
    // shown may be the day before; what matters is that it reads as expired.
    expect(row(rows, 11).actual).toMatch(/^2026-09-0[78] .* \(EXPIRED\)$/);
    expect(row(rows, 13).actual).toBe('password set');
    expect(row(rows, 20)).toMatchObject({ actual: '0', verdict: 'PASS' });
    expect(blocks(rows)).toEqual([]);
    expect(row(rows, 900).verdict).toBe('PASS');
    expect(row(rows, 901).actual).toMatch(/^safe on the evidence here/);
    expect(row(rows, 999)).toMatchObject({ verdict: 'PASS' });
  });

  it('says plainly what the expiry does not prevent', async () => {
    const rows = await audit(await freshDb());
    expect(row(rows, 12).actual).toContain('does not stop SET ROLE by a member');
  });

  it('changes nothing', async () => {
    const db = await freshDb();
    const snapshot = async () => (await db.query(`SELECT
      (SELECT count(*) FROM pg_roles) AS roles,
      (SELECT count(*) FROM pg_class) AS rels,
      (SELECT count(*) FROM pg_auth_members) AS members`)).rows[0];
    const before = await snapshot();
    await audit(db);
    expect(await snapshot()).toEqual(before);
  });
});

describe('a role things depend on', () => {
  const owning = `
    CREATE SCHEMA owned AUTHORIZATION ${ROLE};
    SET ROLE ${ROLE};
    CREATE TABLE owned.t (id int);
    CREATE FUNCTION owned.f() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;
    GRANT SELECT ON owned.t TO PUBLIC;
    ALTER DEFAULT PRIVILEGES IN SCHEMA owned GRANT SELECT ON TABLES TO PUBLIC;
    RESET ROLE;
    ALTER TABLE owned.t ENABLE ROW LEVEL SECURITY;
    CREATE POLICY only_cli ON owned.t TO ${ROLE} USING (true);`;

  it('blocks a DROP and names every dependency', async () => {
    const db = await freshDb(owning);
    const rows = await audit(db);
    expect(row(rows, 40).actual).toContain('owned.t');
    expect(row(rows, 42).actual).toContain('owned.f');
    expect(row(rows, 43).actual).toContain('owned');
    expect(row(rows, 50).actual).toContain('owned.t -> ');
    expect(row(rows, 51).actual).toContain('owned');
    expect(row(rows, 60).actual).toContain('only_cli');
    expect(row(rows, 46).actual).not.toBe('(none)');
    expect(blocks(rows)).toEqual([40, 42, 43, 50, 51, 60]);
    expect(row(rows, 901)).toMatchObject({ verdict: 'BLOCKS' });
    expect(row(rows, 901).actual).toMatch(/^NO: \d+ owned object/);
    // Disabling is still safe, and that is the point of the disable-first order.
    expect(row(rows, 900).verdict).toBe('PASS');
    expect(row(rows, 999).actual).toMatch(/^NOLOGIN only\. 6 finding\(s\) block a DROP$/);
  });

  it('reports who can reach the role, which no expiry prevents', async () => {
    const db = await freshDb(`CREATE ROLE operator LOGIN PASSWORD 'fixture-not-a-real-password'; GRANT ${ROLE} TO operator;`);
    const rows = await audit(db);
    expect(row(rows, 31)).toMatchObject({ actual: 'operator', verdict: 'REVIEW' });
    expect(row(rows, 32).actual).toContain('operator');
    expect(row(rows, 999).verdict).toBe('REVIEW');
  });

  it('reports memberships the role itself holds', async () => {
    const db = await freshDb(`CREATE ROLE reporting; GRANT reporting TO ${ROLE};`);
    expect(row(await audit(db), 30).actual).toBe('reporting');
  });
});

describe('safety of the audit itself', () => {
  it('prints no password hash and no statement text', async () => {
    const db = await freshDb(`CREATE TABLE public.decoy (id int);`);
    const text = dump(await audit(db));
    expect(text).not.toContain('fixture-not-a-real-password');
    expect(text).not.toMatch(/SCRAM-SHA-256|\bmd5[0-9a-f]{20,}/);
    expect(text).not.toContain('SELECT count(*) FROM pg_roles');
  });

  it('handles the role already being gone', async () => {
    const rows = await audit(await freshDb('', false));
    expect(row(rows, 10).actual).toBe('no: the role is absent');
    expect(row(rows, 900).actual).toContain('not applicable');
    expect(row(rows, 901).actual).toContain('not applicable');
    expect(row(rows, 999).verdict).toBe('PASS');
  });

  it('names the database it ran in, because ownership is per-database', async () => {
    const rows = await audit(await freshDb());
    expect(row(rows, 41).actual).toMatch(/\w/);
    expect(row(rows, 901).actual).toContain('Re-run in every other database');
  });
});
