/**
 * In-memory PostgREST double for the WhatsApp tests.
 *
 * Columns: production's captured schema for existing tables
 * (lib/portal/__tests__/fixtures/productionSchema.ts), job_cards columns the
 * live job-status route reads, and the WhatsApp tables PARSED FROM THE
 * MIGRATION FILE — so a query naming a column that the migration does not
 * create fails here with 42703, as it would in production.
 *
 * Emulates the migration's unique indexes on whatsapp_messages (client
 * request id; dedupe key where status <> 'failed'; wamid) with 23505.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRODUCTION_COLUMNS } from '@/lib/portal/__tests__/fixtures/productionSchema';

type Row = Record<string, unknown>;
type Err = { code: string; message: string } | null;

export function migrationColumns(): Record<string, string[]> {
  const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/2026-10-19_whatsapp_business.sql'), 'utf8');
  const out: Record<string, string[]> = {};
  const re = /CREATE TABLE IF NOT EXISTS public\.(\w+) \(([\s\S]*?)\n\);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const cols = m[2].split('\n')
      .map(l => l.trim())
      .filter(l => /^[a-z_]+\s+[A-Z]/.test(l) && !/^(CONSTRAINT|PRIMARY|CHECK|UNIQUE)/.test(l))
      .map(l => l.split(/\s+/)[0]);
    out[m[1]] = cols;
  }
  return out;
}

export const JOB_CARD_COLUMNS = ['id', 'customer', 'vehicle', 'customer_phone', 'customer_email', 'repair_stage', 'status', 'shop_id', 'status_token', 'stage_history', 'service_type', 'check_in_date'];

export function allColumns(): Record<string, readonly string[]> {
  return { ...PRODUCTION_COLUMNS, job_cards: JOB_CARD_COLUMNS, shop_mirrors: ['shop_id', 'mirror_shop_id'], ...migrationColumns() };
}

export function createFakeDb(seed: Record<string, Row[]> = {}) {
  const columns = allColumns();
  const tables: Record<string, Row[]> = {};
  for (const t of Object.keys(columns)) tables[t] = (seed[t] ?? []).map(r => ({ ...r }));
  for (const t of Object.keys(seed)) tables[t] ??= seed[t].map(r => ({ ...r }));
  let idSeq = 0;
  const failNext = new Map<string, string>();

  function uniqueViolation(table: string, row: Row, ignore?: Row): boolean {
    if (table !== 'whatsapp_messages') return false;
    return tables[table].some(o => o !== ignore && (
      (row.client_request_id && o.shop_id === row.shop_id && o.client_request_id === row.client_request_id) ||
      (row.status !== 'failed' && o.status !== 'failed' && o.shop_id === row.shop_id && o.dedupe_key === row.dedupe_key) ||
      (row.wamid && o.wamid === row.wamid)
    ));
  }

  function defaults(table: string, row: Row): Row {
    const now = new Date().toISOString();
    if (table === 'whatsapp_messages') return { id: `msg-${++idSeq}`, status: 'pending', created_at: now, updated_at: now, wamid: null, ...row };
    if (table === 'whatsapp_connections') return { status: 'not_connected', mode: 'sandbox', enabled: false, automations_enabled: false, automation_settings: {}, sandbox_recipients: [], attestations: {}, ...row };
    if (table === 'whatsapp_consent_events') return { id: ++idSeq, ...row };
    return { ...row };
  }

  function from(table: string) {
    const known = columns[table];
    let problem: Err = null;
    const check = (col: string) => {
      if (!known) problem ??= { code: '42P01', message: `relation ${table} does not exist` };
      else if (!known.includes(col)) problem ??= { code: '42703', message: `column ${table}.${col} does not exist` };
    };
    const filters: Array<(r: Row) => boolean> = [];
    let selected: string[] | '*' = '*';
    let op: { kind: 'select' } | { kind: 'insert'; rows: Row[] } | { kind: 'update'; patch: Row } | { kind: 'upsert'; rows: Row[]; conflict: string[]; ignore: boolean } | { kind: 'delete' } = { kind: 'select' };
    let limitN: number | null = null;
    let orderBy: { col: string; asc: boolean } | null = null;

    const shape = (r: Row) => (selected === '*' ? { ...r } : Object.fromEntries(selected.map(c => [c, r[c] ?? null])));

    function exec(mode: 'many' | 'maybeSingle' | 'single'): { data: unknown; error: Err } {
      const injected = failNext.get(table);
      if (injected) { failNext.delete(table); return { data: null, error: { code: injected, message: 'injected' } }; }
      if (!known) check('*');
      if (problem) return { data: null, error: problem };
      let result: Row[] = [];
      if (op.kind === 'select') {
        result = tables[table].filter(r => filters.every(f => f(r)));
      } else if (op.kind === 'insert') {
        for (const raw of op.rows) {
          Object.keys(raw).forEach(check);
          if (problem) return { data: null, error: problem };
          const row = defaults(table, raw);
          if (uniqueViolation(table, row)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          tables[table].push(row);
          result.push(row);
        }
      } else if (op.kind === 'update') {
        Object.keys(op.patch).forEach(check);
        if (problem) return { data: null, error: problem };
        for (const r of tables[table].filter(x => filters.every(f => f(x)))) {
          const next = { ...r, ...op.patch };
          if (uniqueViolation(table, next, r)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          Object.assign(r, op.patch);
          result.push(r);
        }
      } else if (op.kind === 'upsert') {
        const { conflict, ignore } = op;
        for (const raw of op.rows) {
          Object.keys(raw).forEach(check);
          if (problem) return { data: null, error: problem };
          const existing = tables[table].find(r => conflict.every(c => r[c] === raw[c]));
          if (existing) { if (!ignore) Object.assign(existing, raw); result.push(existing); }
          else { const row = defaults(table, raw); tables[table].push(row); result.push(row); }
        }
      } else if (op.kind === 'delete') {
        const keep = tables[table].filter(r => !filters.every(f => f(r)));
        result = tables[table].filter(r => filters.every(f => f(r)));
        tables[table] = keep;
      }
      if (orderBy) {
        const { col, asc } = orderBy;
        result = [...result].sort((a, b) => (String(a[col] ?? '') < String(b[col] ?? '') ? -1 : 1) * (asc ? 1 : -1));
      }
      if (limitN != null) result = result.slice(0, limitN);
      const shaped = result.map(shape);
      if (mode === 'many') return { data: op.kind === 'select' || selected !== '*' ? shaped : null, error: null };
      if (shaped.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
      if (mode === 'single' && !shaped.length) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      return { data: shaped[0] ?? null, error: null };
    }

    const b = {
      select(cols = '*') {
        if (cols.trim() !== '*') { selected = cols.split(',').map(c => c.trim()).filter(Boolean); selected.forEach(check); }
        return b;
      },
      insert(rows: Row | Row[]) { op = { kind: 'insert', rows: Array.isArray(rows) ? rows : [rows] }; return b; },
      update(patch: Row) { op = { kind: 'update', patch }; return b; },
      upsert(rows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
        op = { kind: 'upsert', rows: Array.isArray(rows) ? rows : [rows], conflict: (opts?.onConflict ?? 'id').split(',').map(s => s.trim()), ignore: !!opts?.ignoreDuplicates };
        return b;
      },
      delete() { op = { kind: 'delete' }; return b; },
      eq(col: string, v: unknown) { check(col); filters.push(r => r[col] === v); return b; },
      neq(col: string, v: unknown) { check(col); filters.push(r => r[col] !== v); return b; },
      in(col: string, vs: unknown[]) { check(col); filters.push(r => vs.includes(r[col])); return b; },
      lt(col: string, v: string) { check(col); filters.push(r => String(r[col] ?? '') < v); return b; },
      not(col: string, opr: string, v: unknown) { check(col); filters.push(r => !(opr === 'is' && v === null ? r[col] == null : r[col] === v)); return b; },
      order(col: string, o?: { ascending?: boolean }) { check(col); orderBy = { col, asc: o?.ascending !== false }; return b; },
      limit(n: number) { limitN = n; return b; },
      maybeSingle: () => Promise.resolve(exec('maybeSingle')),
      single: () => Promise.resolve(exec('single')),
      then<T>(res: (r: { data: unknown; error: Err }) => T, rej?: (e: unknown) => T) { return Promise.resolve(exec('many')).then(res, rej); },
    };
    return b;
  }

  return {
    db: { from },
    tables,
    failNext: (table: string, code: string) => failNext.set(table, code),
  };
}
