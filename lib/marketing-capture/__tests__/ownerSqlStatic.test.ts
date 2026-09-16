/**
 * What the owner SQL files must be true of without a database: read-only, ASCII,
 * never reading a queued header or body, and agreeing with the TypeScript the
 * capture runs. Behaviour is proved by executing them (ownerSql.pgtest.ts).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ALERT_EVENTS, ALERT_ROLES } from '@/lib/alerts/catalogue';
import { EXPECTED_ALERTS, PINNED_FUNCTIONS, normalizedProsrcMd5, prosrcMd5 } from '../alertExpectation';
import { PRODUCTION_DEFINITIONS } from '../productionDefinitions';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r/g, '');
const START = 'scripts/marketing/sql/owner-start.sql';
const FINISH = 'scripts/marketing/sql/owner-finish.sql';
const files = { START: read(START), FINISH: read(FINISH) };
/** Comments and string literals removed, so keyword checks see only code. */
const code = (t: string) => t.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''");

describe.each(Object.entries(files))('%s', (_name, sql) => {
  it('is one read-only transaction that rolls back', () => {
    expect(sql).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true);
    expect(sql.split('BEGIN TRANSACTION READ ONLY;').length - 1).toBe(1);
    expect(sql.split(/^ROLLBACK;$/m).length - 1).toBe(1);
  });

  it('contains no write, DDL, role switch, HTTP call or sequence movement', () => {
    const body = code(sql);
    expect(body).not.toMatch(/\b(insert|update|delete|merge|upsert|truncate|copy|alter|create|drop|grant|revoke|vacuum|analyze|reindex|cluster|refresh|lock|commit|savepoint|do|execute|perform|call|listen|notify)\b/i);
    expect(body).not.toMatch(/\b(set|reset)\b/i);
    expect(body).not.toMatch(/set_config|nextval|setval|currval|pg_advisory|pg_terminate|pg_cancel|dblink|pg_read_file|lo_import/i);
    expect(body).not.toMatch(/net\s*\.\s*http_(get|post|put|patch|delete|head)/i);
  });

  it('never reads a queued request header or body: the queue is read by id alone', () => {
    // `headers` and `body` may appear only as privilege-check arguments, which are string literals.
    const body = code(sql);
    expect(body).not.toMatch(/\bheaders\b/i);
    expect(body).not.toMatch(/\bbody\b/i);
    // Wherever the queue is read, `q` is its alias, and only its id may be touched.
    expect(sql).not.toMatch(/net\.http_request_queue\s+(?!q\b)[a-z]/);
    expect([...new Set([...sql.matchAll(/\bq\.([a-z_]+)/g)].map(m => m[1]))]).toEqual(
      sql.includes('net.http_request_queue q') ? ['id'] : []);
    // The response table is read by one CTE, whose columns are listed here.
    const respCte = sql.includes('resp AS (') ? sql.slice(sql.indexOf('resp AS ('), sql.indexOf('),', sql.indexOf('resp AS ('))) : '';
    if (respCte) {
      expect(respCte).toContain('net._http_response r');
      expect([...new Set([...respCte.matchAll(/\br\.([a-z_]+)/g)].map(m => m[1]))].sort())
        .toEqual(['content', 'error_msg', 'id', 'status_code', 'timed_out']);
    }
  });

  it('is ASCII only, so a paste cannot alter a literal', () => {
    // The editor has mangled non-ASCII before; the one arrow the titles need is chr(8594).
    expect(sql).toMatch(/^[\x09\x0a\x20-\x7e]*$/);
  });

  it('calls only read-only catalog, privilege, string and aggregate functions', () => {
    const calls = [...new Set([...code(sql).matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/gi)].map(m => m[1].toLowerCase()))].sort();
    const allowed = new Set([
      'bool_or', 'btrim', 'chr', 'coalesce', 'concat_ws', 'count', 'current_setting', 'greatest',
      'has_column_privilege', 'has_function_privilege', 'has_schema_privilege', 'has_sequence_privilege',
      'has_table_privilege', 'jsonb_object_keys', 'jsonb_typeof', 'left', 'length', 'lower', 'md5', 'now',
      'pg_get_serial_sequence', 'pg_input_is_valid', 'position', 'quote_ident', 'regexp_match', 'regexp_replace',
      'replace', 'row_number', 'string_agg', 'to_char', 'to_regclass', 'values',
      // CTE and derived-table names, which the same pattern matches
      'alert_pairs', 'checks', 'expected', 'fn_pin', 'net_col', 'net_rel', 'tpriv', 'who', 'sp', 'key', 'n',
    ]);
    const keywords = new Set([
      'and', 'as', 'bool_and', 'case', 'exists', 'filter', 'from', 'in', 'join', 'max', 'min', 'not', 'or',
      'order', 'over', 'partition', 'select', 'when', 'where',
    ]);
    expect(calls.filter(c => !allowed.has(c) && !keywords.has(c))).toEqual([]);
  });

  it('ends with one verdict row the owner can act on', () => {
    expect(sql).toMatch(/SELECT 999, 'VERDICT'/);
  });
});

