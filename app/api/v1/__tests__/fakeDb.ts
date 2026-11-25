/**
 * An in-memory stand-in for the PostgREST calls API v1 makes, for route
 * tests. Not a test file itself (no `.test.`), so Jest does not collect it.
 *
 * Supports select/insert/update/delete with eq, in, gte, order, range,
 * single and maybeSingle, plus the unique indexes and RPCs the document
 * endpoints rely on. Everything it is asked to do is recorded in `calls`.
 */
import { randomUUID } from 'crypto';

type Row = Record<string, unknown>;

export interface FakeDb {
  tables: Record<string, Row[]>;
  calls: { rpc: { fn: string; args: Row }[] };
  from(table: string): unknown;
  rpc(fn: string, args: Row): Promise<{ data: unknown; error: unknown }>;
  reset(): void;
}

/** table → columns that must be unique (each entry is one index). */
const UNIQUE: Record<string, { name: string; cols: string[]; partialNotNull?: boolean }[]> = {
  api_idempotency: [{ name: 'api_idempotency_key', cols: ['api_key_id', 'endpoint', 'idempotency_key'] }],
  invoices: [
    { name: 'invoices_pkey', cols: ['number'] },
    { name: 'invoices_one_per_source_estimate', cols: ['source_estimate_id'], partialNotNull: true },
  ],
  estimates: [{ name: 'estimates_pkey', cols: ['id'] }],
};

export function createFakeDb(): FakeDb {
  const db: FakeDb = {
    tables: {},
    calls: { rpc: [] },
    reset() {
      for (const k of Object.keys(db.tables)) delete db.tables[k];
      db.calls.rpc = [];
      counters.clear();
      invoiceSeq = 100;
    },
    from: (table: string) => builder(table),
    async rpc(fn: string, args: Row) {
      db.calls.rpc.push({ fn, args });
      if (fn === 'api_rate_limit_hit') return { data: 1, error: null };
      if (fn === 'record_audit_event') return { data: null, error: null };
      if (fn === 'api_next_document_number') {
        if (args.p_doc_type === 'invoice') return { data: ++invoiceSeq, error: null };
        const k = `${args.p_shop_id}:${args.p_doc_type}`;
        const next = (counters.get(k) ?? 10) + 1;
        counters.set(k, next);
        return { data: next, error: null };
      }
      // Anything else, including the staff next_document_number, fails here:
      // the API must never call it.
      return { data: null, error: { message: `rpc ${fn} not available to the API in this fake` } };
    },
  };

  const counters = new Map<string, number>();
  let invoiceSeq = 100;

  function violates(table: string, candidate: Row, ignore?: Row): string | null {
    for (const idx of UNIQUE[table] ?? []) {
      if (idx.partialNotNull && idx.cols.some(c => candidate[c] === null || candidate[c] === undefined)) continue;
      const clash = (db.tables[table] ?? []).some(r =>
        r !== ignore && idx.cols.every(c => r[c] === candidate[c]));
      if (clash) return idx.name;
    }
    return null;
  }

  function builder(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    const orders: [string, boolean][] = [];
    let range: [number, number] | null = null;
    let wantCount = false;
    let single: 'maybe' | 'one' | null = null;
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row | Row[] = {};
    let returning = false;

    const rows = () => (db.tables[table] ??= []);

    const run = () => {
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted: Row[] = [];
        for (const raw of list) {
          const row: Row = { created_at: new Date().toISOString(), ...raw };
          if (table !== 'invoices' && row.id === undefined) row.id = randomUUID();
          const clash = violates(table, row);
          if (clash) {
            return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint "${clash}"` } };
          }
          rows().push(row);
          inserted.push(row);
        }
        if (!returning) return { data: null, error: null };
        return { data: single ? inserted[0] ?? null : inserted, error: null };
      }

      const matched = rows().filter(r => filters.every(f => f(r)));

      if (op === 'update') {
        for (const r of matched) Object.assign(r, payload);
        if (!returning) return { data: null, error: null };
        return { data: single ? matched[0] ?? null : matched, error: null };
      }

      if (op === 'delete') {
        db.tables[table] = rows().filter(r => !matched.includes(r));
        return { data: null, error: null };
      }

      let out = matched;
      for (const [col, asc] of [...orders].reverse()) {
        out = [...out].sort((a, b) => {
          const x = String(a[col] ?? ''), y = String(b[col] ?? '');
          return x === y ? 0 : (x < y ? -1 : 1) * (asc ? 1 : -1);
        });
      }
      const count = out.length;
      if (range) out = out.slice(range[0], range[1] + 1);
      if (single) return { data: out[0] ?? null, error: null };
      return { data: out, error: null, count: wantCount ? count : null };
    };

    const b: Record<string, unknown> = {
      select: (_cols?: string, opts?: { count?: string }) => {
        if (op !== 'select') returning = true;
        wantCount = Boolean(opts?.count);
        return b;
      },
      insert: (p: Row | Row[]) => { op = 'insert'; payload = p; return b; },
      update: (p: Row) => { op = 'update'; payload = p; return b; },
      delete: () => { op = 'delete'; return b; },
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return b; },
      in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return b; },
      gte: (c: string, v: string) => { filters.push(r => String(r[c] ?? '') >= v); return b; },
      order: (c: string, o?: { ascending?: boolean }) => { orders.push([c, o?.ascending !== false]); return b; },
      range: (from: number, to: number) => { range = [from, to]; return b; },
      maybeSingle: () => { single = 'maybe'; return b; },
      single: () => { single = 'one'; return b; },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve().then(run).then(resolve, reject),
    };
    return b;
  }

  return db;
}
