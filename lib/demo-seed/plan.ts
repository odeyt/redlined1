/**
 * What the demo seed would insert, given what already exists. Pure.
 *
 * Idempotency is by natural key: every seeded row has a stable key (see
 * summitDataset.ts), the seed reads which keys already exist in the demo
 * shop, and inserts only the missing ones. It never updates a seeded row:
 * UPDATEs on job_cards, repair_orders, estimates and invoices fire alert
 * triggers (and from there pg_net push requests), INSERTs do not. A row that
 * differs from the dataset is left alone — an edit made on camera is not a
 * defect for the seed to "fix".
 */
import { SUMMIT, type SummitDataset } from './summitDataset';

export interface TableSpec {
  table: string;
  /** Column that identifies a seeded row within the demo shop. */
  key: string;
  rows: (d: SummitDataset) => Record<string, unknown>[];
  /** True for tables whose seeded rows carry the date of the run in their key. */
  dated: boolean;
}

/** Insert order: parents before the rows that reference them. */
export const TABLE_SPECS: TableSpec[] = [
  { table: 'customers', key: 'id', rows: d => d.customers as unknown as Record<string, unknown>[], dated: false },
  { table: 'vehicles', key: 'plate', rows: d => d.vehicles as unknown as Record<string, unknown>[], dated: false },
  { table: 'technicians', key: 'name', rows: d => d.technicians as unknown as Record<string, unknown>[], dated: false },
  { table: 'parts', key: 'part_number', rows: d => d.parts as unknown as Record<string, unknown>[], dated: false },
  { table: 'job_cards', key: 'id', rows: d => d.jobCards as unknown as Record<string, unknown>[], dated: true },
  { table: 'closed_jobs', key: 'id', rows: d => d.closedJobs as unknown as Record<string, unknown>[], dated: true },
  { table: 'invoices', key: 'number', rows: d => d.invoices as unknown as Record<string, unknown>[], dated: true },
  { table: 'repair_orders', key: 'ro_number', rows: d => d.repairOrders as unknown as Record<string, unknown>[], dated: true },
  { table: 'estimates', key: 'estimate_number', rows: d => d.estimates as unknown as Record<string, unknown>[], dated: true },
  { table: 'payments', key: 'reference_number', rows: d => d.payments as unknown as Record<string, unknown>[], dated: true },
  { table: 'repair_cases', key: 'ro_number', rows: d => d.repairCases as unknown as Record<string, unknown>[], dated: true },
];

export interface PlannedInsert { table: string; key: string; rows: Record<string, unknown>[] }

/** Rows whose key is not yet present. `existing` maps table → keys already in the demo shop. */
export function planInserts(d: SummitDataset, existing: Record<string, ReadonlySet<string>>): PlannedInsert[] {
  return TABLE_SPECS.map(spec => {
    const have = existing[spec.table] ?? new Set<string>();
    return { table: spec.table, key: spec.key, rows: spec.rows(d).filter(r => !have.has(String(r[spec.key]))) };
  });
}

const DATED_KEY = new RegExp(`^${SUMMIT.docPrefix}-[A-Z]+-(\\d{6})-\\d{2}$`);

/** The generation (YYMMDD) a dated seed key belongs to, or null if it is not a seed key. */
export function generationOf(key: string): string | null {
  return key.match(DATED_KEY)?.[1] ?? null;
}

/** Every key the seed could ever have written for a static table. */
export function staticKeys(d: SummitDataset, table: string): string[] {
  const spec = TABLE_SPECS.find(s => s.table === table && !s.dated);
  return spec ? spec.rows(d).map(r => String(r[spec.key])) : [];
}

/**
 * Seeded rows from a previous day that would distort today's dashboard if
 * left: open job cards, estimates, unpaid invoices, repair orders, archived
 * jobs and repair cases. Payments and the invoices they paid are history —
 * they belong to the day they were recorded and do not move today's figures —
 * and payments cannot be deleted in any case (append-only ledger).
 */
export function isStaleGeneration(key: string, currentGeneration: string): boolean {
  const g = generationOf(key);
  return g !== null && g !== currentGeneration;
}

/** Total rows a plan would insert. */
export const plannedRowCount = (plan: PlannedInsert[]) => plan.reduce((s, p) => s + p.rows.length, 0);

/** Columns each table's inserts write (plus shop_id), for the live-schema check. */
export function columnsWritten(d: SummitDataset): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const spec of TABLE_SPECS) {
    const cols = new Set<string>(['shop_id']);
    for (const r of spec.rows(d)) Object.keys(r).forEach(k => cols.add(k));
    out[spec.table] = [...cols];
  }
  return out;
}

/** The part of PostgREST's OpenAPI description the schema check reads. */
export interface OpenApiSchema {
  definitions?: Record<string, { required?: string[]; properties?: Record<string, unknown> } | undefined>;
}

/**
 * Compares every insert with the LIVE schema before anything is written:
 * a table missing, a column that does not exist, or a NOT NULL column
 * without a default that the seed does not fill. Constraints the OpenAPI
 * description cannot express (CHECK, foreign keys) are not proven here.
 */
export function schemaFailures(schema: OpenApiSchema | null, written: Record<string, string[]>): string[] {
  if (!schema?.definitions) return ['the live schema description could not be read'];
  const failures: string[] = [];
  for (const [table, cols] of Object.entries(written)) {
    const def = schema.definitions[table];
    if (!def?.properties) { failures.push(`${table}: not in the live schema`); continue; }
    const live = new Set(Object.keys(def.properties));
    for (const c of cols) if (!live.has(c)) failures.push(`${table}.${c}: column does not exist`);
    for (const r of def.required ?? []) if (!cols.includes(r)) failures.push(`${table}.${r}: required on insert but not written`);
  }
  return failures;
}
