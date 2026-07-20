import fs from 'fs';
import path from 'path';

/**
 * Static safety checks on docs/MESSAGING_SECRETS_MIGRATION.sql.
 *
 * There is no live-Postgres test harness in this repo (no pg-mem /
 * testcontainers / local Supabase instance wired into Jest), and per
 * explicit instruction this migration is not executed against any
 * database as part of this change. These tests instead assert the
 * SAFETY INVARIANTS the migration text must satisfy — they catch a
 * regression if someone later reintroduces a backfill/scrub step against
 * shop_settings (production has no messaging_settings column — see the
 * header note in the migration file — so any such step would be
 * fabricated, not a real requirement). They are not a substitute for
 * running the migration's own embedded verification queries against a
 * real (staging) database.
 *
 * Normalizes CRLF → LF: git's core.autocrlf (default on Windows checkouts)
 * rewrites this file's line endings on commit/checkout, and several checks
 * below search for literal "\n"-containing substrings — without this, those
 * searches silently fail to match a CRLF-checked-out copy of the file.
 */
const sql = fs.readFileSync(
  path.resolve(__dirname, '../../docs/MESSAGING_SECRETS_MIGRATION.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('MESSAGING_SECRETS_MIGRATION.sql — single additive migration', () => {
  it('creates the table idempotently (IF NOT EXISTS)', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.shop_messaging_secrets/);
  });

  it('enables and forces RLS with no policies (default-deny for every non-service_role)', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/);
    // No actual CREATE POLICY statement (a bare mention in an explanatory
    // comment is fine and expected).
    expect(sql).not.toMatch(/^\s*CREATE POLICY/m);
  });

  it('revokes anon/authenticated and grants only service_role', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.shop_messaging_secrets FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT ALL ON public\.shop_messaging_secrets TO service_role/);
  });

  it('never references shop_settings at all — this migration is purely additive and independent of it', () => {
    // Only the header's explanatory note is allowed to mention
    // shop_settings, describing why there's nothing to migrate from it.
    // No executable statement anywhere may name the table.
    const executableLines = sql
      .split('\n')
      .filter(l => !l.trim().startsWith('--') && l.trim().length > 0);
    for (const line of executableLines) {
      expect(line).not.toMatch(/shop_settings\b/);
    }
  });

  it('contains no INSERT/backfill logic of any kind', () => {
    expect(sql).not.toMatch(/^\s*INSERT INTO/m);
    expect(sql).not.toMatch(/ON CONFLICT/);
    expect(sql).not.toMatch(/COALESCE\(shop_messaging_secrets\./);
  });

  it('contains no UPDATE/DELETE/scrub logic (no Phase B, no source column to strip)', () => {
    expect(sql).not.toMatch(/^\s*UPDATE /m);
    expect(sql).not.toMatch(/^\s*DELETE FROM/m);
    // The nonexistent old column name may only appear in explanatory
    // comments (describing the corrected finding), never in an executable
    // statement.
    const executableLines = sql
      .split('\n')
      .filter(l => !l.trim().startsWith('--') && l.trim().length > 0);
    for (const line of executableLines) {
      expect(line).not.toMatch(/messaging_settings/);
    }
  });

  it('does not contain a PHASE A / PHASE B two-phase structure', () => {
    expect(sql).not.toMatch(/PHASE A/);
    expect(sql).not.toMatch(/PHASE B/);
  });

  it('does not claim prior credential exposure or reference a rotation requirement', () => {
    expect(sql).not.toMatch(/was readable by the browser/);
    expect(sql).not.toMatch(/[Rr]otate/);
  });

  it('states the corrected finding: no messaging_settings column, no stored provider tokens found', () => {
    expect(sql).toMatch(/no messaging_settings column/i);
    expect(sql).toMatch(/database-stored provider token was found/i);
  });

  it('includes non-erroring catalog checks proving anon/authenticated cannot read the table', () => {
    expect(sql).toMatch(/has_table_privilege\('anon', 'public\.shop_messaging_secrets', 'SELECT'\)/);
    expect(sql).toMatch(/has_table_privilege\('authenticated', 'public\.shop_messaging_secrets', 'SELECT'\)/);
    expect(sql).toMatch(/pg_policies/);
    expect(sql).toMatch(/information_schema\.role_table_grants/);
    expect(sql).toMatch(/fully_locked_down/);
    expect(sql).not.toMatch(/^\s*SET LOCAL ROLE \w+;/m);
  });

  it('keeps the REST probe documented as optional/separate, not the primary pass/fail signal', () => {
    expect(sql).toMatch(/OPTIONAL — real end-to-end REST probe/);
  });

  it('verifies the table starts and stays empty (no rows expected)', () => {
    const idx = sql.indexOf('SELECT count(*) AS row_count');
    // The "Expect: 0" annotation is the comment line immediately preceding
    // the query, not following it.
    const precedingComment = sql.slice(Math.max(0, idx - 120), idx);
    expect(precedingComment).toMatch(/Expect: 0/i);
  });

  it('includes a rollback that only drops the new table — any shop_settings mention there is prose explaining it is NOT touched, never an executable reference', () => {
    const rollback = sql.slice(sql.indexOf('Rollback (only if this migration'));
    expect(rollback).toMatch(/DROP TABLE IF EXISTS public\.shop_messaging_secrets/);
    const executableLines = rollback
      .split('\n')
      .filter(l => !l.trim().startsWith('--') && l.trim().length > 0);
    for (const line of executableLines) {
      expect(line).not.toMatch(/shop_settings/);
    }
  });
});
