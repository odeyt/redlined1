import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';

export interface PartsVendor {
  id: string;
  name: string;
  phone: string;
  email: string;
  website: string;
  notes: string;
}

export interface PartsOrder {
  id: string;
  partName: string;
  partNumber: string;
  quantity: number;
  condition: string;
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
  createdAt: string;
}

export const ORDER_STATUSES = ['Ordered', 'Deposit Paid', 'Backordered', 'Received', 'Returned', 'Cancelled'];
export const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid in Full'];
export const PART_CONDITIONS = ['New', 'OEM', 'Aftermarket', 'Remanufactured', 'Used'];

function mapOrder(r: Record<string, unknown>): PartsOrder {
  const unitCost  = Number(r.unit_cost  ?? 0);
  const quantity  = Number(r.quantity   ?? 1);
  const deposit   = Number(r.deposit_paid ?? 0);
  const core      = Number(r.core_charge ?? 0);
  const total     = Number(r.total_cost ?? unitCost * quantity);
  return {
    id:                 r.id as string,
    partName:           (r.part_name as string)        || '',
    partNumber:         (r.part_number as string)      || '',
    quantity,
    condition:          (r.condition as string)        || 'New',
    vendorName:         (r.vendor_name as string)      || '',
    vendorPhone:        (r.vendor_phone as string)     || '',
    vendorEmail:        (r.vendor_email as string)     || '',
    unitCost,
    totalCost:          total,
    coreCharge:         core,
    depositPaid:        deposit,
    balanceDue:         Number(r.balance_due ?? Math.max(0, total + core - deposit)),
    status:             (r.status as string)           || 'Ordered',
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
    createdAt:          (r.created_at as string)       || '',
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
    .eq('shop_id', getShopId())
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

/* ── Parts Orders ── */

export async function fetchPartsOrders(): Promise<PartsOrder[]> {
  const { data, error } = await supabase
    .from('parts_orders')
    .select('*')
    .eq('shop_id', getShopId())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapOrder);
}

export async function createPartsOrder(o: Omit<PartsOrder, 'id' | 'createdAt'>): Promise<PartsOrder> {
  const total = o.unitCost * o.quantity;
  const balance = Math.max(0, total + o.coreCharge - o.depositPaid);
  const { data, error } = await supabase
    .from('parts_orders')
    .insert({
      shop_id: getShopId(),
      part_name: o.partName, part_number: o.partNumber, quantity: o.quantity, condition: o.condition,
      vendor_name: o.vendorName, vendor_phone: o.vendorPhone, vendor_email: o.vendorEmail,
      unit_cost: o.unitCost, total_cost: total, core_charge: o.coreCharge,
      deposit_paid: o.depositPaid, balance_due: balance,
      status: o.status, payment_status: o.paymentStatus,
      order_date: o.orderDate || null, etr: o.etr || null, received_date: o.receivedDate || null,
      job_card_number: o.jobCardNumber, repair_order_number: o.repairOrderNumber,
      estimate_number: o.estimateNumber, invoice_number: o.invoiceNumber,
      vehicle: o.vehicle, customer_name: o.customerName,
      warranty: o.warranty, notes: o.notes,
    })
    .select().single();
  if (error) throw error;
  return mapOrder(data);
}

export async function updatePartsOrder(id: string, o: Partial<Omit<PartsOrder, 'id' | 'createdAt'>>): Promise<PartsOrder> {
  const unitCost = o.unitCost ?? 0;
  const qty      = o.quantity ?? 1;
  const total    = unitCost * qty;
  const balance  = Math.max(0, total + (o.coreCharge ?? 0) - (o.depositPaid ?? 0));
  const { data, error } = await supabase
    .from('parts_orders')
    .update({
      part_name: o.partName, part_number: o.partNumber, quantity: o.quantity, condition: o.condition,
      vendor_name: o.vendorName, vendor_phone: o.vendorPhone, vendor_email: o.vendorEmail,
      unit_cost: o.unitCost, total_cost: total, core_charge: o.coreCharge,
      deposit_paid: o.depositPaid, balance_due: balance,
      status: o.status, payment_status: o.paymentStatus,
      order_date: o.orderDate || null, etr: o.etr || null, received_date: o.receivedDate || null,
      job_card_number: o.jobCardNumber, repair_order_number: o.repairOrderNumber,
      estimate_number: o.estimateNumber, invoice_number: o.invoiceNumber,
      vehicle: o.vehicle, customer_name: o.customerName,
      warranty: o.warranty, notes: o.notes,
    })
    .eq('id', id).eq('shop_id', getShopId())
    .select().single();
  if (error) throw error;
  return mapOrder(data);
}

export async function deletePartsOrder(id: string): Promise<void> {
  const { error } = await supabase.from('parts_orders').delete().eq('id', id).eq('shop_id', getShopId());
  if (error) throw error;
}
