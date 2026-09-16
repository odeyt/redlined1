/**
 * What the security audits must be true of without a database: read-only,
 * ASCII, parameterless, and incapable of printing a secret. Their behaviour is
 * proved by executing them (pgNetAudit.pgtest.ts, alertDrift.pgtest.ts).
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PINNED_FUNCTIONS, functionBody, normalizedProsrcMd5, prosrcMd5 } from '../../marketing-capture/alertExpectation';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r/g, '');
const AUDIT = 'scripts/security/sql/pg-net-privilege-audit.sql';
const DRIFT = 'scripts/security/sql/alert-definition-drift.sql';
const CLI_ROLE = 'scripts/security/sql/cli-login-role-audit.sql';
const files = { AUDIT: read(AUDIT), DRIFT: read(DRIFT), CLI_ROLE: read(CLI_ROLE) };
/** Comments and string literals removed, so keyword checks see only code. */
const code = (t: string) => t.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''");

describe('both audits are pinned by SHA-256', () => {
  // A pin is a review boundary, not a quality check: changing either file changes
  // what was approved, so the hash must be updated in the same change and
  // reviewed with it. Hashes are over the file with CRLF normalised to LF.
  it.each([
    ['PHASE A pg_net privilege audit', AUDIT, '0927f12569c1e827ec3e0f8dc540ec4318273f1626ba24c79eacbdc5b38a77b1'],
    ['PHASE D alert definition drift', DRIFT, 'd7c70d4169d2a2a455d5e384095f4e6aeecb4064f17ccc0ca246e4de13ae516d'],
    ['cli_login_postgres dependency audit', CLI_ROLE, 'ce675a40937c50942f4529f11d4c2ad560efee42dcefc11e1ab3922a77db186f'],
  ])('%s still hashes to the reviewed value', (_name, path, expected) => {
    expect(createHash('sha256').update(read(path), 'utf8').digest('hex')).toBe(expected);
  });
});

describe.each(Object.entries(files))('%s', (_name, sql) => {
  it('is one read-only transaction that rolls back', () => {
    expect(sql).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true);
    expect(sql.split('BEGIN TRANSACTION READ ONLY;').length - 1).toBe(1);
  });

  it('contains no write, DDL, role switch, HTTP call or sequence movement', () => {
    const body = code(sql);
    expect(body).not.toMatch(/\b(insert|update|delete|merge|upsert|truncate|copy|alter|create|drop|grant|revoke|vacuum|analyze|reindex|cluster|refresh|lock|commit|savepoint|do|execute|perform|call|listen|notify)\b/i);
    expect(body).not.toMatch(/\b(set|reset)\b/i);
    expect(body).not.toMatch(/set_config|nextval|setval|currval|pg_advisory|pg_terminate|pg_cancel|dblink|pg_read_file|lo_import/i);
    expect(body).not.toMatch(/net\s*\.\s*http_(get|post|put|patch|delete|head)/i);
  });

  it('needs no editing: it takes no parameter and has no placeholder', () => {
    expect(sql).not.toMatch(/__[A-Z_]+__/);
  });

  it('is ASCII only, so a paste cannot alter a literal', () => {
    expect(sql).toMatch(/^[\x09\x0a\x20-\x7e]*$/);
  });

  it('never reads a queued header, a request body, a response body or a password', () => {
    const body = code(sql);
    // These words may appear only inside string literals (column names passed to
    // has_column_privilege, and marker patterns), never as columns being read.
    expect(body).not.toMatch(/\bheaders\b/i);
    expect(body).not.toMatch(/\bbody\b/i);
    expect(body).not.toMatch(/\bcontent\b/i);
    expect(body).not.toMatch(/\bdecrypted_secret\b/i);
    expect(sql).not.toMatch(/FROM\s+(net\.)?http_request_queue/i);
    expect(sql).not.toMatch(/FROM\s+net\._http_response/i);
    expect(sql).not.toMatch(/FROM\s+vault\./i);
    // pg_stat_activity is read for the worker's identity, never for query text.
    if (sql.includes('pg_stat_activity')) expect(body).not.toMatch(/\bquery\b/i);
  });

  it('prints a password only as the fact that one exists', () => {
    expect(files.AUDIT).not.toMatch(/SELECT[^;]*\brolpassword\b(?![^;]*IS NULL)/i);
    expect(code(files.AUDIT)).not.toMatch(/\bpasswd\b|\bpg_shadow\b/i);
  });
});