describe('the two files agree with each other and with the capture', () => {
  const block = (sql: string, from: string, to: string) => {
    const a = sql.indexOf(from);
    const b = sql.indexOf(to, a);
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    return sql.slice(a, b);
  };

  it('pin the same triggers, byte for byte', () => {
    const pin = (sql: string) => block(sql, "    'alert_events.alert_events_push", 'AS expected,');
    expect(pin(files.START)).toBe(pin(files.FINISH));
    expect(pin(files.START)).toContain('repair_orders.repair_orders_alert_status_changed O AFTER UPDATE ROW public.alert_ro_status_changed');
    // Production has no free-tier trigger (drift audit 2026-09-16, row 41); the pin is production's set.
    expect(pin(files.START)).not.toContain('trg_free_tier_limit');
  });

  it('pin the same function fingerprints, and they are the production definitions', () => {
    const pin = (sql: string) => block(sql, 'fn_pin (ord, fname, exact_md5, normalized_md5) AS (VALUES', '\n),');
    expect(pin(files.START)).toBe(pin(files.FINISH));
    const rows = [...pin(files.START).matchAll(/\((\d+), '([a-z_]+)', '([0-9a-f]{32})', '([0-9a-f]{32})'\)/g)];
    expect(rows.map(([, , name]) => name)).toEqual(PINNED_FUNCTIONS.map(f => f.name));
    rows.forEach(([, , name, exact, normalized]) => {
      const live = PRODUCTION_DEFINITIONS.find(d => d.name === name);
      expect(live).toBeDefined();
      // Hashed from the pinned body itself, not copied from the recorded value.
      expect(exact).toBe(prosrcMd5(live!.prosrc));
      expect(normalized).toBe(normalizedProsrcMd5(live!.prosrc));
    });
  });

  it("FINISH expects exactly the capture's EXPECTED_ALERTS, in order", () => {
    const rows = [...files.FINISH.matchAll(/\((\d), '(ro\.[a-z_]+)', '([^']+)', '([^']+)', '([^']+)'(?: \|\| chr\(8594\) \|\| '([^']+)')?\)/g)];
    const parsed = rows.map(m => ({
      k: Number(m[1]), eventType: m[2], oldStatus: m[3], newStatus: m[4],
      title: m[6] === undefined ? m[5] : `${m[5]}→${m[6]}`,
    }));
    expect(parsed).toEqual(EXPECTED_ALERTS.map(a => ({ ...a })));
  });

  it('START mutes exactly the catalogue pairs the capture checks', () => {
    const pairs = [...block(files.START, 'alert_pairs (role_key, event_id) AS (VALUES', '\n),')
      .matchAll(/\('([a-z]+)', '([a-z._]+)'\)/g)].map(m => `${m[1]}:${m[2]}`).sort();
    const expected = ALERT_ROLES
      .flatMap(role => ALERT_EVENTS.filter(e => e.roles.includes(role)).map(e => `${role}:${e.id}`)).sort();
    expect(pairs).toEqual(expected);
    expect(files.START).toContain(`'${expected.length} of ${expected.length}'`);
  });

  it('both read the tables the walkthrough writes, and only those', () => {
    const tables = [...new Set([...files.START.matchAll(/(?:FROM|JOIN)\s+public\.([a-z_]+)/g)].map(m => m[1]))].sort();
    expect(tables).toEqual([
      'alert_events', 'customers', 'job_cards', 'push_subscriptions', 'repair_orders',
      'sapelee_event_outbox', 'shop_mirrors', 'shop_settings', 'shop_users', 'shops', 'technicians',
    ]);
  });

  it('the placeholders are the only thing the owner edits', () => {
    expect([...files.START.matchAll(/__[A-Z_]+__/g)].map(m => m[0])).toEqual(['__DEMO_SHOP_ID__', '__DEMO_SHOP_ID__', '__DEMO_SHOP_ID__']);
    expect([...new Set([...files.FINISH.matchAll(/__[A-Z_]+__/g)].map(m => m[0]))].sort())
      .toEqual(['__LEDGER_TOKEN__', '__START_TOKEN__']);
  });
});
