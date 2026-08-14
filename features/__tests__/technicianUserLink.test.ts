/**
 * Linking a technician to the account they sign in with.
 *
 * Without this there is nothing to alert. job_cards.technicians stores NAMES,
 * and technicians had no reference to any login — so "assigned to Beck" could
 * not become "tell Beck". Measured 2026-08-13: 25 technician records, 3 with
 * an email, 1 matching a login, and no shop_users row with the technician
 * role anywhere.
 *
 * The link is deliberately explicit rather than inferred from a matching
 * email address. Emails go stale, get shared between staff, and are often
 * blank; quietly guessing which account a technician is would eventually send
 * one person's job alerts to another.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const view = strip(readFileSync(join(root, 'features', 'technicians', 'TechniciansView.tsx'), 'utf8'));
const service = strip(readFileSync(join(root, 'services', 'technicianService.ts'), 'utf8'));
const migration = readFileSync(
  join(root, 'supabase', 'migrations', '2026-08-13_technicians_user_link.sql'), 'utf8',
).replace(/^\s*--.*$/gm, '');

describe('the record carries the link', () => {
  it('reads user_id back as userId', () => {
    expect(service).toMatch(/userId:\s*\(r\.user_id as string\) \|\| ''/);
  });

  it('writes an unlinked technician as NULL, not an empty string', () => {
    // The column is a nullable uuid; '' is not a uuid and the write would fail.
    expect(service).toMatch(/payload\.user_id\s*=\s*updates\.userId \|\| null/);
  });

  it('lets a technician be created without a login', () => {
    // Added inline from a job card or inspection — linking is a separate,
    // deliberate act in Employees.
    expect(service).toMatch(/userId\?: string/);
  });
});

describe('the Employees screen', () => {
  it('offers the accounts in this shop', () => {
    expect(view).toMatch(/\/api\/members\?shopId=\$\{shopId\}/);
    expect(view).toMatch(/members\.map\(m =>/);
  });

  it('makes "no login" an explicit choice with its consequence', () => {
    expect(view).toMatch(/No login — cannot receive alerts/);
  });

  it('explains why the list is empty rather than showing a dead dropdown', () => {
    expect(view).toMatch(/Nobody has been invited yet/);
    expect(view).toMatch(/Only an owner can list them/);
  });

  it('carries the link through the edit form', () => {
    expect(view).toMatch(/userId: t\.userId/);
    expect(view).toMatch(/userId: e\.target\.value/);
  });
});

describe('the migration', () => {
  it('adds the column without disturbing existing rows', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS user_id UUID/);
  });

  it('alerts only technicians who are actually linked', () => {
    expect(migration).toMatch(/AND t\.user_id IS NOT NULL/);
    expect(migration).toMatch(/IF target IS NOT NULL THEN/);
  });

  it('fires per newly added name, not for everyone already on the job', () => {
    expect(migration).toMatch(/EXCEPT/);
  });

  it('survives either array type on job_cards.technicians', () => {
    // A migration that guesses text[] vs jsonb wrong aborts the whole file.
    expect(migration).toMatch(/COALESCE\(to_jsonb\(NEW\.technicians\), '\[\]'::jsonb\)/);
    expect(migration).toMatch(/COALESCE\(to_jsonb\(OLD\.technicians\), '\[\]'::jsonb\)/);
  });

  it('stores the job card id as text', () => {
    // job_cards.id is 'JC-1784537040284', not a uuid — which is why
    // alert_events.entity_id is text.
    expect(migration).toMatch(/'job_card', NEW\.id::text/);
  });
});