describe('the pg_net privilege audit', () => {
  const sql = files.AUDIT;

  it('audits every role the security hold names, plus every login role', () => {
    for (const role of ['public', 'anon', 'authenticated', 'service_role', 'authenticator',
      'postgres', 'supabase_admin', 'supabase_functions_admin', 'sapelee_growth_reader']) {
      expect({ role, present: sql.includes(`('${role}',`) }).toEqual({ role, present: true });
    }
    expect(sql).toContain('WHERE r.rolcanlogin');
  });

  it('checks schema, table, column, sequence and function privileges', () => {
    expect(sql).toContain("has_schema_privilege(r.rolname, 'net', 'USAGE')");
    expect(sql).toContain("has_schema_privilege(r.rolname, 'net', 'CREATE')");
    expect(sql).toContain('has_table_privilege(r.rolname, nr.oid, t.priv)');
    expect(sql).toContain("has_column_privilege(r.rolname, nr.oid, nc.col, 'SELECT')");
    expect(sql).toContain('has_sequence_privilege(r.rolname, s.oid, sp.priv)');
    expect(sql).toContain("has_function_privilege(r.rolname, f.oid, 'EXECUTE')");
    for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      expect(sql).toContain(`('${priv}')`);
    }
  });

  it('names the secret-bearing columns only as privilege arguments', () => {
    const asArguments = [...sql.matchAll(/'(headers|body|content)'/g)].length;
    expect(asArguments).toBe(4); // queue headers+body, response headers+content
    expect(sql).toContain("('net.http_request_queue', 'headers'), ('net.http_request_queue', 'body')");
  });

  it('covers ownership, the re-granting event trigger, the worker and default privileges', () => {
    for (const fragment of [
      'n.nspowner::regrole::text AS owner',
      'c.relowner::regrole::text',
      'p.proowner::regrole::text AS owner',
      "p.proname = 'grant_pg_net_access'",
      'FROM pg_event_trigger e',
      "s.name LIKE 'pg\\_net.%'",
      'FROM pg_default_acl d',
      'FROM pg_stat_all_tables s',
      'pg_get_serial_sequence',
    ]) {
      expect({ fragment, present: sql.includes(fragment) }).toEqual({ fragment, present: true });
    }
  });

  it('withholds the granter source if it ever looks sensitive', () => {
    expect(sql).toContain("p.prosrc ~* 'secret|password|token|vault|decrypted|apikey|api_key|authorization' AS looks_sensitive");
    expect(sql).toContain('WITHHELD: source matches a secret-shaped pattern');
  });

  it('excludes trigger and event-trigger functions, which cannot be called directly', () => {
    expect(sql).toContain("p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype) AS not_callable");
    expect(sql).toContain("WHERE n.nspname = 'net' AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)");
    expect(sql).toContain('WHERE NOT f.not_callable AND has_function_privilege');
  });

  it('scopes the default-ACL exposure to schema net, and reports other schemas separately', () => {
    expect(sql).toContain("n.nspname IS NOT DISTINCT FROM 'net' AS in_net");
    expect(sql).toContain("WHEN EXISTS (SELECT 1 FROM defacl WHERE in_net AND grants_broadly) THEN 'EXPOSED'");
    expect(sql).toContain("WHERE NOT in_net AND grants_broadly) THEN 'REVIEW'");
    expect(sql).toContain("SELECT 52, 'E default privileges', 'every other default ACL'");
  });

  it('treats PUBLIC, anon and authenticated holding anything as EXPOSED', () => {
    expect(sql).toContain("WHEN m.rolname IN ('public', 'anon', 'authenticated') THEN 'EXPOSED'");
    expect(sql).toContain("SELECT 999, 'VERDICT', 'exposures found', '0 EXPOSED'");
  });
});

