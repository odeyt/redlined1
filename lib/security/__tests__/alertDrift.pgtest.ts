/**
 * PHASE D drift audit, EXECUTED against a real PostgreSQL.
 *
 *   npm run test:sql
 *
 * Four databases: one matching the repository, one carrying the PRE-2026-08-16
 * definition of alert_job_assigned, one missing job_cards.trg_free_tier_limit,
 * and one whose push trigger still holds a literal secret. The audit must say
 * which, and must never print that secret.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  FIXTURE_FAKE_SECRET, PLATFORM_ROLES_SQL, ROLES_SQL, functionStatement, readRepo, runOwnerSql,
  templateSql, type Row,
} from '../../marketing-capture/__tests__/support/ownerSqlFixture';
import { backendDescription, createTestDb, type TestDb } from '../../marketing-capture/__tests__/support/testDatabase';

const DRIFT = 'scripts/security/sql/alert-definition-drift.sql';

const open: TestDb[] = [];

beforeAll(() => {
  console.log(`[drift audit tests] executing against ${backendDescription()}`);
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
  // The fixture creates the free-tier trigger on job_cards only; the audit also
  // looks for it on customers and vehicles, as free_tier_usage_limits.sql does.
  await db.exec(`
    CREATE TRIGGER trg_free_tier_limit BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_count_limit();
    CREATE TRIGGER trg_free_tier_limit BEFORE INSERT ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.enforce_free_tier_count_limit();`);
  if (extraSql) await db.exec(extraSql);
  return db;
}

const drift = (db: TestDb) => runOwnerSql(db, DRIFT, {});
const row = (rows: Row[], ord: number) => {
  const r = rows.find(x => x.ord === ord);
  if (!r) throw new Error(`no row ${ord}`);
  return r;
};
const named = (rows: Row[], fname: string) => {
  const r = rows.find(x => x.ord < 20 && x.label === `public.${fname}`);
  if (!r) throw new Error(`no row for ${fname}`);
  return r;
};
const dump = (rows: Row[]) => rows.map(r => [r.ord, r.section, r.label, r.expected, r.actual, r.verdict].join(' | ')).join('\n');

/** The pre-guard (2026-08-13) definition of alert_job_assigned, from its own migration. */
const olderJobAssigned = () =>
  functionStatement(readRepo('supabase/migrations/2026-08-13_technicians_user_link.sql'), 'alert_job_assigned');

describe('a database that matches the repository', () => {
  it('reports MATCH for every function, every marker and the triggers', async () => {
    const db = await freshDb();
    const rows = await drift(db);
    for (const fname of ['alert_ro_status_changed', 'alert_ro_pending_approval', 'emit_alert_event',
      'record_ro_status_change', 'alert_job_assigned', 'alert_job_work_added']) {
      expect({ fname, verdict: named(rows, fname).verdict }).toEqual({ fname, verdict: 'MATCH' });
    }
    expect(row(rows, 30).verdict).toBe('MATCH');
    expect(row(rows, 41)).toMatchObject({ verdict: 'MATCH', actual: 'customers=present, job_cards=present, vehicles=present' });
    expect(row(rows, 43)).toMatchObject({ verdict: 'MATCH', actual: '(none)' });
    expect(row(rows, 999)).toMatchObject({ verdict: 'MATCH', actual: '0' });
  });

  it('does not repeat the source of anything that matches', async () => {
    const db = await freshDb();
    const rows = await drift(db);
    for (const r of rows.filter(x => x.ord === 50)) expect(r.actual).toBe('(matches the repository)');
  });
});

describe('production older than the repository', () => {
  it('names alert_job_assigned as DIFFERS and dates it by its missing 2026-08-16 markers', async () => {
    const db = await freshDb(olderJobAssigned());
    const rows = await drift(db);
    expect(named(rows, 'alert_job_assigned').verdict).toBe('DIFFERS');
    expect(row(rows, 20).actual).toContain('alert_job_assigned | membership guard (2026-08-16) | ABSENT');
    expect(row(rows, 20).actual).toContain('alert_job_assigned | warns when not a member (2026-08-16) | ABSENT');
    expect(row(rows, 30)).toMatchObject({ verdict: 'DIFFERS' });
    expect(row(rows, 30).actual).toMatch(/^OLDER: /);
    expect(row(rows, 30).actual).toContain('those migrations were never applied here');
  });

  it('prints the live source of the drifted function, so it can be diffed by eye', async () => {
    const db = await freshDb(olderJobAssigned());
    const rows = await drift(db);
    const source = rows.filter(r => r.ord === 50 && r.label.includes('alert_job_assigned'));
    expect(source).toHaveLength(1);
    expect(source[0].actual).toContain('job.assigned');
    expect(source[0].actual).not.toContain('is_member');
  });

  it('withholds a drifted definition that itself carries secret-shaped text', async () => {
    // If someone ever inlines a credential into an alert trigger, the audit must
    // report the drift without republishing the credential.
    const db = await freshDb(`
      CREATE OR REPLACE FUNCTION public.alert_job_assigned()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
      BEGIN
        -- authorization: ${FIXTURE_FAKE_SECRET}
        RETURN NEW;
      END $fn$;`);
    const rows = await drift(db);
    expect(named(rows, 'alert_job_assigned').verdict).toBe('DIFFERS');
    const source = rows.filter(r => r.ord === 50 && r.label.includes('alert_job_assigned'));
    expect(source).toHaveLength(1);
    expect(source[0].actual).toMatch(/^WITHHELD: this definition matches a secret-shaped pattern; md5 [0-9a-f]{32}$/);
    expect(dump(rows)).not.toContain(FIXTURE_FAKE_SECRET);
  });

  it('calls a whitespace-only change WHITESPACE, never MATCH', async () => {
    const src = readRepo('supabase/migrations/2026-08-03_ro_status_events.sql');
    const stmt = src.slice(src.indexOf('CREATE OR REPLACE FUNCTION public.record_ro_status_change('));
    const db = await freshDb(stmt.slice(0, stmt.indexOf('$fn$;') + 5).replace('BEGIN\n', 'BEGIN\n\n  '));
    const rows = await drift(db);
    expect(named(rows, 'record_ro_status_change').verdict).toBe('WHITESPACE');
    expect(row(rows, 999).verdict).toBe('DIFFERS');
  });

  it('calls a dropped function MISSING and a duplicated one DUPLICATE', async () => {
    const dropped = await freshDb('DROP TRIGGER job_cards_alert_work_added ON public.job_cards; DROP FUNCTION public.alert_job_work_added();');
    expect(named(await drift(dropped), 'alert_job_work_added').verdict).toBe('MISSING');

    const duplicated = await freshDb(`CREATE FUNCTION public.emit_alert_event(p_only text)
      RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;`);
    expect(named(await drift(duplicated), 'emit_alert_event').verdict).toBe('DUPLICATE');
  });
});

