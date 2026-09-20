/**
 * An in-memory stand-in for the slice of the Supabase client the Creem webhook route uses:
 *   from(t).select(cols).eq(c, v)...order(c, {ascending}).limit(n)[.single() | .maybeSingle()]
 *   from(t).insert(row)[.select(cols).single()]
 *   from(t).update(patch, { count: 'exact' }).eq(c, v)[.is(c, null) | .lt(c, v)]
 *
 * What makes it useful for the concurrency tests: EVERY operation yields to the event loop before it
 * executes, so two requests started together interleave at operation granularity. Two handlers can both
 * run their read before either runs its insert, which is exactly the read-then-insert race a real
 * database exposes. Nothing here is made atomic on purpose.
 *
 * `unique` optionally enforces unique indexes (error code 23505 like Postgres), to model a database that
 * HAS the constraints proposed in docs/billing-webhook-idempotency.md. Without them, duplicates happen.
 *
 * `failNext` injects a one-shot error for a matching operation. Every id and value here is synthetic.
 */
export type Row = Record<string, unknown>;
export interface DbError { message: string; code?: string }
export interface WriteLog { table: string; op: 'insert' | 'update'; values: Row; matched?: number }

interface Failure { table: string; op: 'select' | 'insert' | 'update'; error: DbError }

/**
 * A rendezvous: the first `parties` operations on (table, op) each WAIT until all of them have arrived, then
 * all proceed together. It makes a race deterministic. "Two requests both read before either writes" is forced,
 * not hoped for, so a concurrency test does not depend on scheduler timing (the request path includes an async
 * HMAC, which otherwise staggers two 'simultaneous' requests unpredictably).
 */
interface Barrier { table: string; op: 'select' | 'insert' | 'update'; parties: number; waiting: Array<() => void>; released: boolean }

export interface InMemoryDbOptions {
  /** table -> columns that must be unique together (null and empty-string values are exempt). */
  unique?: Record<string, string[]>;
}

