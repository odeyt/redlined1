/**
 * The demo tenant's records, as the app will read them.
 *
 * The seed once wrote invoice lines as [description, qty, rate] tuples, a legacy
 * shape nothing in the product reads. The draft invoice would have totalled
 * nothing on Command Center, the walkthrough's final screen. These tests hold the
 * seeded payloads to the shapes the Invoices view and Command Center consume, and
 * prove the live-schema check refuses before any write when the schema disagrees.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { calculateTotals, getEffectiveTotal, mapInvoiceRow } from '../../domain/invoiceMath';
import { DEMO } from '../gates';
import {
  DEMO_CONTENT, DEMO_INVOICE_EXPECTED_TOTAL, demoInvoiceLines, invoiceRow, repairOrderRow,
  schemaWriteFailures, seedWritePlan, seededInvoiceFailure, type OpenApiSchema, type SeedWrite,
} from '../demoRecords';

const root = join(__dirname, '..', '..', '..');
const source = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r/g, '');
const OWNER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const CUSTOMER = '0b0e7a52-4f7e-4a1c-9d2e-2f6c8a1b3c4d';

/** The invoices row as it would be read back after the seed's insert. */
const storedInvoice = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...invoiceRow({ customerId: CUSTOMER, jobCardId: 'job-card-1', ownerId: OWNER }),
  shop_id: '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
  created_at: '2026-09-15T00:00:00.000Z',
  ...overrides,
});

describe('the seeded draft invoice is in the shape the app reads', () => {
  it('every line is an InvoiceLine object with note, description, qty and rate', () => {
    for (const line of demoInvoiceLines()) {
      expect(Array.isArray(line)).toBe(false);
      expect(line).toEqual({
        note: expect.any(String), description: expect.any(String), qty: expect.any(Number), rate: expect.any(Number),
      });
      expect(line.description.trim()).not.toBe('');
    }
  });

  it('Invoices view: mapInvoiceRow + calculateTotals give a nonzero USD 275.00', () => {
    const totals = calculateTotals(mapInvoiceRow(storedInvoice()));
    expect(totals.subtotal).toBe(DEMO_INVOICE_EXPECTED_TOTAL);
    expect(totals.tax).toBe(0);
    expect(totals.total).toBe(275);
    expect(totals.total).toBeGreaterThan(0);
  });

  it('Invoices view: getEffectiveTotal, the single displayed amount, is USD 275', () => {
    expect(getEffectiveTotal(mapInvoiceRow(storedInvoice()))).toEqual({ amount: 275, currency: 'USD' });
  });

  it('Invoices view shows each line by description, and warns on none (every priced line has a quantity)', () => {
    const view = source('features/invoices/InvoicesView.tsx');
    expect(view).toMatch(/pricedLines = inv\.lines\.filter\(l => \(l\.rate \|\| 0\) > 0\)/);
    expect(view).toMatch(/zeroQty = pricedLines\.filter\(l => \(l\.qty \|\| 0\) === 0\)/);
    const lines = mapInvoiceRow(storedInvoice()).lines;
    expect(lines.map(l => l.description)).toEqual([
      DEMO_CONTENT.diagnosis.description, DEMO_CONTENT.part.description, DEMO_CONTENT.repair.description,
    ]);
    expect(lines.filter(l => (l.rate || 0) > 0).filter(l => (l.qty || 0) === 0)).toEqual([]);
  });

  it('Command Center reads lines as { qty, rate } objects, and the seeded lines total 275 there', () => {
    const stats = source('features/dashboard/shared/useOperationalStats.ts');
    expect(stats).toMatch(/inv\.lines as \{ qty: number; rate: number; currency\?: string \}\[\]/);
    expect(stats).toMatch(/\(l\.qty \|\| 0\) \* \(l\.rate \|\| 0\)/);
    // The same arithmetic, applied to what the seed stores.
    const stored = storedInvoice().lines as { qty: number; rate: number }[];
    expect(stored.reduce((sum, l) => sum + (l.qty || 0) * (l.rate || 0), 0)).toBe(DEMO_INVOICE_EXPECTED_TOTAL);
  });

  it('agrees with the repair order on screen: its work lines plus parts equal the invoice subtotal', () => {
    const ro = repairOrderRow({ jobCardId: 'job-card-1', customerId: CUSTOMER, openedDate: '2026-09-15T00:00:00.000Z' });
    const labor = ro.work_lines.reduce((s, w) => s + w.qty * w.rate, 0);
    expect(labor + ro.parts_total).toBe(DEMO_INVOICE_EXPECTED_TOTAL);
    expect(ro.labor_hours).toBe(1.5);
    expect(ro.invoice_number).toBe(DEMO.invoiceNumber);
    expect(ro.parts).toEqual([{ description: 'Intercooler boost hose', partNumber: 'DEMO-IBH-001', qty: 1, unitCost: 95 }]);
  });

  it('the legacy tuple shape — the bug fixed here — totals nothing the app can show', () => {
    const legacy = storedInvoice({ lines: [['Charge-air system diagnosis and boost leak test', 1, 120]] });
    expect(Number.isFinite(calculateTotals(mapInvoiceRow(legacy)).total)).toBe(false);
    expect(seededInvoiceFailure(legacy)).toBe('invoice line 1 is not an InvoiceLine object');
  });

  it('sets owner_id to the demo owner instead of relying on its auth.uid() default', () => {
    expect(storedInvoice().owner_id).toBe(OWNER);
    for (const bad of ['', 'not-a-uuid']) {
      expect(() => invoiceRow({ customerId: CUSTOMER, jobCardId: 'job-card-1', ownerId: bad })).toThrow('invoice owner id is not a UUID');
    }
  });
});

