/**
 * Redline AI — data queries (read-only).
 *
 * Every function takes the CALLER's Supabase client (the cookie SSR client,
 * so RLS applies to every read) plus the shop scope resolved server-side
 * from the caller's own memberships — lib/shops/mergedScope over the shop
 * lib/shops/requestShop picked. A shop id from the client is never trusted:
 * it only ever chooses among the caller's own memberships (requestShop),
 * and mergedShopScope only widens to shops merged INTO that shop.
 *
 * Column handling is defensive on purpose: this codebase has two schema
 * eras (text labels + ids, 'Sent' vs 'sent' statuses, total_amount vs
 * totals computed from lines). Rows are mapped with fallbacks and the pure
 * builders in answers.ts do the classification.
 */
import { mapInvoiceRow } from '@/lib/domain/invoiceMath';
import { mapPaymentRow } from '@/lib/domain/payments';
import { receivablesFrom } from '@/lib/domain/receivables';
import { calculateEstimateTotals } from '@/lib/domain/estimateMath';
import { mergedShopScope } from '@/lib/shops/mergedScope';
import {
  STALE_ESTIMATE_DAYS,
  ageInDays,
  groupOwes,
  isAwaitingReply,
  isOpenJob,
  normalizeStatus,
} from './answers';
import type {
  CustomerOwes,
  EstimateFact,
  HistoryEvent,
  JobFact,
  VehicleFact,
  VehicleHistory,
} from './types';