export function createInMemoryDb(options: InMemoryDbOptions = {}) {
  const state = {
    tables: {} as Record<string, Row[]>,
    writes: [] as WriteLog[],
    failures: [] as Failure[],
    barriers: [] as Barrier[],
    unique: options.unique ?? {},
    seq: 0,
  };
  const BASE = Date.UTC(2026, 8, 1);

  const tick = () => new Promise<void>(resolve => setImmediate(resolve));
  const rowsOf = (t: string): Row[] => (state.tables[t] ??= []);

  class Query implements PromiseLike<{ data: unknown; error: DbError | null; count?: number | null }> {
    private op: 'select' | 'insert' | 'update' = 'select';
    private filters: Array<[string, unknown]> = [];
    private predicates: Array<(r: Row) => boolean> = [];
    private orderBy: { col: string; asc: boolean } | null = null;
    private limitN: number | null = null;
    private payload: Row = {};
    private wantCount = false;
    private returning = false;
    private mode: 'many' | 'single' | 'maybe' = 'many';

    constructor(private table: string) {}

    // The column list is ignored on purpose: every row is returned whole, which is a superset of any projection.
    select() { if (this.op !== 'select') this.returning = true; return this; }
    insert(row: Row) { this.op = 'insert'; this.payload = row; return this; }
    update(patch: Row, opts?: { count?: string }) { this.op = 'update'; this.payload = patch; this.wantCount = opts?.count === 'exact'; return this; }
    eq(col: string, val: unknown) { this.filters.push([col, val]); return this; }
    /** `.is(col, null)`: the column has no value (NULL). Only null is modelled. */
    is(col: string, val: null) { this.predicates.push(r => r[col] === val || r[col] === undefined); return this; }
    /** `.lt(col, v)`: the column is set and strictly less than v. Timestamps compare as instants, like timestamptz. */
    lt(col: string, val: string | number) {
      this.predicates.push(r => {
        const a = r[col];
        if (a === null || a === undefined) return false;   // NULL < x is unknown, so no match
        return typeof val === 'string' ? Date.parse(String(a)) < Date.parse(val) : Number(a) < val;
      });
      return this;
    }
    order(col: string, opts?: { ascending?: boolean }) { this.orderBy = { col, asc: opts?.ascending !== false }; return this; }
    limit(n: number) { this.limitN = n; return this; }
    single() { this.mode = 'single'; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }

    then<T1 = { data: unknown; error: DbError | null; count?: number | null }, T2 = never>(
      onfulfilled?: ((v: { data: unknown; error: DbError | null; count?: number | null }) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      return this.run().then(onfulfilled, onrejected);
    }

    private async run(): Promise<{ data: unknown; error: DbError | null; count?: number | null }> {
      await tick(); // let overlapping requests interleave
      const gate = state.barriers.find(b => !b.released && b.table === this.table && b.op === this.op);
      if (gate) {
        await new Promise<void>(resolve => {
          gate.waiting.push(resolve);
          if (gate.waiting.length >= gate.parties) { gate.released = true; gate.waiting.forEach(f => f()); }
        });
      }
      const fi = state.failures.findIndex(f => f.table === this.table && f.op === this.op);
      if (fi >= 0) {
        const [f] = state.failures.splice(fi, 1);
        return { data: null, error: f.error };
      }
      const matches = () => rowsOf(this.table).filter(r => this.filters.every(([c, v]) => r[c] === v) && this.predicates.every(p => p(r)));

      if (this.op === 'insert') {
        const cols = state.unique[this.table];
        if (cols) {
          const clash = rowsOf(this.table).some(r => cols.every(c => {
            const a = r[c], b = this.payload[c];
            return a !== null && a !== undefined && a !== '' && a === b;
          }));
          if (clash) return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint on ${this.table}(${cols.join(',')})` } };
        }
        state.seq += 1;
        const row: Row = { id: `row-${this.table}-${state.seq}`, created_at: new Date(BASE + state.seq * 1000).toISOString(), ...this.payload };
        rowsOf(this.table).push(row);
        state.writes.push({ table: this.table, op: 'insert', values: { ...this.payload } });
        return this.shape(this.returning ? [row] : null);
      }

      if (this.op === 'update') {
        const hit = matches();
        for (const r of hit) Object.assign(r, this.payload);
        state.writes.push({ table: this.table, op: 'update', values: { ...this.payload }, matched: hit.length });
        return { data: null, error: null, count: this.wantCount ? hit.length : null };
      }

      let rows = matches();
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        rows = [...rows].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (asc ? 1 : -1));
      }
      if (this.limitN !== null) rows = rows.slice(0, this.limitN);
      return this.shape(rows);
    }

    private shape(rows: Row[] | null): { data: unknown; error: DbError | null } {
      if (this.mode === 'many') return { data: rows, error: null };
      const first = rows?.[0] ?? null;
      if (this.mode === 'single' && !first) return { data: null, error: { code: 'PGRST116', message: 'no rows returned' } };
      return { data: first, error: null };
    }
  }

  return {
    state,
    db: { from: (table: string) => new Query(table) },
    seed(table: string, rows: Row[]) { state.tables[table] = rows.map(r => ({ ...r })); },
    rows(table: string): Row[] { return rowsOf(table); },
    failNext(table: string, op: Failure['op'], error: DbError = { message: 'simulated failure' }) { state.failures.push({ table, op, error }); },
    /** Hold the first `parties` matching operations until all have arrived, then release them together. */
    barrier(table: string, op: Barrier['op'], parties = 2) { state.barriers.push({ table, op, parties, waiting: [], released: false }); },
    writesTo(table: string, op?: 'insert' | 'update'): WriteLog[] { return state.writes.filter(w => w.table === table && (!op || w.op === op)); },
    clearWrites() { state.writes.length = 0; },
  };
}

export type InMemoryDb = ReturnType<typeof createInMemoryDb>;
