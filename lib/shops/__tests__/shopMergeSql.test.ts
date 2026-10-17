/**
 * Shape guards for the D1 location merge SQL. The behaviour — memberships,
 * archive, RLS visibility, conflict-safe rollback — is proven against a real
 * Postgres by tests/db/run-shop-merge-db-tests.mjs (npm run test:db:shop-merge).
 * These cheap checks keep the guarantees that matter most from regressing in
 * an edit that nobody re-runs the database suite for.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const dir = join(__dirname, '..', '..', '..', 'supabase', 'migrations');
const read = (f: string) => readFileSync(join(dir, f), 'utf8');
// Comments explain what the scripts do NOT do, using the same words; strip
// them so only executable SQL is checked.
const code = (sql: string) => sql.replace(/--.*$/gm, '');

const PREFLIGHT = code(read('2026-10-16_shop_merge_preflight.sql'));
const APPLY = code(read('2026-10-16_shop_merge.sql'));
const ROLLBACK_RAW = read('2026-10-16_shop_merge_rollback.sql');
const ROLLBACK = code(ROLLBACK_RAW);

describe('shop merge — preflight', () => {
  it('only reads', () => {
    expect(PREFLIGHT).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/i);
  });
});

describe('shop merge — apply', () => {
  it('deletes, drops and truncates nothing', () => {
    expect(APPLY).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/i);
  });

  it('updates only the shops row — no business table changes shop_id', () => {
    const updated = [...APPLY.matchAll(/\bUPDATE\s+([\w.]+)/gi)].map(m => m[1].toLowerCase());
    expect(updated).toEqual(['public.shops']);
    expect(APPLY).not.toMatch(/SET\s+shop_id/i);
  });

  it('inserts only memberships and their ledger', () => {
    const inserted = [...APPLY.matchAll(/\bINSERT\s+INTO\s+([\w.]+)/gi)].map(m => m[1].toLowerCase()).sort();
    expect(inserted).toEqual(['public.shop_merge_ledger', 'public.shop_merge_ledger', 'public.shop_users']);
  });

  it('records row-version evidence for every row it writes', () => {
    expect(APPLY.match(/xmin::text AS row_xmin/g)).toHaveLength(2);
  });

  it('keeps the ledger out of the API', () => {
    expect(APPLY).toMatch(/ALTER TABLE public\.shop_merge_ledger ENABLE ROW LEVEL SECURITY/);
    expect(APPLY).not.toMatch(/CREATE POLICY/i);
  });
});

describe('shop merge — emergency rollback', () => {
  it('is locked as shipped, so a bulk migration run can never execute it', () => {
    expect(ROLLBACK_RAW).toMatch(/^-- SELECT set_config\('shop_merge\.rollback', 'd1-location-merge-2026-10', true\);$/m);
    expect(ROLLBACK).not.toMatch(/set_config\('shop_merge\.rollback'/);
    expect(ROLLBACK).toMatch(/rollback is locked/);
  });

  it('deletes only from shop_users, and only rows whose xmin still matches the ledger', () => {
    const deletes = [...ROLLBACK.matchAll(/\bDELETE\s+FROM\s+([\w.]+)/gi)].map(m => m[1]);
    expect(deletes).toEqual(['public.shop_users']);
    expect(ROLLBACK).toMatch(/su\.xmin::text = l\.row_xmin;/);
  });

  it('aborts on any changed row instead of deleting it', () => {
    expect(ROLLBACK).toMatch(/WHERE p\.state = 'changed'[\s\S]*RAISE EXCEPTION/);
  });

  it('drops and truncates nothing (its own temp plan table drops itself at commit)', () => {
    expect(ROLLBACK.replace(/ON COMMIT DROP/g, '')).not.toMatch(/\b(DROP|TRUNCATE)\b/i);
  });
});
