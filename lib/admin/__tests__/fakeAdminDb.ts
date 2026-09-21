/**
 * In-memory stand-in for the service-role Supabase client used by
 * lib/admin/accountsData.ts. Enforces the real production `profiles` column
 * list the way PostgREST does: selecting, filtering or ordering on a column
 * that does not exist rejects the whole query with 42703.
 *
 * Not a test file (no `.test.`), so jest does not collect it. All fixture data
 * comes from the individual tests — nothing here is copied from production.
 */

// docs/m0-architecture-audit.md §4 — live production schema.
export const PROD_PROFILE_COLUMNS = ['id', 'email', 'role', 'plan', 'trial_ends_at', 'shop_name', 'shop_id', 'billing_status'];

export type Row = Record<string, unknown>;
type Err = { code: string; message: string } | null;
type Result = { data: unknown; error: Err; count?: number };

export interface FakeState {
  tables: Record<string, Row[]>;
  failTables: Set<string>;
  /** Columns that do not exist yet (an unapplied migration): selecting one rejects the query with 42703. */
  missingColumns: Record<string, string[]>;
  /** auth.users stand-ins keyed by user id. When empty, getUserById returns a generic signed-in user. */
  authUsers: Record<string, { created_at?: string; last_sign_in_at?: string | null; email_confirmed_at?: string | null; email?: string }>;
  failAuth: boolean;
  /** Columns requested from each table, in call order — lets tests assert what was (not) selected. */
  selects: Array<{ table: string; columns: string[] }>;
  /**
   * Emulates hosted PostgREST's max-rows (1000 on Supabase): no read returns more rows than this,
   * whatever .limit() asked for, and nothing says it was cut. Infinity (off) unless a test sets it.
   */
  serverMaxRows: number;
}

export function createFakeAdminDb(tables: Record<string, Row[]> = {}) {
  const state: FakeState = { tables, failTables: new Set(), missingColumns: {}, authUsers: {}, failAuth: false, selects: [], serverMaxRows: Infinity };

  class FakeQuery {
    private cols: string[] = [];
    private filters: Array<(r: Row) => boolean> = [];
    private touched: string[] = [];
    private orderBy: { col: string; asc: boolean } | null = null;
    private max = Infinity;
    private head = false;
    private single = false;

    constructor(private table: string) {}

    select(cols: string, opts?: { head?: boolean }) {
      this.cols = cols.split(',').map(c => c.trim()).filter(Boolean);
      this.head = !!opts?.head;
      return this;
    }
    in(col: string, vals: unknown[]) { this.touched.push(col); this.filters.push(r => vals.includes(r[col])); return this; }
    eq(col: string, val: unknown) { this.touched.push(col); this.filters.push(r => r[col] === val); return this; }
    neq(col: string, val: unknown) { this.touched.push(col); this.filters.push(r => r[col] !== val); return this; }
    is(col: string, val: null) { this.touched.push(col); this.filters.push(r => (r[col] ?? null) === val); return this; }
    not(col: string, op: string, val: null) {
      this.touched.push(col);
      if (op === 'is') this.filters.push(r => (r[col] ?? null) !== val);
      return this;
    }
    ilike(col: string, pattern: string) {
      this.touched.push(col);
      const needle = pattern.replace(/^%|%$/g, '').replace(/\\([%_])/g, '$1').toLowerCase();
      this.filters.push(r => String(r[col] ?? '').toLowerCase().includes(needle));
      return this;
    }
    order(col: string, opts?: { ascending?: boolean }) { this.touched.push(col); this.orderBy = { col, asc: opts?.ascending !== false }; return this; }
    limit(n: number) { this.max = n; return this; }
    maybeSingle() { this.single = true; return this; }

    private run(): Result {
      state.selects.push({ table: this.table, columns: [...this.cols] });
      if (state.failTables.has(this.table)) {
        return { data: null, error: { code: 'XX000', message: `simulated failure reading ${this.table}` } };
      }
      const missing = (state.missingColumns[this.table] ?? []).find(c => [...this.cols, ...this.touched].includes(c));
      if (missing) {
        return { data: null, error: { code: '42703', message: `column ${this.table}.${missing} does not exist` } };
      }
      if (this.table === 'profiles') {
        const bad = [...this.cols, ...this.touched].filter(c => !PROD_PROFILE_COLUMNS.includes(c));
        if (bad.length) {
          return { data: null, error: { code: '42703', message: `column profiles.${bad[0]} does not exist` } };
        }
      }
      let rows = (state.tables[this.table] ?? []).filter(r => this.filters.every(f => f(r)));
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        rows = [...rows].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (asc ? 1 : -1));
      }
      rows = rows.slice(0, Math.min(this.max, state.serverMaxRows));
      if (this.head) return { data: null, error: null, count: rows.length };
      if (this.single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    then<T>(resolve: (v: Result) => T) {
      return Promise.resolve(this.run()).then(resolve);
    }
  }

  const db = {
    from: (table: string) => new FakeQuery(table),
    auth: {
      admin: {
        getUserById: async (id: string) => {
          if (state.failAuth) return { data: { user: null }, error: { message: 'simulated auth failure' } };
          const u = state.authUsers[id];
          if (state.authUsers && Object.keys(state.authUsers).length > 0) {
            return u ? { data: { user: { id, ...u } }, error: null } : { data: { user: null }, error: { message: 'User not found' } };
          }
          return { data: { user: { last_sign_in_at: '2026-09-01T00:00:00Z' } }, error: null };
        },
        listUsers: async (opts?: { page?: number; perPage?: number }) => {
          if (state.failAuth) return { data: { users: [] }, error: { message: 'simulated auth failure' } };
          const page = opts?.page ?? 1; const perPage = opts?.perPage ?? 50;
          const all = Object.entries(state.authUsers).map(([id, u]) => ({ id, ...u }));
          return { data: { users: all.slice((page - 1) * perPage, page * perPage) }, error: null };
        },
      },
    },
  };

  return { db, state };
}
