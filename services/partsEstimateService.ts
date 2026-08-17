import { supabase } from '@/lib/supabase';
import { recordAudit } from '@/lib/domain/auditFromBrowser';
import { AUDIT } from '@/lib/domain/audit';
import { getShopId, getShopIds } from '@/lib/shopStore';
import { deriveRecordCurrency } from '@/lib/recordCurrency';

export interface PartsEstimate {
  id: string;
  partName: string;
  partNumber: string;
  quantity: number;
  condition: string;
  lineItems: EstimateLineItem[];
  vendorName: string;
  vendorPhone: string;
  vendorEmail: string;
  unitCost: number;
  totalCost: number;
  coreCharge: number;
  /** Amount paid up front on the quote; carried into the order on convert. */
  deposit: number;
  /** Currency the deposit was handed over in. */
  depositCurrency: string;
  status: string;
  quoteDate: string;
  validUntil: string;
  jobCardNumber: string;
  repairOrderNumber: string;
  vehicle: string;
  customerName: string;
  notes: string;
  currency: string;
  createdAt: string;
}

export interface EstimateLineItem {
  partName: string;
  partNumber: string;
  condition: string;
  quantity: number;
  unitCost: number;
  vendorName?: string;
  currency?: string;
}

export const ESTIMATE_STATUSES = ['Draft', 'Quoted', 'Pending Customer', 'Approved', 'Declined', 'Expired', 'Converted'];
export const PART_CONDITIONS = ['New', 'Genuine', 'OEM', 'Aftermarket', 'Remanufactured', 'Used', 'Refurbished'];

function mapEstimate(r: Record<string, unknown>): PartsEstimate {
  const unitCost = Number(r.unit_cost ?? 0);
  const quantity = Number(r.quantity ?? 1);
  const core     = Number(r.core_charge ?? 0);
  const total    = Number(r.total_cost ?? unitCost * quantity);

  let lineItems: EstimateLineItem[] = [];
  try {
    const raw = r.line_items as EstimateLineItem[] | string | null;
    const parsed: EstimateLineItem[] = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? []);
    if (Array.isArray(parsed) && parsed.length > 0) {
      lineItems = parsed.map(item => ({
        ...item,
        quantity: Number(item.quantity) || 1,
        unitCost: Number(item.unitCost) || 0,
      }));
    }
  } catch { /* ignore */ }

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
    deposit:            Number(r.deposit ?? 0),
    depositCurrency:    (r.deposit_currency as string) || (r.currency as string) || 'USD',
    status:             (r.status as string)           || 'Draft',
    quoteDate:          (r.quote_date as string)       || '',
    validUntil:         (r.valid_until as string)      || '',
    jobCardNumber:      (r.job_card_number as string)  || '',
    repairOrderNumber:  (r.repair_order_number as string) || '',
    vehicle:            (r.vehicle as string)          || '',
    customerName:       (r.customer_name as string)    || '',
    notes:              (r.notes as string)            || '',
    currency:           (r.currency as string)         || 'USD',
    createdAt:          (r.created_at as string)       || '',
  };
}

function buildPayload(o: Omit<PartsEstimate, 'id' | 'createdAt'>) {
  const items = o.lineItems && o.lineItems.length > 0 ? o.lineItems : [{
    partName: o.partName, partNumber: o.partNumber,
    condition: o.condition, quantity: o.quantity, unitCost: o.unitCost,
  }];
  const total = items.reduce((s, i) => s + i.unitCost * i.quantity, 0);
  const firstItem = items[0];
  const partNameSummary = items.length === 1
    ? firstItem.partName
    : items.map(i => i.partName).filter(Boolean).join(', ');
  return {
    line_items:           items,
    part_name:            partNameSummary,
    part_number:          firstItem.partNumber,
    quantity:             items.reduce((s, i) => s + i.quantity, 0),
    condition:            firstItem.condition,
    unit_cost:            items.length === 1 ? firstItem.unitCost : 0,
    total_cost:           total,
    core_charge:          o.coreCharge,
    deposit:              o.deposit ?? 0,
    deposit_currency:     o.depositCurrency || o.currency,
    vendor_name:          o.vendorName,
    vendor_phone:         o.vendorPhone,
    vendor_email:         o.vendorEmail,
    status:               o.status,
    quote_date:           o.quoteDate || null,
    valid_until:          o.validUntil || null,
    job_card_number:      o.jobCardNumber,
    repair_order_number:  o.repairOrderNumber,
    vehicle:              o.vehicle,
    customer_name:        o.customerName,
    notes:                o.notes,
    // Follows the lines when they all name one currency — the record used to
    // keep whatever the form defaulted to, so a LAK quote could be stored as
    // THB. See lib/recordCurrency.
    currency:             deriveRecordCurrency(items, o.currency),
  };
}

