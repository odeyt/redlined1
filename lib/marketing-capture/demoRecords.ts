/**
 * Every row the demo-tenant seed writes, built by pure functions.
 *
 * Kept out of scripts/marketing/seed-demo-tenant.ts so the exact payloads can be
 * tested without a database: that the draft invoice is in the shape the app
 * reads (and so totals what the walkthrough shows), and that every column the
 * seed writes exists in the live schema before the first production write.
 *
 * Nothing here is copied from a real customer, vehicle or job.
 */
import { getEffectiveTotal, mapInvoiceRow, type InvoiceLine } from '../domain/invoiceMath';
import { DEMO } from './gates';

export const DEMO_CONTENT = {
  concern: 'Check-engine light and reduced engine power',
  cause: 'Charge-air pressure fault. Smoke test found a boost leak at a split intercooler boost hose.',
  correction: 'Replace intercooler boost hose, clear stored fault codes, road test under load.',
  mileage: '84250',
  shopAddress: '1 Demo Street, Sample City',
  shopPhone: '000-000-0000',
  part: { description: 'Intercooler boost hose', partNumber: 'DEMO-IBH-001', qty: 1, unitCost: 95 },
  laborRate: 120,
  diagnosis: { description: 'Charge-air system diagnosis and boost leak test', hours: 1 },
  repair: { description: 'Replace intercooler boost hose', hours: 0.5 },
} as const;

/** 1.0 h + 0.5 h at 120, plus one 95 part, no tax, discount or supplies. */
export const DEMO_INVOICE_EXPECTED_TOTAL = 275;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Auth user ids and shop ids are UUIDs. */
function requireUuid(label: string, value: string): string {
  if (!UUID.test(value)) throw new Error(`${label} is not a UUID`);
  return value;
}

