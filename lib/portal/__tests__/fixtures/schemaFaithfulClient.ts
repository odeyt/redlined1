/**
 * A Supabase-client double that behaves like PostgREST on the points the
 * portal loader depends on:
 *   - unknown table  → error 42P01; unknown column in select/eq/in/order →
 *     error 42703 (what production answered for vehicles.license_plate)
 *   - eq / in filter rows; order sorts; maybeSingle / single as PostgREST
 *   - an explicit select returns ONLY those columns, so a mapper reading a
 *     column that was not selected gets undefined, as it would in production
 *
 * Columns come from PRODUCTION_COLUMNS (captured from the live schema), so a
 * query naming a column production does not have fails here too.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PRODUCTION_COLUMNS } from './productionSchema';

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null };

export interface FakeDb {
  client: SupabaseClient;
  /** Every query issued, as "table:select" — for asserting what was (not) asked. */
  queries: string[];
  /** Make the next query on `table` fail with this code. */
  failNext(table: string, code: string): void;
}

export function schemaFaithfulClient(tables: Record<string, Row[]>, columns = PRODUCTION_COLUMNS): FakeDb {
  const queries: string[] = [];
  const failures = new Map<string, string>();

  function from(table: string) {
    let selected: string[] | '*' = '*';
    const filters: Array<(r: Row) => boolean> = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let problem: Result['error'] = null;

    const known = columns[table];
    const check = (col: string) => {
      if (!known) problem ??= { code: '42P01', message: `relation "public.${table}" does not exist` };
      else if (!known.includes(col)) problem ??= { code: '42703', message: `column ${table}.${col} does not exist` };
    };

    const run = (mode: 'many' | 'maybeSingle' | 'single'): Result => {
      const injected = failures.get(table);
      if (injected) { failures.delete(table); return { data: null, error: { code: injected, message: `injected ${injected}` } }; }
      if (!known) check('*');
      if (problem) return { data: null, error: problem };
      let rows = (tables[table] ?? []).filter(r => filters.every(f => f(r)));
      if (orderBy) {
        const { col, asc } = orderBy;
        rows = [...rows].sort((a, b) => (String(a[col] ?? '') < String(b[col] ?? '') ? -1 : 1) * (asc ? 1 : -1));
      }
      const shaped = rows.map(r => (selected === '*' ? { ...r } : Object.fromEntries(selected.map(c => [c, r[c]]))));
      if (mode === 'many') return { data: shaped, error: null };
      if (shaped.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
      if (mode === 'single' && shaped.length === 0) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      return { data: shaped[0] ?? null, error: null };
    };

    const builder = {
      select(cols = '*') {
        queries.push(`${table}:${cols.replace(/\s+/g, ' ').trim()}`);
        if (cols.trim() !== '*') {
          selected = cols.split(',').map(c => c.trim()).filter(Boolean);
          selected.forEach(check);
        }
        return builder;
      },
      eq(col: string, value: unknown) { check(col); filters.push(r => r[col] === value); return builder; },
      in(col: string, values: unknown[]) { check(col); filters.push(r => values.includes(r[col])); return builder; },
      order(col: string, opts?: { ascending?: boolean }) { check(col); orderBy = { col, asc: opts?.ascending !== false }; return builder; },
      maybeSingle: () => Promise.resolve(run('maybeSingle')),
      single: () => Promise.resolve(run('single')),
      then<T>(resolve: (r: Result) => T, reject?: (e: unknown) => T) {
        return Promise.resolve(run('many')).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    client: { from } as unknown as SupabaseClient,
    queries,
    failNext: (table, code) => { failures.set(table, code); },
  };
}
