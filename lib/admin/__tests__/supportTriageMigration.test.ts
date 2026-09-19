/**
 * Static validation of the prepared (unapplied) support-ticket triage migration.
 * This is source inspection, not execution: no database is touched, and it does NOT
 * replace running the SQL against an isolated PostgreSQL. It pins the properties that
 * make the migration safe to review, and that customers cannot read or set a marker.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const MIGRATION = 'supabase/migrations/2026-09-19_support_ticket_triage.sql';
const sql = read(MIGRATION);
// Everything outside SQL line comments.
const executable = sql.split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n');
const TABLE = 'public.support_ticket_triage_events';

describe('2026-09-19_support_ticket_triage.sql', () => {
  it('is marked as not applied', () => {
    expect(sql).toMatch(/NOT APPLIED/);
  });

  it('runs in one transaction', () => {
    expect(executable).toMatch(/^BEGIN;/m);
    expect(executable).toMatch(/^COMMIT;/m);
    expect((executable.match(/\bBEGIN;/g) ?? []).length).toBe(1);
  });

  it('creates one new table and touches nothing that already exists', () => {
    expect(executable).toMatch(/CREATE TABLE IF NOT EXISTS public\.support_ticket_triage_events/);
    // No ALTER of any existing table, no policy changes, no data statements.
    expect(executable).not.toMatch(/\bALTER TABLE public\.support_tickets\b/i);
    expect(executable).not.toMatch(/\b(CREATE|DROP|ALTER) POLICY\b/i);
    expect(executable).not.toMatch(/\bUPDATE\b\s+\S+\s+SET\b/i);
    expect(executable).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(executable).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(executable).not.toMatch(/\bTRUNCATE\b/i);
    expect(executable).not.toMatch(/\bDROP\s+(TABLE|COLUMN|SCHEMA|CONSTRAINT)\b/i);
  });

  it('adds no marker column to support_tickets, where customers can already read their own rows', () => {
    expect(executable).not.toMatch(/ADD COLUMN/i);
    expect(executable).not.toMatch(/ALTER TABLE\s+(public\.)?support_tickets\b/i);
  });

  it('constrains the marker to real | test | spam | unreviewed and requires a named actor', () => {
    expect(executable).toMatch(/triage\s+TEXT\s+NOT NULL CHECK \(triage IN \('real', 'test', 'spam', 'unreviewed'\)\)/);
    expect(executable).toMatch(/set_by\s+TEXT\s+NOT NULL CHECK \(length\(btrim\(set_by\)\) > 0\)/);
  });

  it('backfills nothing and classifies no existing ticket', () => {
    // (INSERT appears legitimately as a privilege name; what must not appear is a data statement.)
    expect(executable).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(executable).not.toMatch(/\bFROM\s+public\.support_tickets\b/i); // the migration never reads existing tickets
  });

  it('ties every marking to a real ticket, and lets history follow the ticket if it is ever deleted', () => {
    expect(executable).toMatch(/ticket_id\s+UUID\s+NOT NULL REFERENCES public\.support_tickets\(id\) ON DELETE CASCADE/);
  });

  it('is append-only: service_role gets SELECT and INSERT and nothing that edits or removes history', () => {
    expect(executable).toMatch(/GRANT SELECT, INSERT ON public\.support_ticket_triage_events TO service_role;/);
    const grants = executable.match(/GRANT [^;]+;/g) ?? [];
    expect(grants).toHaveLength(1);
    expect(grants[0]).not.toMatch(/UPDATE|DELETE|TRUNCATE|ALL/i);
  });

  it('gives customers no access at all: RLS on, no policy, every privilege revoked from anon and authenticated', () => {
    expect(executable).toMatch(/ALTER TABLE public\.support_ticket_triage_events ENABLE ROW LEVEL SECURITY;/);
    expect(executable).toMatch(/REVOKE ALL ON public\.support_ticket_triage_events FROM PUBLIC, anon, authenticated;/);
    expect(executable).not.toMatch(/\bTO\s+(anon|authenticated|PUBLIC)\b/i);
    expect(executable).not.toMatch(/CREATE POLICY/i);
  });

  it('asserts its own lock-down inside the transaction, so a bad state aborts instead of committing', () => {
    expect(executable).toMatch(/relrowsecurity/);
    expect(executable).toMatch(/has_table_privilege\('anon'/);
    expect(executable).toMatch(/has_table_privilege\('authenticated'/);
    expect(executable).toMatch(/RAISE EXCEPTION/);
  });

  it('is safe to run twice', () => {
    expect(executable).toMatch(/CREATE TABLE IF NOT EXISTS/);
    expect(executable).toMatch(/CREATE INDEX IF NOT EXISTS/);
  });

  it('documents verification and a rollback that only removes the new table', () => {
    expect(sql).toMatch(/── Verification/);
    const rollback = sql.slice(sql.indexOf('── Rollback'));
    expect(rollback).toMatch(/DROP TABLE IF EXISTS public\.support_ticket_triage_events;/);
    // Nothing else was changed, so nothing else needs restoring.
    expect(rollback.match(/^--\s+(DROP|ALTER|CREATE)\b/gm)).toHaveLength(1);
  });

  it('matches what the application reads and writes: table and column names', () => {
    const reader = read('lib/admin/supportData.ts');
    const route = read('app/api/admin/support/triage/route.ts');
    expect(reader).toMatch(/from\('support_ticket_triage_events'\)/);
    expect(reader).toMatch(/select\('ticket_id, triage'\)/);
    expect(route).toMatch(/insert\(\{ ticket_id: ticketId, triage, set_by: auth\.email \}\)/);
    expect(sql).toContain(TABLE);
  });

  it('allows exactly the values the application allows', () => {
    const app = read('lib/admin/supportTriage.ts').match(/TICKET_TRIAGE_VALUES = \[([^\]]+)\]/)?.[1] ?? '';
    const appValues = [...app.matchAll(/'([a-z]+)'/g)].map(m => m[1]).sort();
    const sqlValues = [...(sql.match(/CHECK \(triage IN \(([^)]+)\)\)/)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map(m => m[1]).sort();
    expect(appValues).toEqual(['real', 'spam', 'test', 'unreviewed']);
    expect(sqlValues).toEqual(appValues);
  });
});

describe('customers cannot read or set a ticket marker', () => {
  const SKIP = new Set(['node_modules', '.next', '.git', '__tests__', 'tests', 'docs', 'supabase', 'coverage']);
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) sourceFiles(full, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(relative(root, full).replace(/\\/g, '/'));
    }
    return out;
  }
  const all = ['app', 'lib', 'services', 'components', 'features', 'commercial', 'hooks']
    .filter(d => { try { return statSync(join(root, d)).isDirectory(); } catch { return false; } })
    .flatMap(d => sourceFiles(join(root, d)));

  // The only application files allowed to name the marker table.
  const OWNER_ONLY = ['lib/admin/supportData.ts', 'app/api/admin/support/triage/route.ts', 'lib/admin/supportTriage.ts'];

  it('only owner-side code refers to the marker table', () => {
    const users = all.filter(f => read(f).includes('support_ticket_triage_events')).sort();
    expect(users.filter(f => !OWNER_ONLY.includes(f))).toEqual([]);
  });

  it('the two files that touch it both read it with the service-role admin client, never a user session', () => {
    for (const f of ['lib/admin/supportData.ts', 'app/api/admin/support/triage/route.ts']) {
      const src = read(f);
      expect(src).toMatch(/getAdminDb/);
      expect(src).not.toMatch(/createBrowserClient|createServerClient|NEXT_PUBLIC_SUPABASE_ANON_KEY|supabase\/client/);
    }
  });

  it('no customer-facing support code mentions a marker at all', () => {
    for (const f of ['app/api/support/message/route.ts', 'services/supportService.ts', 'lib/support/notifyOperator.ts']) {
      expect(read(f)).not.toMatch(/triage/i);
    }
  });

  it("the customer's own ticket list maps named fields, so it could not forward a marker even if one existed", () => {
    const svc = read('services/supportService.ts');
    const mapper = svc.slice(svc.indexOf('function rowToTicket'), svc.indexOf('Sends a message to support'));
    expect(mapper).toMatch(/id:\s+String\(r\.id\)/);
    expect(mapper).not.toMatch(/\.\.\.r\b/);
  });

  it('the customer ticket-creation route writes fixed columns only, and never a client-supplied field', () => {
    const route = read('app/api/support/message/route.ts');
    const insert = route.slice(route.indexOf(".from('support_tickets')"), route.indexOf(".select('id').single()"));
    expect(insert).toMatch(/shop_id:\s+shopId/);
    expect(insert).not.toMatch(/\.\.\.body|\.\.\.req/);
  });
});