describe('the missing free-tier trigger', () => {
  it('reports exactly which tables lack trg_free_tier_limit', async () => {
    const db = await freshDb('DROP TRIGGER trg_free_tier_limit ON public.job_cards;');
    const rows = await drift(db);
    expect(row(rows, 41)).toMatchObject({
      verdict: 'DIFFERS',
      actual: 'customers=present, job_cards=ABSENT, vehicles=present',
    });
    expect(row(rows, 40).actual).not.toContain('job_cards.trg_free_tier_limit');
    expect(row(rows, 999).verdict).toBe('DIFFERS');
  });

  it('reports a disabled trigger, which fires nothing even though it exists', async () => {
    const db = await freshDb('ALTER TABLE public.repair_orders DISABLE TRIGGER repair_orders_alert_status_changed;');
    const rows = await drift(db);
    expect(row(rows, 43)).toMatchObject({ verdict: 'DIFFERS' });
    expect(row(rows, 43).actual).toContain('repair_orders.repair_orders_alert_status_changed = D');
  });
});

describe('the push trigger', () => {
  const literalSecret = `
    CREATE OR REPLACE FUNCTION public.notify_push_on_alert()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
    BEGIN
      PERFORM net.http_post(
        url := 'https://www.redlined1.com/api/push/send',
        headers := jsonb_build_object('x-push-secret', '${FIXTURE_FAKE_SECRET}'),
        body := jsonb_build_object('record', to_jsonb(NEW)));
      RETURN NEW;
    END $fn$;`;

  it('never prints its source, even when that source carries a literal secret', async () => {
    const db = await freshDb(literalSecret);
    const text = dump(await drift(db));
    expect(text).not.toContain(FIXTURE_FAKE_SECRET);
    expect(text).not.toContain('x-push-secret');
  });

  it('reports the literal as a missing Vault marker, which dates it before the rotation', async () => {
    const db = await freshDb(literalSecret);
    const rows = await drift(db);
    expect(row(rows, 20).actual).toContain('notify_push_on_alert | reads the secret from Vault, not a literal | ABSENT');
    expect(row(rows, 60).actual).toMatch(/^1 definition\(s\), md5 [0-9a-f]{32}/);
    expect(row(rows, 60).actual).toContain('SECURITY DEFINER');
  });

  it('reports the Vault-backed definition as present, still without printing it', async () => {
    const db = await freshDb();
    const rows = await drift(db);
    expect(row(rows, 20).actual).toContain('notify_push_on_alert | reads the secret from Vault, not a literal | present');
    expect(row(rows, 20).actual).toContain('notify_push_on_alert | exactly one net.http_post | present');
    expect(dump(rows)).not.toContain('decrypted_secret');
  });
});

describe('the audit itself', () => {
  it('changes nothing', async () => {
    const db = await freshDb();
    const snapshot = async () => (await db.query(`SELECT
      (SELECT count(*) FROM pg_proc) AS procs,
      (SELECT count(*) FROM pg_trigger) AS trigs,
      (SELECT count(*) FROM public.alert_events) AS alerts`)).rows[0];
    const before = await snapshot();
    await drift(db);
    expect(await snapshot()).toEqual(before);
  });

  it('pins the same repository fingerprints the capture does', async () => {
    const sql = readFileSync(join(__dirname, '..', '..', '..', DRIFT), 'utf8').replace(/\r/g, '');
    const { PINNED_FUNCTIONS, functionBody, prosrcMd5 } = await import('../../marketing-capture/alertExpectation');
    for (const fn of PINNED_FUNCTIONS) {
      const body = functionBody(readRepo(fn.file), fn.name);
      expect(sql).toContain(`'${fn.name}', '${prosrcMd5(body!)}'`);
    }
  });
});