describe('seededInvoiceFailure: the read-back check the seed runs on the stored invoice', () => {
  it('passes the invoice the seed writes', () => {
    expect(seededInvoiceFailure(storedInvoice())).toBeNull();
  });

  it.each<[string, Record<string, unknown> | null]>([
    ['an unreadable row', null],
    ['no lines', storedInvoice({ lines: [] })],
    ['lines that are not an array', storedInvoice({ lines: '[]' })],
    ['a null line', storedInvoice({ lines: [null] })],
    ['a line without a description', storedInvoice({ lines: [{ note: '', description: ' ', qty: 1, rate: 275 }] })],
    ['a string quantity', storedInvoice({ lines: [{ note: '', description: 'x', qty: '1', rate: 275 }] })],
    ['a missing rate', storedInvoice({ lines: [{ note: '', description: 'x', qty: 1 }] })],
    ['a priced line with zero quantity', storedInvoice({ lines: [{ note: '', description: 'x', qty: 0, rate: 275 }] })],
    ['a different total', storedInvoice({ lines: [{ note: '', description: 'x', qty: 1, rate: 274 }] })],
    ['tax added', storedInvoice({ tax_rate: 0.0825 })],
    ['a different currency', storedInvoice({ currency: 'THB' })],
  ])('refuses %s', (_label, row) => {
    expect(seededInvoiceFailure(row)).not.toBeNull();
  });
});

describe('live-schema check: refuses before any production write', () => {
  /** A schema that accepts exactly the plan, optionally with extra required columns. */
  const acceptingSchema = (plan: SeedWrite[], required: Record<string, string[]> = {}): OpenApiSchema => {
    const definitions: NonNullable<OpenApiSchema['definitions']> = {};
    for (const w of plan) {
      const def = definitions[w.table] ?? { properties: {}, required: required[w.table] ?? [] };
      for (const c of w.columns) def.properties![c] = { type: 'string' };
      for (const r of required[w.table] ?? []) def.properties![r] = { type: 'string' };
      definitions[w.table] = def;
    }
    return { definitions };
  };

  it('passes when every written column exists and every insert covers its required columns', () => {
    const plan = seedWritePlan();
    expect(schemaWriteFailures(acceptingSchema(plan, { invoices: ['number', 'shop_id'], customers: ['name'] }))).toEqual([]);
  });

  it.each([null, {}, { definitions: undefined }])('refuses an unreadable schema description %p', schema => {
    expect(schemaWriteFailures(schema as OpenApiSchema | null)).toEqual(['the live schema description could not be read']);
  });

  it('refuses a table missing from the live schema', () => {
    const schema = acceptingSchema(seedWritePlan());
    delete schema.definitions!.repair_orders;
    expect(schemaWriteFailures(schema)).toContain('repair_orders: not in the live schema');
  });

  it('refuses a column the live table does not have — including invoices.owner_id', () => {
    const schema = acceptingSchema(seedWritePlan());
    delete (schema.definitions!.invoices!.properties as Record<string, unknown>).owner_id;
    expect(schemaWriteFailures(schema)).toContain('invoices.owner_id: column does not exist');
  });

  it('refuses an insert that omits a NOT NULL column without a default', () => {
    const schema = acceptingSchema(seedWritePlan(), { invoices: ['approved_by'] });
    expect(schemaWriteFailures(schema)).toContain('invoices.approved_by: required on insert but not written by the seed');
  });

  it('does not apply insert requirements to update-only writes', () => {
    const schema = acceptingSchema(seedWritePlan(), { profiles: ['email'], shop_settings: ['shop_id'] });
    expect(schemaWriteFailures(schema)).toEqual([]);
  });

  it('refuses a plan in which the invoice insert would leave owner_id to its default', () => {
    const plan = seedWritePlan().map(w =>
      w.table === 'invoices' && w.mode === 'insert' ? { ...w, columns: w.columns.filter(c => c !== 'owner_id') } : w);
    expect(schemaWriteFailures(acceptingSchema(plan), plan)).toContain('invoices.owner_id: the seed must set it explicitly');
  });

  it('the plan is derived from the real builders: invoice insert writes shop_id, lines and owner_id', () => {
    const plan = seedWritePlan();
    expect(plan.map(w => `${w.table}:${w.mode}`)).toEqual([
      'organizations:insert', 'shops:insert', 'shop_users:insert', 'profiles:update', 'shop_settings:update',
      'technicians:insert', 'customers:insert', 'vehicles:insert', 'job_cards:insert', 'invoices:insert',
      'invoices:update', 'repair_orders:insert',
    ]);
    const invoiceInsert = plan.find(w => w.table === 'invoices' && w.mode === 'insert')!;
    expect(invoiceInsert.columns).toEqual(expect.arrayContaining(['shop_id', 'number', 'lines', 'owner_id']));
    expect(plan.find(w => w.table === 'shops')!.columns).toContain('is_synthetic');
  });
});
