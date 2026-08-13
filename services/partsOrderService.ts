import { supabase } from '@/lib/supabase';
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
  return mapVendor(data);
}

export async function deleteVendor(id: string): Promise<void> {
  const { error } = await supabase
    .from('parts_vendors')
    .delete()
    .eq('id', id)
    .in('shop_id', getShopIds());
  if (error) throw error;
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
  return mapOrder(data);
}

export async function updatePartsOrder(id: string, o: Partial<Omit<PartsOrder, 'id' | 'createdAt'>>): Promise<PartsOrder> {
  const { data, error } = await supabase
    .from('parts_orders')
    .update(buildOrderPayload(o as Omit<PartsOrder, 'id' | 'createdAt'>))
    .eq('id', id).in('shop_id', getShopIds())
    .select().single();
  if (error) throw error;
  return mapOrder(data);
}

export async function deletePartsOrder(id: string): Promise<void> {
  const { error } = await supabase.from('parts_orders').delete().eq('id', id).in('shop_id', getShopIds());
  if (error) throw error;
}
