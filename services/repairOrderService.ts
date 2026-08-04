import { supabase } from '@/lib/supabase';
import { getShopId, getShopIds } from '@/lib/shopStore';
import { nextDocumentNumber } from './documentNumberService';

export interface RoPart {
  description: string;
  partNumber: string;
  qty: number;
  unitCost: number;
}

export interface WorkLine {
  description: string;
  type: 'Labor' | 'Parts' | 'Service' | 'Diagnostic' | 'Other';
  qty: number;
  rate: number;
}

export interface RepairOrder {
  id: string;
  roNumber: string;
  jobCardId: string;
  invoiceNumber: string;
  customerName: string;
  customerId: string;
  vehicle: string;
  status: string;
  concern: string;
  cause: string;
  correction: string;
  technician: string;
  laborHours: number;
  partsTotal: number;
  laborRate: number;
  notes: string;
  currency: string;
  openedDate: string;
  closedDate: string | null;
  createdAt: string;
  parts: RoPart[];
  workLines: WorkLine[];
  // Owner-only fields — never shown to technicians, advisors, or managers
  suggestedHours: number | null;
  flatRateCost: number | null;
  laborSource: string | null;
  laborLookupAt: string | null;
}

function mapRow(r: Record<string, unknown>): RepairOrder {
  return {
    id: r.id as string,
    roNumber: (r.ro_number as string) || '',
    jobCardId: (r.job_card_id as string) || '',
    invoiceNumber: (r.invoice_number as string) || '',
    customerName: (r.customer_name as string) || '',
    customerId: (r.customer_id as string) || '',
    vehicle: (r.vehicle as string) || '',
    status: (r.status as string) || 'Open',
    concern: (r.concern as string) || '',
    cause: (r.cause as string) || '',
    correction: (r.correction as string) || '',
    technician: (r.technician as string) || '',
    laborHours: Number(r.labor_hours ?? 0),
    partsTotal: Number(r.parts_total ?? 0),
    laborRate: Number(r.labor_rate ?? 145),
    notes: (r.notes as string) || '',
    currency: (r.currency as string) || 'USD',
    openedDate: (r.opened_date as string) || '',
    closedDate: (r.closed_date as string) || null,
    createdAt: (r.created_at as string) || '',
    parts: Array.isArray(r.parts) ? (r.parts as RoPart[]) : [],
    workLines: Array.isArray(r.work_lines) ? (r.work_lines as WorkLine[]) : [],
    suggestedHours: r.suggested_hours != null ? Number(r.suggested_hours) : null,
    flatRateCost: r.flat_rate_cost != null ? Number(r.flat_rate_cost) : null,
    laborSource: (r.labor_source as string) || null,
    laborLookupAt: (r.labor_lookup_at as string) || null,
  };
}

export function calcPartsTotal(parts: RoPart[]): number {
  return parts.reduce((s, p) => s + p.qty * p.unitCost, 0);
}

export function calcROTotal(ro: RepairOrder): number {
  const live = ro.parts && ro.parts.length > 0 ? calcPartsTotal(ro.parts) : ro.partsTotal;
  return ro.laborHours * ro.laborRate + live;
}

export async function fetchRepairOrders(): Promise<RepairOrder[]> {
  const { data, error } = await supabase
    .from('repair_orders')
    .select('*')
    .in('shop_id', getShopIds())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createRepairOrder(ro: Omit<RepairOrder, 'id' | 'createdAt'>): Promise<RepairOrder> {
  const { data, error } = await supabase
    .from('repair_orders')
    .insert({
      shop_id: getShopId(),
      ro_number: ro.roNumber,
      job_card_id: ro.jobCardId || null,
      invoice_number: ro.invoiceNumber || null,
      customer_name: ro.customerName,
      customer_id: ro.customerId || null,
      vehicle: ro.vehicle,
      status: ro.status,
      concern: ro.concern,
      cause: ro.cause,
      correction: ro.correction,
      technician: ro.technician,
      labor_hours: ro.laborHours,
      parts_total: ro.partsTotal,
      labor_rate: ro.laborRate,
      notes: ro.notes,
      currency: ro.currency,
      opened_date: ro.openedDate || new Date().toISOString(),
      closed_date: ro.closedDate || null,
      parts: ro.parts ?? [],
      work_lines: ro.workLines ?? [],
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function updateRepairOrder(id: string, updates: Partial<RepairOrder>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.jobCardId !== undefined) payload.job_card_id = updates.jobCardId || null;
  if (updates.invoiceNumber !== undefined) payload.invoice_number = updates.invoiceNumber || null;
  if (updates.customerName !== undefined) payload.customer_name = updates.customerName;
  if (updates.customerId !== undefined) payload.customer_id = updates.customerId || null;
  if (updates.vehicle !== undefined) payload.vehicle = updates.vehicle;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.concern !== undefined) payload.concern = updates.concern;
  if (updates.cause !== undefined) payload.cause = updates.cause;
  if (updates.correction !== undefined) payload.correction = updates.correction;
  if (updates.technician !== undefined) payload.technician = updates.technician;
  if (updates.laborHours !== undefined) payload.labor_hours = updates.laborHours;
  if (updates.partsTotal !== undefined) payload.parts_total = updates.partsTotal;
  if (updates.laborRate !== undefined) payload.labor_rate = updates.laborRate;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.currency !== undefined) payload.currency = updates.currency;
  if (updates.closedDate !== undefined) payload.closed_date = updates.closedDate || null;
  // Owner-only insight fields
  if (updates.suggestedHours !== undefined) payload.suggested_hours = updates.suggestedHours;
  if (updates.flatRateCost !== undefined) payload.flat_rate_cost = updates.flatRateCost;
  if (updates.laborSource !== undefined) payload.labor_source = updates.laborSource;
  if (updates.laborLookupAt !== undefined) payload.labor_lookup_at = updates.laborLookupAt;
  if (updates.parts !== undefined) payload.parts = updates.parts;
  if (updates.workLines !== undefined) payload.work_lines = updates.workLines;
  const { error } = await supabase.from('repair_orders').update(payload).eq('id', id).in('shop_id', getShopIds());
  if (error) throw error;
}

export async function closeRepairOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('repair_orders')
    .update({ status: 'Closed', closed_date: new Date().toISOString() })
    .eq('id', id)
    .in('shop_id', getShopIds());
  if (error) throw error;
}

export async function deleteRepairOrder(id: string): Promise<void> {
  const { error } = await supabase.from('repair_orders').delete().eq('id', id).in('shop_id', getShopIds());
  if (error) throw error;
}

export async function nextRONumber(): Promise<string> {
  return nextDocumentNumber('repair_order');
}

export const RO_STATUSES = ['Open', 'In Progress', 'Pending Parts', 'Pending Approval', 'Complete', 'Closed', 'Void'];
