import { supabase } from '@/lib/supabase';
import { recordAudit } from '@/lib/domain/auditFromBrowser';
import { AUDIT } from '@/lib/domain/audit';
import { getShopId, getShopIds } from '@/lib/shopStore';
import { deriveRecordCurrency } from '@/lib/recordCurrency';

export interface PartsVendor {
  id: string;
  name: string;
  phone: string;
  email: string;
  website: string;
  notes: string;
}

export interface LineItem {
  partName: string;
  partNumber: string;
  condition: string;
  quantity: number;
  unitCost: number;
  vendorName?: string;
  currency?: string | null;
  /**
   * What the quantity counts — "4 Qt" of oil is not "4 Pcs".
   *
   * Optional, and it rides inside the `line_items` JSONB rather than needing a
   * column: the whole item object is written and read back verbatim, so an
   * older row simply has no `unit` and reads as the default. No migration, and
   * nothing to backfill.
   */
  unit?: string;
}

/**
 * Units a workshop actually sells in.
 *
 * Pcs first because it is the overwhelming majority and the default. The
 * volume units exist because oil, coolant and brake fluid are quoted by the
 * quart or litre, and a line reading "4" with no unit is ambiguous between
 * four bottles and four litres — a real pricing difference.
 */
export const PART_UNITS = [
  'Pcs', 'Set', 'Pair', 'Kit',
  'Qt', 'L', 'ml', 'Gal',
  'kg', 'g', 'lb',
  'm', 'ft',
  'Box', 'Roll', 'Can', 'Bottle', 'Tube',
] as const;

export const DEFAULT_PART_UNIT = 'Pcs';

/**
 * A quantity as a customer should read it: "4 Qt", "2 Pair", and plain "4"
 * for pieces.
 *
 * The default is SUPPRESSED, and that is the whole point. Printing "4 Pcs" on
 * every brake pad restates what a quantity already means, and a unit that
 * appears on every line stops being read — which is exactly when the "Qt" on
 * the oil line gets missed. It also means the thousands of existing lines that
 * predate units keep displaying precisely as they did.
 *
 * Not pluralised. "2 Pcs" and "2 Set" are how a parts counter writes it, and
 * pluralising would need a rule per unit ("2 Boxes" but never "2 Ls").
 */
export function formatQty(quantity: number, unit?: string): string {
  // A line_items row written before quantity existed parses to undefined, and
  // `${undefined}` renders the literal word "undefined" on a customer's quote.
  const q = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const u = (unit || '').trim() || DEFAULT_PART_UNIT;
  return u === DEFAULT_PART_UNIT ? String(q) : `${q} ${u}`;
}

/**
 * The description to carry onto an estimate or invoice line.
 *
 * Those lines have a `qty` and NO unit column, so a parts order for "4 Qt" of
 * oil would print as a bare "4" and read as four bottles — a four-fold pricing
 * difference on a consumable. The unit rides in the description instead.
 *
 * Suppressed for Pcs: appending "(Pcs)" to every brake pad is noise, and the
 * whole point is that a unit worth stating stands out.
 */
export function describeLine(partName: string, unit?: string): string {
  const u = (unit || '').trim() || DEFAULT_PART_UNIT;
  const name = (partName || '').trim();
  if (u === DEFAULT_PART_UNIT) return name;
  const suffix = `(${u})`;
  // Idempotent. A quotation converts to an order and that order converts on to
  // an estimate; if either end ever reads back a description that already
  // carries the unit, appending again would give "Oil (Qt) (Qt)" and every
  // further pass would add another. Cheap to prevent, ugly on a customer's
  // document, and invisible until someone converts twice.
  return name.endsWith(suffix) ? name : `${name} ${suffix}`.trim();
}

export interface PartsOrder {
  id: string;
  partName: string;
  partNumber: string;
  quantity: number;
  condition: string;
  lineItems: LineItem[];
  vendorName: string;
  vendorPhone: string;
  vendorEmail: string;
  unitCost: number;
  totalCost: number;
  coreCharge: number;
  depositPaid: number;
  balanceDue: number;
  status: string;
  paymentStatus: string;
  orderDate: string;
  etr: string;
  receivedDate: string;
  jobCardNumber: string;
  repairOrderNumber: string;
  estimateNumber: string;
  invoiceNumber: string;
  vehicle: string;
  customerName: string;
  warranty: string;
  notes: string;
  currency: string;
  createdAt: string;
}

export const ORDER_STATUSES = ['Quote', 'Ordered', 'Deposit Paid', 'Backordered', 'Waiting Customer', 'Pending Customer', 'Received', 'Returned', 'Cancelled'];
export const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid in Full'];
export const PART_CONDITIONS = ['New', 'Genuine', 'OEM', 'Aftermarket', 'Remanufactured', 'Used', 'Refurbished'];

