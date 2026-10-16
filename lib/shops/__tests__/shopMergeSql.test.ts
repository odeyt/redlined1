/**
 * The D1 location merge SQL, read as text. The owner runs these files by hand
 * in the production SQL editor, so the guarantees they make in their comments
 * are pinned here: the apply moves no business rows and deletes nothing, and
 * the rollback deletes only what the apply recorded.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const dir = join(__dirname, '..', '..', '..', 'supabase', 'migrations');
const read = (f: string) => readFileSync(join(dir, f), 'utf8');
// Comments explain what the scripts do NOT do, using the same words; strip
// them so only executable SQL is checked.
const code = (sql: string) => sql.replace(/--.*$/gm, '');

const INVENTORY = code(read('2026-10-16_shop_merge_0_inventory.sql'));
const APPLY = code(read('2026-10-16_shop_merge_1_apply.sql'));
const ROLLBACK = code(read('2026-10-16_shop_merge_9_rollback.sql'));

describe('shop merge — inventory', () => {
  it('only reads', () => {
    expect(INVENTORY).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)\b/i);
  });
});

describe('shop merge — apply', () => {
  it('deletes, drops and truncates nothing', () => {
    expect(APPLY).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/i);
  });

  it('updates only the shops row — no business table changes shop_id', () => {
    // "ON CONFLICT ... DO UPDATE" refreshes the ledger row; it is not a table.
    const updated = [...APPLY.matchAll(/(?<!DO\s)\bUPDATE\s+([\w.]+)/gi)].map(m => m[1].toLowerCase());
    expect(updated).toEqual(['public.shops']);
    expect(APPLY).not.toMatch(/SET\s+shop_id/i);
  });

  it('inserts only memberships and their ledger', () => {
    const inserted = [...APPLY.matchAll(/\bINSERT\s+INTO\s+([\w.]+)/gi)].map(m => m[1].toLowerCase()).sort();
    expect(inserted).toEqual(['public.shop_merge_ledger', 'public.shop_users']);
  });

  it('keeps the ledger out of the API', () => {
    expect(APPLY).toMatch(/ALTER TABLE public\.shop_merge_ledger ENABLE ROW LEVEL SECURITY/);
    expect(APPLY).not.toMatch(/CREATE POLICY/i);
  });

  it('refuses to archive unless Location 2 mirrors D1 Imports', () => {
    expect(APPLY).toMatch(/shop_id\s*=\s*'90b72748-bf01-4456-999f-f4ba48091606'\s*AND mirror_shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38'/);
  });

  it('archives D1 Imports and never Location 2', () => {
    expect(APPLY).toMatch(/UPDATE public\.shops[\s\S]*WHERE id = '38d55fae-741b-4bac-b520-f96eed65bf38'/);
    expect(APPLY).not.toMatch(/WHERE id = '90b72748-bf01-4456-999f-f4ba48091606'\s+AND archived_at IS NULL/);
  });
});

describe('shop merge — rollback', () => {
  it('deletes only memberships recorded in the merge ledger', () => {
    const deletes = [...ROLLBACK.matchAll(/\bDELETE\s+FROM\s+([\w.]+)[\s\S]*?USING\s+([\w.]+)/gi)];
    expect(deletes).toHaveLength(1);
    expect(deletes[0][1]).toBe('public.shop_users');
    expect(deletes[0][2]).toBe('public.shop_merge_ledger');
  });

  it('drops and truncates nothing', () => {
    expect(ROLLBACK).not.toMatch(/\b(DROP|TRUNCATE)\b/i);
  });

  it('un-archives only a shop this merge archived', () => {
    expect(ROLLBACK).toMatch(/archived_reason LIKE 'Location closed 2026-10; merged into D1 Imports/);
  });
});