/** Other keys are only required to be present: their column types are not assumed. */
function requireId(label: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is missing`);
  return value;
}

/**
 * The draft invoice's lines, in lib/domain/invoiceMath's InvoiceLine shape: the
 * one mapInvoiceRow, calculateTotals, the Invoices view and Command Center read.
 * `note` carries the RO number on labor and the part number on parts, exactly as
 * the Repair Orders "convert to invoice" path writes them.
 */
export function demoInvoiceLines(): InvoiceLine[] {
  const { diagnosis, part, repair, laborRate } = DEMO_CONTENT;
  return [
    { note: DEMO.roNumber, description: diagnosis.description, qty: diagnosis.hours, rate: laborRate },
    { note: part.partNumber, description: part.description, qty: part.qty, rate: part.unitCost },
    { note: DEMO.roNumber, description: repair.description, qty: repair.hours, rate: laborRate },
  ];
}

/**
 * Judges an invoices row as the app will read it: every line an InvoiceLine
 * object with finite qty and rate, priced lines with a quantity (so the Invoices
 * view shows no "add quantities" warning), and mapInvoiceRow + getEffectiveTotal
 * — the functions the Invoices view uses — giving exactly the expected USD total.
 * Returns the reason it would display wrongly, or null.
 */
export function seededInvoiceFailure(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return 'the demo invoice could not be read';
  if (!Array.isArray(row.lines) || row.lines.length === 0) return 'the demo invoice has no lines';
  for (const [i, line] of row.lines.entries()) {
    if (line === null || typeof line !== 'object' || Array.isArray(line)) return `invoice line ${i + 1} is not an InvoiceLine object`;
    const l = line as Record<string, unknown>;
    if (typeof l.description !== 'string' || l.description.trim() === '') return `invoice line ${i + 1} has no description`;
    if (typeof l.qty !== 'number' || !Number.isFinite(l.qty)) return `invoice line ${i + 1} has no numeric qty`;
    if (typeof l.rate !== 'number' || !Number.isFinite(l.rate)) return `invoice line ${i + 1} has no numeric rate`;
    if (l.rate > 0 && l.qty <= 0) return `invoice line ${i + 1} is priced but has no quantity`;
  }
  const { amount, currency } = getEffectiveTotal(mapInvoiceRow(row));
  if (currency !== 'USD' || Math.abs(amount - DEMO_INVOICE_EXPECTED_TOTAL) > 0.005) {
    return `the demo invoice totals ${currency} ${amount}, not USD ${DEMO_INVOICE_EXPECTED_TOTAL}`;
  }
  return null;
}

export const organizationRow = (slug: string) => ({ name: DEMO.shopName, slug: `${slug}-org` });

export const shopRow = (organizationId: string, slug: string) => ({
  name: DEMO.shopName, slug, organization_id: requireId('organization id', organizationId), is_synthetic: true,
});

export const ownerMembershipRow = (userId: string, shopId: string) => ({
  user_id: requireUuid('owner user id', userId), shop_id: requireUuid('shop id', shopId), role: 'owner',
});

/** Free Forever, exactly as tests/helpers/synthetic-shop.ts provisions an owner. */
export const profileUpdate = () => ({ plan: 'free', trial_ends_at: null });

export const shopSettingsUpdate = (alertPreferences: unknown) => ({
  company_name: DEMO.shopName,
  address: DEMO_CONTENT.shopAddress,
  phone: DEMO_CONTENT.shopPhone,
  default_currency: 'USD',
  alert_preferences: alertPreferences,
});

export const technicianRow = () => ({
  name: DEMO.technician, role: 'Diagnostics Specialist', pay_type: 'Hourly', status: 'Active',
  phone: null, email: null, user_id: null,
});

export const customerRow = () => ({ name: DEMO.customer, phone: null, email: null, address: null });

export const vehicleRow = (customerId: string) => ({
  customer_id: requireId('customer id', customerId), label: DEMO.vehicleLabel, year: '2021', make: 'BMW', model: '330i',
  plate: DEMO.plate, mileage: DEMO_CONTENT.mileage, vin: null, status: 'Open Job',
});

/** Mirrors createJobCard() in services/jobCardService.ts. No technician: assigned on camera. */
export const jobCardRow = (checkInDate: string) => ({
  ro: DEMO.roNumber, invoice: null, customer: DEMO.customer, vehicle: DEMO.vehicleLabel,
  service_type: 'Diagnostics', channel: 'Shop bay', location: '', technicians: [],
  status: 'Booked', priority: 'Normal', approval: 'Pending', labor_hours: 0, parts_total: 0,
  workflow: ['Booked'], next_action: 'Request approval', check_in_date: checkInDate,
  notes: DEMO_CONTENT.concern,
});

/**
 * Mirrors the invoice domain insert (lib/domain/invoices.ts). `owner_id` is set
 * explicitly: its default is auth.uid(), which is NULL under the service role,
 * so relying on it would write an ownerless invoice or violate NOT NULL.
 */
export const invoiceRow = (a: { customerId: string; jobCardId: string; ownerId: string }) => ({
  number: DEMO.invoiceNumber, customer: DEMO.customer, customer_id: requireId('customer id', a.customerId),
  vehicle: DEMO.vehicleLabel, job_card: requireId('job card id', a.jobCardId), status: 'Draft', currency: 'USD',
  discount: 0, shop_supplies: 0, tax_rate: 0,
  notes: 'Demo draft for the marketing walkthrough. Never sent.', due_date: null,
  lines: demoInvoiceLines(),
  owner_id: requireUuid('invoice owner id', a.ownerId),
});

export const invoiceLinkUpdate = (repairOrderId: string) => ({ repair_order_id: requireId('repair order id', repairOrderId) });

export const repairOrderRow = (a: { jobCardId: string; customerId: string; openedDate: string }) => {
  const { part, laborRate, diagnosis, repair } = DEMO_CONTENT;
  return {
    ro_number: DEMO.roNumber, job_card_id: requireId('job card id', a.jobCardId), invoice_number: DEMO.invoiceNumber,
    customer_name: DEMO.customer, customer_id: requireId('customer id', a.customerId), vehicle: DEMO.vehicleLabel,
    status: 'Open', concern: DEMO_CONTENT.concern, cause: DEMO_CONTENT.cause, correction: DEMO_CONTENT.correction,
    technician: DEMO.technician, labor_hours: diagnosis.hours + repair.hours, labor_rate: laborRate, currency: 'USD',
    parts: [{ ...part }], parts_total: part.qty * part.unitCost,
    work_lines: [
      { description: diagnosis.description, type: 'Diagnostic', qty: diagnosis.hours, rate: laborRate },
      { description: repair.description, type: 'Labor', qty: repair.hours, rate: laborRate },
    ],
    opened_date: a.openedDate,
  };
};

/** One write the seed performs: which table, insert or update, and the exact columns. */
export interface SeedWrite { table: string; mode: 'insert' | 'update'; columns: string[] }

/**
 * Every write, derived from the builders above with placeholder values so the
 * column lists cannot drift from what is actually sent. Shop-scoped inserts go
 * through the seed's insertOne(), which adds `shop_id`.
 */
export function seedWritePlan(): SeedWrite[] {
  const id = '00000000-0000-4000-8000-000000000000';
  const now = '2026-01-01T00:00:00.000Z';
  const cols = (row: object, withShop = false) => [...(withShop ? ['shop_id'] : []), ...Object.keys(row)];
  return [
    { table: 'organizations', mode: 'insert', columns: cols(organizationRow('s')) },
    { table: 'shops', mode: 'insert', columns: cols(shopRow(id, 's')) },
    { table: 'shop_users', mode: 'insert', columns: cols(ownerMembershipRow(id, id)) },
    { table: 'profiles', mode: 'update', columns: cols(profileUpdate()) },
    { table: 'shop_settings', mode: 'update', columns: cols(shopSettingsUpdate({})) },
    { table: 'technicians', mode: 'insert', columns: cols(technicianRow(), true) },
    { table: 'customers', mode: 'insert', columns: cols(customerRow(), true) },
    { table: 'vehicles', mode: 'insert', columns: cols(vehicleRow(id), true) },
    { table: 'job_cards', mode: 'insert', columns: cols(jobCardRow(now), true) },
    { table: 'invoices', mode: 'insert', columns: cols(invoiceRow({ customerId: id, jobCardId: id, ownerId: id }), true) },
    { table: 'invoices', mode: 'update', columns: cols(invoiceLinkUpdate(id)) },
    { table: 'repair_orders', mode: 'insert', columns: cols(repairOrderRow({ jobCardId: id, customerId: id, openedDate: now }), true) },
  ];
}

/** The part of PostgREST's OpenAPI document this check reads. */
export interface OpenApiSchema {
  definitions?: Record<string, { required?: string[]; properties?: Record<string, unknown> } | undefined>;
}

/**
 * Compares the seed's writes with the LIVE schema, before anything is written.
 *
 * PostgREST's OpenAPI document lists every column a table exposes, and marks as
 * `required` the columns that are NOT NULL with no default. So this refuses when:
 *   - the document could not be read, or a table is absent from it;
 *   - the seed writes a column the table does not have;
 *   - an insert omits a column the database would reject as missing.
 * `invoices.owner_id` must exist, because the seed sets it rather than trusting
 * its auth.uid() default. Constraints this document cannot describe (check
 * constraints, foreign keys, NOT NULL on a column that has a default) are not
 * proven here.
 */
export function schemaWriteFailures(schema: OpenApiSchema | null, plan: SeedWrite[] = seedWritePlan()): string[] {
  if (!schema?.definitions) return ['the live schema description could not be read'];
  const failures: string[] = [];
  for (const write of plan) {
    const def = schema.definitions[write.table];
    if (!def?.properties) { failures.push(`${write.table}: not in the live schema`); continue; }
    const live = new Set(Object.keys(def.properties));
    for (const c of write.columns) if (!live.has(c)) failures.push(`${write.table}.${c}: column does not exist`);
    if (write.mode === 'insert') {
      for (const r of def.required ?? []) {
        if (!write.columns.includes(r)) failures.push(`${write.table}.${r}: required on insert but not written by the seed`);
      }
    }
  }
  const invoiceInsert = plan.find(w => w.table === 'invoices' && w.mode === 'insert');
  if (!invoiceInsert?.columns.includes('owner_id')) failures.push('invoices.owner_id: the seed must set it explicitly');
  return failures;
}