function mapOrder(r: Record<string, unknown>): PartsOrder {
  const unitCost  = Number(r.unit_cost  ?? 0);
  const quantity  = Number(r.quantity   ?? 1);
  const deposit   = Number(r.deposit_paid ?? 0);
  const core      = Number(r.core_charge ?? 0);
  const total     = Number(r.total_cost ?? unitCost * quantity);

  // Parse line_items JSONB; fall back to single legacy item if empty
  let lineItems: LineItem[] = [];
  try {
    const raw = r.line_items as LineItem[] | string | null;
    const parsed: LineItem[] = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? []);
    if (Array.isArray(parsed) && parsed.length > 0) {
      lineItems = parsed;
    }
  } catch { /* ignore parse errors */ }

  if (lineItems.length === 0) {
    lineItems = [{
      partName:   (r.part_name as string)   || '',
      partNumber: (r.part_number as string) || '',
      condition:  (r.condition as string)   || 'New',
      quantity,
      unitCost,
    }];
  }

  return {
    id:                 r.id as string,
    partName:           (r.part_name as string)        || '',
    partNumber:         (r.part_number as string)      || '',
    quantity,
    condition:          (r.condition as string)        || 'New',
    lineItems,
    vendorName:         (r.vendor_name as string)      || '',
    vendorPhone:        (r.vendor_phone as string)     || '',
    vendorEmail:        (r.vendor_email as string)     || '',
    unitCost,
    totalCost:          total,
    coreCharge:         core,
    depositPaid:        deposit,
    balanceDue:         Number(r.balance_due ?? Math.max(0, total + core - deposit)),
    status:             (r.status as string)           || 'Quote',
    paymentStatus:      (r.payment_status as string)   || 'Unpaid',
    orderDate:          (r.order_date as string)       || '',
    etr:                (r.etr as string)              || '',
    receivedDate:       (r.received_date as string)    || '',
    jobCardNumber:      (r.job_card_number as string)  || '',
    repairOrderNumber:  (r.repair_order_number as string) || '',
    estimateNumber:     (r.estimate_number as string)  || '',
    invoiceNumber:      (r.invoice_number as string)   || '',
    vehicle:            (r.vehicle as string)          || '',
    customerName:       (r.customer_name as string)    || '',
    warranty:           (r.warranty as string)         || '',
    notes:              (r.notes as string)            || '',
    currency:           (r.currency as string)         || 'USD',
    createdAt:          (r.created_at as string)       || '',
  };
}

function buildOrderPayload(o: Omit<PartsOrder, 'id' | 'createdAt'>) {
  const items = o.lineItems && o.lineItems.length > 0 ? o.lineItems : [{
    partName: o.partName, partNumber: o.partNumber,
    condition: o.condition, quantity: o.quantity, unitCost: o.unitCost,
  }];
  const total = items.reduce((s, i) => s + i.unitCost * i.quantity, 0);
  const balance = Math.max(0, total + o.coreCharge - o.depositPaid);
  const firstItem = items[0];
  const partNameSummary = items.length === 1
    ? firstItem.partName
    : items.map(i => i.partName).filter(Boolean).join(', ');
  return {
    line_items: items,
    part_name: partNameSummary,
    part_number: firstItem.partNumber,
    quantity: items.reduce((s, i) => s + i.quantity, 0),
    condition: firstItem.condition,
    unit_cost: items.length === 1 ? firstItem.unitCost : 0,
    total_cost: total,
    core_charge: o.coreCharge,
    deposit_paid: o.depositPaid,
    balance_due: balance,
    vendor_name: o.vendorName, vendor_phone: o.vendorPhone, vendor_email: o.vendorEmail,
    status: o.status, payment_status: o.paymentStatus,
    order_date: o.orderDate || null, etr: o.etr || null, received_date: o.receivedDate || null,
    job_card_number: o.jobCardNumber, repair_order_number: o.repairOrderNumber,
    estimate_number: o.estimateNumber, invoice_number: o.invoiceNumber,
    vehicle: o.vehicle, customer_name: o.customerName,
    warranty: o.warranty, notes: o.notes,
    // See lib/recordCurrency: orders had the same drift as quotations,
    // recording THB while every line was priced in USD.
    currency: deriveRecordCurrency(items, o.currency),
  };
}

function mapVendor(r: Record<string, unknown>): PartsVendor {
  return {
    id:      r.id as string,
    name:    (r.name as string)    || '',
    phone:   (r.phone as string)   || '',
    email:   (r.email as string)   || '',
    website: (r.website as string) || '',
    notes:   (r.notes as string)   || '',
  };
}

/* ── Vendors ── */

