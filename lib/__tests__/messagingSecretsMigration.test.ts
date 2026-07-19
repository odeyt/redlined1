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
 * regression if someone later "simplifies" the backfill back into an
 * unconditional overwrite, or scopes the Phase B scrub too broadly. They
 * are not a substitute for running the migration's own embedded
 * verification queries against a real (staging) database before/after
 * each phase.
 */
// Normalize CRLF → LF: git's core.autocrlf (default on Windows checkouts)
// rewrites this file's line endings on commit/checkout, and several checks
// below search for literal "\n"-containing substrings — without this, those
// searches silently fail to match a CRLF-checked-out copy of the file.
const sql = fs.readFileSync(
  path.resolve(__dirname, '../../docs/MESSAGING_SECRETS_MIGRATION.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

function section(marker: string, endMarker: string): string {
  const start = sql.indexOf(marker);
  if (start === -1) throw new Error(`Marker not found: ${marker}`);
  const end = sql.indexOf(endMarker, start + marker.length);
  return end === -1 ? sql.slice(start) : sql.slice(start, end);
}

describe('MESSAGING_SECRETS_MIGRATION.sql — Phase A backfill rerun-safety', () => {
  const phaseA = section('PHASE A — run BEFORE deploying', 'PHASE B — run ONLY after');

  it('creates the table idempotently (IF NOT EXISTS)', () => {
    expect(phaseA).toMatch(/CREATE TABLE IF NOT EXISTS public\.shop_messaging_secrets/);
  });

  it('enables and forces RLS with no policies (default-deny for every non-service_role)', () => {
    expect(phaseA).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(phaseA).toMatch(/FORCE ROW LEVEL SECURITY/);
    // No actual CREATE POLICY statement (a bare mention in an explanatory
    // comment, like "No CREATE POLICY for anon...", is fine and expected).
    expect(phaseA).not.toMatch(/^\s*CREATE POLICY/m);
  });

  it('revokes anon/authenticated and grants only service_role', () => {
    expect(phaseA).toMatch(/REVOKE ALL ON public\.shop_messaging_secrets FROM PUBLIC, anon, authenticated/);
    expect(phaseA).toMatch(/GRANT ALL ON public\.shop_messaging_secrets TO service_role/);
  });

  it('does NOT use an unconditional ON CONFLICT DO UPDATE for secret columns — every secret column in the SET clause is wrapped in COALESCE(existing, new)', () => {
    const conflictClause = phaseA.slice(phaseA.indexOf('ON CONFLICT (shop_id) DO UPDATE SET'));
    for (const col of ['twilio_sid', 'twilio_token', 'twilio_from', 'line_token', 'telegram_bot_token']) {
      const line = conflictClause.split('\n').find(l => l.trim().startsWith(`${col} `) || l.trim().startsWith(`${col}=`) || l.trim().startsWith(`${col} =`));
      expect(line).toBeDefined();
      expect(line).toMatch(new RegExp(`${col}\\s*=\\s*COALESCE\\(shop_messaging_secrets\\.${col},\\s*EXCLUDED\\.${col}\\)`));
    }
  });

  it('never resets the *_enabled boolean flags on a rerun (omitted from the UPDATE SET clause)', () => {
    const conflictClause = phaseA.slice(phaseA.indexOf('ON CONFLICT (shop_id) DO UPDATE SET'), phaseA.indexOf('ON CONFLICT (shop_id) DO UPDATE SET') + 800);
    for (const flag of ['sms_enabled', 'whatsapp_enabled', 'line_enabled', 'telegram_enabled']) {
      // Must not appear as an assignment target inside the SET clause.
      expect(conflictClause).not.toMatch(new RegExp(`\\b${flag}\\s*=\\s*EXCLUDED`));
    }
  });

  it('never deletes, clears, or truncates shop_settings in Phase A', () => {
    expect(phaseA).not.toMatch(/DELETE FROM public\.shop_settings/);
    expect(phaseA).not.toMatch(/UPDATE public\.shop_settings/);
    expect(phaseA).not.toMatch(/TRUNCATE/i);
  });

  it('includes a coverage-check verification query for un-migrated credentials', () => {
    expect(phaseA).toMatch(/COVERAGE CHECK/);
  });

  it('the coverage check compares all nine operational fields, not just the three token columns', () => {
    const coverage = phaseA.slice(phaseA.indexOf('COVERAGE CHECK'));
    for (const col of [
      'twilio_sid', 'twilio_token', 'twilio_from',
      'sms_enabled', 'whatsapp_enabled',
      'line_token', 'line_enabled',
      'telegram_bot_token', 'telegram_enabled',
    ]) {
      expect(coverage).toMatch(new RegExp(`${col}\\s+IS DISTINCT FROM`));
    }
  });

  it('the coverage check never selects an actual secret value — only shop_id and boolean mismatch indicators', () => {
    const coverageSelect = phaseA.slice(
      phaseA.indexOf('SELECT\n  s.shop_id,', phaseA.indexOf('COVERAGE CHECK')),
      phaseA.indexOf('FROM source s'),
    );
    // Every projected column besides shop_id must be a boolean comparison
    // expression (IS DISTINCT FROM ...) aliased _mismatch, never a bare
    // column reference that would surface the value itself.
    const lines = coverageSelect.split('\n').map(l => l.trim()).filter(l => l.startsWith('(') || l === 's.shop_id,');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      if (line === 's.shop_id,') continue;
      expect(line).toMatch(/IS DISTINCT FROM/);
      expect(line).toMatch(/_mismatch/);
    }
  });
});

describe('MESSAGING_SECRETS_MIGRATION.sql — Phase B source-secret scrub safety', () => {
  const phaseB = sql.slice(sql.indexOf('PHASE B — run ONLY after'));

  it('scopes the secret-key removal to shops that already have a destination row (never strips an un-migrated shop)', () => {
    const updateStmt = phaseB.slice(phaseB.indexOf('UPDATE public.shop_settings s'), phaseB.indexOf('B3.'));
    expect(updateStmt).toMatch(/EXISTS \(SELECT 1 FROM public\.shop_messaging_secrets d WHERE d\.shop_id = s\.shop_id\)/);
  });

  it('removes exactly the known secret/config keys via jsonb key-removal, not a blind overwrite to NULL/empty', () => {
    const updateStmt = phaseB.slice(phaseB.indexOf('UPDATE public.shop_settings s'), phaseB.indexOf('B3.'));
    for (const key of ['twilioSid', 'twilioToken', 'twilioFrom', 'smsEnabled', 'whatsappEnabled', 'lineToken', 'lineEnabled', 'telegramBotToken', 'telegramEnabled']) {
      expect(updateStmt).toContain(`- '${key}'`);
    }
  });

  it('never touches or drops shop_messaging_secrets (the live source of truth) in Phase B', () => {
    expect(phaseB).not.toMatch(/DROP TABLE.*shop_messaging_secrets/);
    expect(phaseB).not.toMatch(/DELETE FROM public\.shop_messaging_secrets/);
    expect(phaseB).not.toMatch(/UPDATE public\.shop_messaging_secrets/);
  });

  it('includes a verification query proving no shop_settings row still carries a removed key', () => {
    const verify = phaseB.slice(phaseB.indexOf('B4.'), phaseB.indexOf('B5.'));
    expect(verify).toMatch(/messaging_settings \?\| array\[/);
  });

  it('includes non-erroring catalog checks proving anon/authenticated cannot read shop_messaging_secrets', () => {
    const verify = phaseB.slice(phaseB.indexOf('B6.'));
    expect(verify).toMatch(/has_table_privilege\('anon', 'public\.shop_messaging_secrets', 'SELECT'\)/);
    expect(verify).toMatch(/has_table_privilege\('authenticated', 'public\.shop_messaging_secrets', 'SELECT'\)/);
    expect(verify).toMatch(/pg_policies/);
    expect(verify).toMatch(/information_schema\.role_table_grants/);
    expect(verify).toMatch(/fully_locked_down/);
    // No longer contains a runnable "SET LOCAL ROLE x;" instruction that
    // deliberately triggers a permission-denied error (a bare mention of
    // the phrase in the explanatory comment, describing why it was
    // replaced, is fine and expected).
    expect(verify).not.toMatch(/^\s*SET LOCAL ROLE \w+;/m);
  });

  it('keeps the REST probe documented as optional/separate, not the primary pass/fail signal', () => {
    const verify = phaseB.slice(phaseB.indexOf('B6.'));
    expect(verify).toMatch(/OPTIONAL — real end-to-end REST probe/);
  });

  it('the rollback section explicitly refuses to restore secret values into shop_settings', () => {
    const rollback = phaseB.slice(phaseB.indexOf('Rollback for Phase B'));
    expect(rollback).toMatch(/Do NOT restore secret values/);
    expect(rollback).not.toMatch(/twilio_token/); // never referenced as something to write back
  });
});