/** The query surface these functions need, so tests can supply a stub. */
export interface RedlineDb {
  from(table: string): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyChain = any;

interface Rows {
  data: Record<string, unknown>[] | null;
  error: { message?: string } | null;
}

async function rows(q: unknown): Promise<Record<string, unknown>[]> {
  const res = (await (q as PromiseLike<Rows>)) ?? { data: null, error: null };
  if (res.error) throw new Error(res.error.message ?? 'query failed');
  return res.data ?? [];
}

function t(db: RedlineDb, name: string): AnyChain {
  return db.from(name) as AnyChain;
}

export async function scopeFor(db: RedlineDb, shopId: string): Promise<string[]> {
  return mergedShopScope(db, shopId);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function normalizeVehicleText(v: string): string {
  return v.toLowerCase().replace(/\s+/g, ' ').trim();
}

function vehicleLabelOf(r: Record<string, unknown>): string {
  const label = str(r.label);
  if (label) return label;
  return [r.year, r.make, r.model].map(str).filter(Boolean).join(' ');
}

// ── Estimates ────────────────────────────────────────────────────────────────

export function mapEstimateRow(
  r: Record<string, unknown>,
  today: string,
  customerNames?: ReadonlyMap<string, string>,
): EstimateFact {
  const status = str(r.status);
  const createdAt = str(r.created_at);
  const sentAt = str(r.sent_at) || createdAt;
  const age = ageInDays(sentAt || createdAt, today);

  let total: number | null = null;
  if (r.total_amount != null && !Number.isNaN(Number(r.total_amount))) {
    total = Number(r.total_amount);
  } else if (Array.isArray(r.lines) && r.lines.length && typeof r.lines[0] === 'object') {
    const lines = (r.lines as { qty?: number; rate?: number; currency?: string }[])
      .map(l => ({ qty: Number(l.qty ?? 0), rate: Number(l.rate ?? 0), currency: l.currency }));
    total = calculateEstimateTotals({
      currency: str(r.currency) || 'USD',
      lines,
      discount: Number(r.discount ?? 0),
      taxRate: Number(r.tax_rate ?? 0),
    }).total;
  }

  const customerId = str(r.customer_id);
  const awaiting = isAwaitingReply(status);
  return {
    id: str(r.id),
    number: str(r.estimate_number) || str(r.id),
    status,
    customerName:
      str(r.customer_name) || str(r.customer) ||
      (customerId ? customerNames?.get(customerId) ?? '' : ''),
    vehicleLabel: str(r.vehicle),
    total,
    currency: str(r.currency) || 'USD',
    sentAt: sentAt || null,
    createdAt,
    ageDays: age,
    awaitingReply: awaiting,
    stale: awaiting && age >= STALE_ESTIMATE_DAYS,
  };
}

async function customerNamesFor(
  db: RedlineDb,
  scope: string[],
  ids: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return out;
  try {
    const found = await rows(
      t(db, 'customers').select('id, name').in('shop_id', scope).in('id', unique),
    );
    for (const c of found) out.set(str(c.id), str(c.name));
  } catch { /* names are a citation nicety; ids still cite the record */ }
  return out;
}

/** Estimates sent to a customer with no decision yet, oldest first. */
export async function fetchAwaitingEstimates(
  db: RedlineDb,
  scope: string[],
  today: string,
): Promise<EstimateFact[]> {
  const found = await rows(
    t(db, 'estimates').select('*').in('shop_id', scope)
      .order('created_at', { ascending: true }).limit(500),
  );
  const names = await customerNamesFor(db, scope, found.map(r => str(r.customer_id)));
  return found
    .map(r => mapEstimateRow(r, today, names))
    .filter(e => e.awaitingReply)
    .sort((a, b) => b.ageDays - a.ageDays);
}

export async function fetchEstimateById(
  db: RedlineDb,
  scope: string[],
  id: string,
  today: string,
): Promise<EstimateFact | null> {
  const found = await rows(
    t(db, 'estimates').select('*').in('shop_id', scope).eq('id', id).limit(1),
  );
  if (!found.length) return null;
  const names = await customerNamesFor(db, scope, [str(found[0].customer_id)]);
  return mapEstimateRow(found[0], today, names);
}

// ── Job cards ────────────────────────────────────────────────────────────────

export function mapJobRow(r: Record<string, unknown>, today: string): JobFact {
  const since = str(r.check_in_date) || str(r.created_at);
  return {
    id: str(r.id),
    ro: str(r.ro),
    customerName: str(r.customer),
    vehicleLabel: str(r.vehicle),
    serviceType: str(r.service_type),
    status: str(r.status),
    checkInDate: since,
    ageDays: ageInDays(since, today),
  };
}

export async function fetchOpenJobs(
  db: RedlineDb,
  scope: string[],
  today: string,
): Promise<JobFact[]> {
  const found = await rows(
    t(db, 'job_cards').select('*').in('shop_id', scope)
      .order('created_at', { ascending: true }).limit(500),
  );
  return found
    .map(r => mapJobRow(r, today))
    .filter(j => isOpenJob(j.status))
    .sort((a, b) => b.ageDays - a.ageDays);
}

// ── Invoices / who owes ──────────────────────────────────────────────────────

const INVOICE_NUMBER_CHUNK = 150;

/** Outstanding balances for the shop, grouped by customer (answers.ts). */
export async function fetchOwed(
  db: RedlineDb,
  scope: string[],
  today: string,
): Promise<CustomerOwes[]> {
  const invoiceRows = await rows(
    t(db, 'invoices').select('*').in('shop_id', scope).limit(1000),
  );
  const invoices = invoiceRows.map(mapInvoiceRow);
  const numbers = [...new Set(invoices.map(i => i.invoiceNumber).filter(Boolean))];
  const paymentRows: Record<string, unknown>[] = [];
  for (let i = 0; i < numbers.length; i += INVOICE_NUMBER_CHUNK) {
    paymentRows.push(...await rows(
      t(db, 'payments').select('*').in('shop_id', scope)
        .in('invoice_number', numbers.slice(i, i + INVOICE_NUMBER_CHUNK)),
    ));
  }
  return groupOwes(receivablesFrom(invoices, paymentRows.map(mapPaymentRow), today));
}

// ── Vehicles ─────────────────────────────────────────────────────────────────

export function mapVehicleRow(
  r: Record<string, unknown>,
  customerNames?: ReadonlyMap<string, string>,
): VehicleFact {
  const customerId = str(r.customer_id);
  return {
    id: str(r.id),
    label: vehicleLabelOf(r),
    plate: str(r.plate),
    customerName:
      str(r.customer_name) ||
      (customerId ? customerNames?.get(customerId) ?? '' : ''),
  };
}

export async function searchVehicles(
  db: RedlineDb,
  scope: string[],
  query: string,
): Promise<VehicleFact[]> {
  const q = query.replace(/[%_]/g, '').trim();
  let chain = t(db, 'vehicles').select('*').in('shop_id', scope);
  if (q) chain = chain.or(`label.ilike.%${q}%,plate.ilike.%${q}%`);
  const found = await rows(chain.order('date_received', { ascending: false }).limit(20));
  const names = await customerNamesFor(db, scope, found.map(r => str(r.customer_id)));
  return found.map(r => mapVehicleRow(r, names));
}

export async function fetchVehicleHistory(
  db: RedlineDb,
  scope: string[],
  vehicleId: string,
  today: string,
): Promise<VehicleHistory | null> {
  const vehicleRows = await rows(
    t(db, 'vehicles').select('*').in('shop_id', scope).eq('id', vehicleId).limit(1),
  );
  if (!vehicleRows.length) return null; // not this shop's vehicle — say nothing
  const names = await customerNamesFor(db, scope, [str(vehicleRows[0].customer_id)]);
  const vehicle = mapVehicleRow(vehicleRows[0], names);

  // Job cards, estimates, invoices and repair orders do NOT carry a
  // vehicle_id foreign key in this schema — each record stores the vehicle
  // as TEXT in its `vehicle` column (see mapJobRow / mapEstimateRow /
  // invoiceMath). History is therefore matched on that text: exact label
  // match first, plate containment as the fallback for label variants.
  const labelNorm = normalizeVehicleText(vehicleLabelOf(vehicleRows[0]));
  const plateNorm = normalizeVehicleText(str(vehicleRows[0].plate));
  const matchesVehicle = (r: Record<string, unknown>): boolean => {
    const v = normalizeVehicleText(str(r.vehicle));
    if (!v) return false;
    if (labelNorm && v === labelNorm) return true;
    if (plateNorm && v.includes(plateNorm)) return true;
    return false;
  };

  const [jobRows, estimateRows, invoiceRows, roRows] = await Promise.all([
    rows(t(db, 'job_cards').select('*').in('shop_id', scope)
      .order('created_at', { ascending: false }).limit(500)),
    rows(t(db, 'estimates').select('*').in('shop_id', scope)
      .order('created_at', { ascending: false }).limit(500)),
    rows(t(db, 'invoices').select('*').in('shop_id', scope)
      .order('created_at', { ascending: false }).limit(500)),
    rows(t(db, 'repair_orders').select('*').in('shop_id', scope)
      .order('created_at', { ascending: false }).limit(500))
      .catch(() => [] as Record<string, unknown>[]),
  ]);
  const jobRowsForVehicle = jobRows.filter(matchesVehicle);
  const estimateRowsForVehicle = estimateRows.filter(matchesVehicle);
  const invoiceRowsForVehicle = invoiceRows.filter(matchesVehicle);
  const roRowsForVehicle = roRows.filter(matchesVehicle);

  const events: HistoryEvent[] = [];
  const jobIds: string[] = [];
  for (const r of jobRowsForVehicle) {
    const job = mapJobRow(r, today);
    jobIds.push(job.id);
    events.push({
      date: str(r.created_at) || job.checkInDate,
      kind: 'job',
      reference: job.ro || job.id,
      summary: `Job${job.serviceType ? ` — ${job.serviceType}` : ''}${job.customerName ? ` for ${job.customerName}` : ''}`,
      status: job.status,
    });
  }
  for (const r of roRowsForVehicle) {
    events.push({
      date: str(r.created_at) || str(r.opened_date),
      kind: 'repair_order',
      reference: str(r.ro) || str(r.id),
      summary: `Repair order${str(r.concern) ? ` — ${str(r.concern)}` : ''}`,
      status: str(r.status),
    });
  }

  if (jobIds.length) {
    const inspections = await rows(
      t(db, 'inspections').select('*').in('shop_id', scope)
        .in('job_card_id', jobIds)
        .order('created_at', { ascending: false }).limit(100),
    ).catch(() => [] as Record<string, unknown>[]);
    for (const r of inspections) {
      events.push({
        date: str(r.created_at),
        kind: 'inspection',
        reference: str(r.inspection_number) || str(r.id),
        summary: 'Digital vehicle inspection',
        status: str(r.status),
      });
    }
  }

  const estimateNames = await customerNamesFor(db, scope, estimateRowsForVehicle.map(r => str(r.customer_id)));
  const estimates = estimateRowsForVehicle.map(r => mapEstimateRow(r, today, estimateNames));
  for (const e of estimates) {
    events.push({
      date: e.createdAt,
      kind: 'estimate',
      reference: e.number,
      summary: `Estimate ${e.number}`,
      status: e.status,
    });
  }
  for (const r of invoiceRowsForVehicle) {
    const inv = mapInvoiceRow(r);
    events.push({
      date: inv.createdAt,
      kind: 'invoice',
      reference: inv.invoiceNumber,
      summary: `Invoice ${inv.invoiceNumber}`,
      status: inv.status,
    });
  }

  events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return {
    vehicle,
    events,
    declinedEstimates: estimates.filter(e => normalizeStatus(e.status) === 'declined'),
  };
}

// ── Shop name (for draft sign-offs) ──────────────────────────────────────────

export async function fetchShopName(db: RedlineDb, shopId: string): Promise<string> {
  try {
    const found = await rows(t(db, 'shops').select('name').eq('id', shopId).limit(1));
    const name = str(found[0]?.name);
    if (name) return name;
  } catch { /* fall through */ }
  try {
    const found = await rows(
      t(db, 'shop_settings').select('company_name').eq('shop_id', shopId).limit(1),
    );
    return str(found[0]?.company_name);
  } catch {
    return '';
  }
}