export async function fetchVendors(): Promise<PartsVendor[]> {
  const { data, error } = await supabase
    .from('parts_vendors')
    .select('*')
    .in('shop_id', getShopIds())
    .order('name');
  if (error) throw error;
  return (data ?? []).map(mapVendor);
}

export async function fetchVendorsAll(): Promise<PartsVendor[]> {
  const { data, error } = await supabase
    .from('parts_vendors')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data ?? []).map(mapVendor);
}

export async function createVendor(v: Omit<PartsVendor, 'id'>): Promise<PartsVendor> {
  const { data, error } = await supabase
    .from('parts_vendors')
    .insert({ shop_id: getShopId(), name: v.name, phone: v.phone, email: v.email, website: v.website, notes: v.notes })
    .select().single();
  if (error) throw error;

  await recordAudit({
    action: AUDIT.vendorCreated,
    entityType: 'vendor',
    entityId: data.id as string,
    after: { name: data.name, phone: data.phone, email: data.email, website: data.website },
  });
  return mapVendor(data);
}

export async function updateVendor(id: string, v: Omit<PartsVendor, 'id'>): Promise<PartsVendor> {
  const { data, error } = await supabase
    .from('parts_vendors')
    .update({ name: v.name, phone: v.phone, email: v.email, website: v.website, notes: v.notes })
    .eq('id', id)
    .in('shop_id', getShopIds())
    .select().single();
  if (error) throw error;

  await recordAudit({
    action: AUDIT.vendorUpdated,
    entityType: 'vendor',
    entityId: id,
    after: { name: data.name, phone: data.phone, email: data.email, website: data.website },
  });
  return mapVendor(data);
}

export async function deleteVendor(id: string): Promise<void> {
  const { data: before } = await supabase
    .from('parts_vendors').select('*').eq('id', id).in('shop_id', getShopIds()).maybeSingle();

  const { error } = await supabase
    .from('parts_vendors')
    .delete()
    .eq('id', id)
    .in('shop_id', getShopIds());
  if (error) throw error;

  await recordAudit({
    action: AUDIT.vendorDeleted,
    entityType: 'vendor',
    entityId: id,
    before: before ? {
      name: before.name, phone: before.phone, email: before.email, website: before.website,
    } : null,
  });
}

/* ── Parts Orders ── */

export async function fetchPartsOrders(): Promise<PartsOrder[]> {
  const sid = getShopId();
  // shop_id is UUID NOT NULL — only filter by current shop (no legacy null/empty rows possible)
  const { data, error } = await supabase
    .from('parts_orders')
    .select('*')
    .eq('shop_id', sid)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapOrder);
}

export async function createPartsOrder(o: Omit<PartsOrder, 'id' | 'createdAt'>): Promise<PartsOrder> {
  const { data, error } = await supabase
    .from('parts_orders')
    .insert({ shop_id: getShopId(), ...buildOrderPayload(o) })
    .select().single();
  if (error) throw error;

  // A parts order is money committed to a supplier, so it is audited like the
  // other money documents rather than like inventory bookkeeping.
  await recordAudit({
    action: AUDIT.partsOrderCreated,
    entityType: 'parts_order',
    entityId: data.id as string,
    after: {
      vendor: data.vendor_name, status: data.status, total: data.total_cost,
      currency: data.currency, jobCardNumber: data.job_card_number,
    },
  });
  return mapOrder(data);
}

export async function updatePartsOrder(id: string, o: Partial<Omit<PartsOrder, 'id' | 'createdAt'>>): Promise<PartsOrder> {
  const { data, error } = await supabase
    .from('parts_orders')
    .update(buildOrderPayload(o as Omit<PartsOrder, 'id' | 'createdAt'>))
    .eq('id', id).in('shop_id', getShopIds())
    .select().single();
  if (error) throw error;

  await recordAudit({
    action: AUDIT.partsOrderUpdated,
    entityType: 'parts_order',
    entityId: id,
    after: {
      vendor: data.vendor_name, status: data.status, total: data.total_cost,
      currency: data.currency, jobCardNumber: data.job_card_number,
    },
  });
  return mapOrder(data);
}

export async function deletePartsOrder(id: string): Promise<void> {
  const { data: before } = await supabase
    .from('parts_orders').select('*').eq('id', id).in('shop_id', getShopIds()).maybeSingle();

  const { error } = await supabase.from('parts_orders').delete().eq('id', id).in('shop_id', getShopIds());
  if (error) throw error;

  await recordAudit({
    action: AUDIT.partsOrderDeleted,
    entityType: 'parts_order',
    entityId: id,
    before: before ? {
      vendor: before.vendor_name, status: before.status, total: before.total_cost,
      currency: before.currency, jobCardNumber: before.job_card_number,
    } : null,
  });
}
