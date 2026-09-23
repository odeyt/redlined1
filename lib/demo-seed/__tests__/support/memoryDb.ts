/**
 * An in-memory stand-in for the Supabase query builder, covering exactly the
 * calls MetricsBuilder makes: select (with count/head), eq, in, gte, lte, lt,
 * is, not-in. Comparison is PostgreSQL's for these values: ISO timestamps and
 * YYYY-MM-DD dates order correctly as strings, and a date compares against a
 * timestamp at that day's midnight — which string comparison also gives.
 */
type Row = Record<string, unknown>;
type Pred = (r: Row) => boolean;

const cmp = (a: unknown, b: unknown) => {
  const x = String(a ?? ''); const y = String(b ?? '');
  return x < y ? -1 : x > y ? 1 : 0;
};

class Query implements PromiseLike<{ data: Row[] | null; error: null; count: number | null }> {
  private preds: Pred[] = [];
  private head = false;
  private wantCount = false;

  constructor(private rows: Row[]) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    this.head = !!opts?.head;
    this.wantCount = !!opts?.count;
    return this;
  }
  eq(col: string, v: unknown) { this.preds.push(r => r[col] === v); return this; }
  in(col: string, vs: unknown[]) { this.preds.push(r => vs.includes(r[col])); return this; }
  gte(col: string, v: unknown) { this.preds.push(r => r[col] != null && cmp(r[col], v) >= 0); return this; }
  lte(col: string, v: unknown) { this.preds.push(r => r[col] != null && cmp(r[col], v) <= 0); return this; }
  lt(col: string, v: unknown) { this.preds.push(r => r[col] != null && cmp(r[col], v) < 0); return this; }
  is(col: string, v: null) { this.preds.push(r => (r[col] ?? null) === v); return this; }
  not(col: string, op: string, v: string) {
    if (op !== 'in') throw new Error(`memoryDb: unsupported not(${op})`);
    const vs = v.replace(/[()"]/g, '').split(',');
    this.preds.push(r => !vs.includes(String(r[col])));
    return this;
  }
  order() { return this; }
  limit() { return this; }

  then<T1, T2>(
    onfulfilled?: ((v: { data: Row[] | null; error: null; count: number | null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    const matched = this.rows.filter(r => this.preds.every(p => p(r)));
    const result = { data: this.head ? null : matched.map(r => ({ ...r })), error: null, count: this.wantCount ? matched.length : null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

export function createMemoryDb(tables: Record<string, Row[]>) {
  return {
    tables,
    from(table: string) { return new Query(tables[table] ?? []); },
  };
}
