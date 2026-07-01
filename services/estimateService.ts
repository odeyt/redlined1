import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';

export interface EstimateLine {
  note: string;
  description: string;
  laoDescription?: string;
  qty: number;
  rate: number;
  cost?: number;
  markup?: number;
  currency?: string;
}

export interface EstimateFull {
  id: string;
  estimateNumber: string;
  customerName: string;
  customerId: string;
  vehicle: string;
  jobCardId: string;
  status: string;
  lines: EstimateLine[];
  discount: number;
  shopSupplies: number;
  taxRate: number;
  notes: string;
  validUntil: string;
  approvedDate: string | null;
  currency: string;
  createdAt: string;
}

export interface EstimateTotals {
  subtotal: number;
  discount: number;
  shopSupplies: number;
  tax: number;
  total: number;
}

function mapRow(r: Record<string, unknown>): EstimateFull {
  return {
    id: r.id as string,
    estimateNumber: (r.estimate_number as string) || '',
    customerName: (r.customer_name as string) || '',
    customerId: (r.customer_id as string) || '',
    vehicle: (r.vehicle as string) || '',
    jobCardId: (r.job_card_id as string) || '',
    status: (r.status as string) || 'Draft',
    lines: (r.lines as EstimateLine[]) || [],
    discount: Number(r.discount ?? 0),
    shopSupplies: Number(r.shop_supplies ?? 0),
    taxRate: Number(r.tax_rate ?? 0.08),
    notes: (r.notes as string) || '',
    validUntil: (r.valid_until as string) || '',
    approvedDate: (r.approved_date as string) || null,
    currency: (r.currency as string) || 'USD',
    createdAt: (r.created_at as string) || '',
  };
}

export function calculateEstimateTotals(est: EstimateFull): EstimateTotals {
  const mainCur = est.currency || 'USD';
  const subtotal = est.lines
    .filter(l => !l.currency || l.currency === mainCur)
    .reduce((s, l) => s + l.qty * l.rate, 0);
  const afterDiscount = Math.max(subtotal - est.discount, 0);
  const taxable = afterDiscount + est.shopSupplies;
  const tax = taxable * est.taxRate;
  const total = taxable + tax;
  return { subtotal, discount: est.discount, shopSupplies: est.shopSupplies, tax, total };
}

export async function fetchEstimates(): Promise<EstimateFull[]> {
  const { data, error } = await supabase
    .from('estimates')
    .select('*')
    .eq('shop_id', getShopId())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createEstimate(est: Omit<EstimateFull, 'id' | 'createdAt'>): Promise<EstimateFull> {
  const { data, error } = await supabase
    .from('estimates')
    .insert({
      shop_id: getShopId(),
      estimate_number: est.estimateNumber,
      customer_name: est.customerName,
      customer_id: est.customerId || null,
      vehicle: est.vehicle,
      job_card_id: est.jobCardId || null,
      status: est.status,
      lines: est.lines,
      discount: est.discount,
      shop_supplies: est.shopSupplies,
      tax_rate: est.taxRate,
      notes: est.notes,
      valid_until: est.validUntil || null,
      currency: est.currency || 'USD',
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function updateEstimate(id: string, updates: Partial<EstimateFull>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.customerName !== undefined) payload.customer_name = updates.customerName;
  if (updates.customerId !== undefined) payload.customer_id = updates.customerId || null;
  if (updates.vehicle !== undefined) payload.vehicle = updates.vehicle;
  if (updates.jobCardId !== undefined) payload.job_card_id = updates.jobCardId || null;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.lines !== undefined) payload.lines = updates.lines;
  if (updates.discount !== undefined) payload.discount = updates.discount;
  if (updates.shopSupplies !== undefined) payload.shop_supplies = updates.shopSupplies;
  if (updates.taxRate !== undefined) payload.tax_rate = updates.taxRate;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.validUntil !== undefined) payload.valid_until = updates.validUntil || null;
  if (updates.approvedDate !== undefined) payload.approved_date = updates.approvedDate || null;
  if (updates.currency !== undefined) payload.currency = updates.currency;
  const { error } = await supabase.from('estimates').update(payload).eq('id', id).eq('shop_id', getShopId());
  if (error) throw error;
}

export async function approveEstimate(id: string): Promise<void> {
  const { error } = await supabase
    .from('estimates')
    .update({ status: 'Approved', approved_date: new Date().toISOString() })
    .eq('id', id)
    .eq('shop_id', getShopId());
  if (error) throw error;
}

export async function deleteEstimate(id: string): Promise<void> {
  const { error } = await supabase.from('estimates').delete().eq('id', id).eq('shop_id', getShopId());
  if (error) throw error;
}

export async function nextEstimateNumber(): Promise<string> {
  const { count } = await supabase
    .from('estimates')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', getShopId());
  const n = (count ?? 0) + 1;
  return `EST-${String(n).padStart(4, '0')}`;
}