describe('the cli_login_postgres audit', () => {
  const sql = files.CLI_ROLE;

  it('contains no statement that could change the role or its objects', () => {
    const body = code(sql);
    expect(body).not.toMatch(/(alter|drop|reassign|grant|revoke|create)/i);
    // The words appear only in prose telling the operator what to do next.
    expect(sql).toContain('ALTER ROLE ... NOLOGIN');
  });

  it('names exactly one role, hard-coded, with no parameter', () => {
    expect(sql).toContain("WHERE r.rolname = 'cli_login_postgres'");
    expect([...new Set([...sql.matchAll(/'cli_login_postgres'/g)].map(m => m[0]))]).toHaveLength(1);
  });

  it('covers every dependency a DROP would trip over', () => {
    for (const fragment of [
      'FROM pg_stat_activity a JOIN target t',     // sessions
      'FROM pg_auth_members m JOIN target t ON m.member = t.oid',  // memberships
      'FROM pg_auth_members m JOIN target t ON m.roleid = t.oid',  // members
      "pg_has_role(r.rolname, t.oid, 'SET')",      // SET ROLE reachability
      'FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN target t ON c.relowner = t.oid',
      'JOIN target t ON p.proowner = t.oid',
      'JOIN target t ON n.nspowner = t.oid',
      'JOIN target t ON ty.typowner = t.oid',
      'JOIN target t ON d.datdba = t.oid',         // database ownership
      'FROM pg_shdepend s JOIN target t',          // shared dependencies
      'LATERAL aclexplode(c.relacl) a',            // grants it issued
      'FROM pg_default_acl d LEFT JOIN pg_namespace n',
      'FROM pg_policy p JOIN pg_class c',
    ]) {
      expect({ fragment, present: sql.includes(fragment) }).toEqual({ fragment, present: true });
    }
  });

  it('blocks on an open session', () => {
    // The non-zero branch cannot be reached by the executed tests: the harness
    // has one connection and cannot open a second as another role. The branch is
    // pinned here so it cannot be weakened silently.
    expect(sql).toContain("CASE WHEN (SELECT n FROM sessions) = 0 THEN 'PASS' ELSE 'BLOCKS' END");
    expect(sql).toContain("WHEN (SELECT n FROM sessions) > 0 THEN 'NOT YET: '");
  });

  it('separates the reversible step from the irreversible one', () => {
    expect(sql).toContain("SELECT 900, 'VERDICT', 'is ALTER ROLE ... NOLOGIN safe? (reversible in one statement)'");
    expect(sql).toContain("SELECT 901, 'VERDICT', 'is DROP ROLE safe? (not reversible in place)'");
    expect(sql).toContain('Re-run in every other database before dropping');
  });

  it('says what password expiry does not prevent', () => {
    expect(sql).toContain('does not stop SET ROLE by a member');
  });
});

describe('the alert definition drift audit', () => {
  const sql = files.DRIFT;

  it('pins the repository fingerprints the capture derives its alert count from', () => {
    for (const fn of PINNED_FUNCTIONS) {
      const body = functionBody(read(fn.file), fn.name);
      expect(body).not.toBeNull();
      expect(sql).toContain(`'${fn.name}', '${prosrcMd5(body!)}', '${normalizedProsrcMd5(body!)}'`);
    }
  });

  it('separates an exact match from a whitespace-only match', () => {
    expect(sql).toContain("WHEN c.live_md5 = c.repo_md5 THEN 'MATCH'");
    expect(sql).toContain("WHEN c.live_norm = c.repo_norm THEN 'WHITESPACE'");
  });

  it('dates definitions by markers, including the ones the security hold mentions', () => {
    expect(sql).toContain("'alert_job_assigned', 'membership guard (2026-08-16)'");
    expect(sql).toContain("'alert_invoice_paid', 'keys on NEW.number, not NEW.id (fixed 2026-08-16)'");
    expect(sql).toContain("'alert_ro_status_changed', 'skips Pending Approval'");
    expect(sql).toContain("'notify_push_on_alert', 'reads the secret from Vault, not a literal'");
  });

  it('looks for trg_free_tier_limit on all three tables it belongs to', () => {
    expect(sql).toContain("free_tier (tbl) AS (VALUES ('customers'), ('vehicles'), ('job_cards'))");
    expect(sql).toContain("t.tgname = 'trg_free_tier_limit'");
  });

  it('reports disabled triggers, which exist but fire nothing', () => {
    expect(sql).toContain("WHERE t.enabled <> 'O'");
  });

  it('never prints the push trigger source, only its md5 and markers', () => {
    const pushRow = sql.slice(sql.indexOf("SELECT 60, 'F push trigger'"));
    expect(pushRow).toContain('source never printed');
    expect(pushRow).toContain("string_agg(l.exact_md5, ',')");
    expect(pushRow).not.toMatch(/l\.prosrc|\bsrc\b/);
    // The only place a source is printed guards on a secret-shaped pattern first.
    expect(sql).toContain('WHEN v.looks_sensitive THEN');
    expect(sql).toContain('WITHHELD: this definition matches a secret-shaped pattern');
  });

  it('installs nothing: no repository definition appears in it', () => {
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION/i);
    expect(sql).toContain('no repository definition is installed from');
  });
});