export async function fetchPartsEstimates(): Promise<PartsEstimate[]> {
  const { data, error } = await supabase
    .from('parts_estimates')
    .select('*')
    .in('shop_id', getShopIds())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapEstimate);
}

export async function createPartsEstimate(o: Omit<PartsEstimate, 'id' | 'createdAt'>): Promise<PartsEstimate> {
  const { data, error } = await supabase
    .from('parts_estimates')
    .insert({ shop_id: getShopId(), ...buildPayload(o) })
    .select().single();
  if (error) throw error;

  await recordAudit({
    action: AUDIT.partsEstimateCreated,
    entityType: 'parts_estimate',
    entityId: data.id as string,
    after: {
      vendor: data.vendor_name, status: data.status, totalCost: data.total_cost,
      deposit: data.deposit, currency: data.currency,
      jobCardNumber: data.job_card_number, customer: data.customer_name,
    },
  });
  return mapEstimate(data);
}

export async function updatePartsEstimate(id: string, o: Partial<Omit<PartsEstimate, 'id' | 'createdAt'>>): Promise<PartsEstimate> {
  // If all required fields are present, do a full update via buildPayload.
  // If only a subset (e.g. status + notes), build a partial column map to avoid
  // writing undefined values that violate NOT NULL constraints.
  const isFullUpdate = o.lineItems !== undefined || o.quantity !== undefined;
  const payload = isFullUpdate
    ? buildPayload(o as Omit<PartsEstimate, 'id' | 'createdAt'>)
    : buildPartialPayload(o);

  const { data, error } = await supabase
    .from('parts_estimates')
    .update(payload)
    .eq('id', id).in('shop_id', getShopIds())
    .select().single();
  if (error) throw error;

  await recordAudit({
    action: AUDIT.partsEstimateUpdated,
    entityType: 'parts_estimate',
    entityId: id,
    after: {
      vendor: data.vendor_name, status: data.status, totalCost: data.total_cost,
      deposit: data.deposit, currency: data.currency,
      jobCardNumber: data.job_card_number, customer: data.customer_name,
    },
  });
  return mapEstimate(data);
}

function buildPartialPayload(o: Partial<Omit<PartsEstimate, 'id' | 'createdAt'>>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (o.status        !== undefined) p.status             = o.status;
  if (o.notes         !== undefined) p.notes              = o.notes;
  if (o.partName      !== undefined) p.part_name          = o.partName;
  if (o.partNumber    !== undefined) p.part_number        = o.partNumber;
  if (o.condition     !== undefined) p.condition          = o.condition;
  if (o.quantity      !== undefined) p.quantity           = o.quantity;
  if (o.unitCost      !== undefined) p.unit_cost          = o.unitCost;
  if (o.totalCost     !== undefined) p.total_cost         = o.totalCost;
  if (o.coreCharge    !== undefined) p.core_charge        = o.coreCharge;
  if (o.deposit       !== undefined) p.deposit            = o.deposit;
  if (o.depositCurrency !== undefined) p.deposit_currency   = o.depositCurrency;
  if (o.vendorName    !== undefined) p.vendor_name        = o.vendorName;
  if (o.vendorPhone   !== undefined) p.vendor_phone       = o.vendorPhone;
  if (o.vendorEmail   !== undefined) p.vendor_email       = o.vendorEmail;
  if (o.quoteDate     !== undefined) p.quote_date         = o.quoteDate || null;
  if (o.validUntil    !== undefined) p.valid_until        = o.validUntil || null;
  if (o.jobCardNumber !== undefined) p.job_card_number    = o.jobCardNumber;
  if (o.repairOrderNumber !== undefined) p.repair_order_number = o.repairOrderNumber;
  if (o.vehicle       !== undefined) p.vehicle            = o.vehicle;
  if (o.customerName  !== undefined) p.customer_name      = o.customerName;
  if (o.currency      !== undefined) p.currency           = o.currency;
  if (o.lineItems     !== undefined) p.line_items         = o.lineItems;
  return p;
}

export async function deletePartsEstimate(id: string): Promise<void> {
  const { data: before } = await supabase
    .from('parts_estimates').select('*').eq('id', id).in('shop_id', getShopIds()).maybeSingle();

  const { error } = await supabase
    .from('parts_estimates')
    .delete()
    .eq('id', id)
    .in('shop_id', getShopIds());
  if (error) throw error;

  await recordAudit({
    action: AUDIT.partsEstimateDeleted,
    entityType: 'parts_estimate',
    entityId: id,
    before: before ? {
      vendor: before.vendor_name, status: before.status, totalCost: before.total_cost,
      deposit: before.deposit, currency: before.currency,
      jobCardNumber: before.job_card_number, customer: before.customer_name,
    } : null,
  });
}
