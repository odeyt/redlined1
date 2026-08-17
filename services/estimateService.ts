import { supabase } from '@/lib/supabase';
import { recordAudit } from '@/lib/domain/auditFromBrowser';
import { AUDIT } from '@/lib/domain/audit';
import { getShopId, getShopIds } from '@/lib/shopStore';
import { nextDocumentNumber } from './documentNumberService';

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
    taxRate: Number(r.tax_rate ?? 0),
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
  // shopSupplies removed from UI — exclude from calculation regardless of DB value
  const tax = afterDiscount * est.taxRate;
  const total = afterDiscount + tax;
  return { subtotal, discount: est.discount, shopSupplies: 0, tax, total };
}

export async function fetchEstimates(): Promise<EstimateFull[]> {
  const { data, error } = await supabase
    .from('estimates')
    .select('*')
    .in('shop_id', getShopIds())
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

  await recordAudit({
    action: AUDIT.estimateCreated,
    entityType: 'estimate',
    entityId: data.id as string,
    after: {
      number: data.estimate_number, customer: data.customer_name,
      vehicle: data.vehicle, status: data.status,
      lines: data.lines, discount: data.discount, currency: data.currency,
    },
  });
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
  const { error } = await supabase.from('estimates').update(payload).eq('id', id).in('shop_id', getShopIds());
  if (error) throw error;

  await recordAudit({
    action: AUDIT.estimateUpdated,
    entityType: 'estimate',
    entityId: id,
    after: payload,
  });
}

export async function approveEstimate(id: string): Promise<void> {
  const { error } = await supabase
    .from('estimates')
    .update({ status: 'Approved', approved_date: new Date().toISOString() })
    .eq('id', id)
    .in('shop_id', getShopIds());
  if (error) throw error;
  // Non-blocking intelligence hook — fire-and-forget, never throws
  try {
    const { publishEvent } = await import('@/intelligence/IntelligenceService');
    publishEvent('EstimateApproved', getShopId(), '', 'estimate', id);
  } catch { /* intelligence must never affect production */ }
  // Non-blocking Sapelee Event Bus hook — fire-and-forget, never throws
  try {
    const { publishSapeleeEvent } = await import('@/lib/sapelee/publish');
    publishSapeleeEvent(supabase, {
      eventType: 'estimate.accepted',
      payload: { estimateId: id },
      shopId: getShopId(),
      aggregateType: 'estimate',
      aggregateId: id,
    });
  } catch { /* sapelee integration must never affect production */ }

  // Approval is its own event, not a generic update: it is the moment the
  // customer agreed to the work, and that is what a dispute asks about.
  await recordAudit({
    action: AUDIT.estimateApproved,
    entityType: 'estimate',
    entityId: id,
    after: { status: 'Approved' },
  });
}

export async function deleteEstimate(id: string): Promise<void> {
  const { data: before } = await supabase
    .from('estimates').select('*').eq('id', id).in('shop_id', getShopIds()).maybeSingle();

  const { error } = await supabase.from('estimates').delete().eq('id', id).in('shop_id', getShopIds());
  if (error) throw error;

  await recordAudit({
    action: AUDIT.estimateDeleted,
    entityType: 'estimate',
    entityId: id,
    before: before ? {
      number: before.estimate_number, customer: before.customer_name,
      status: before.status, lines: before.lines, currency: before.currency,
    } : null,
  });
}

export async function nextEstimateNumber(): Promise<string> {
  return nextDocumentNumber('estimate');
}

export async function cloneEstimate(est: EstimateFull): Promise<EstimateFull> {
  const newNumber = await nextEstimateNumber();
  const clonedNotes = est.notes
    ? `[Cloned from ${est.estimateNumber}]\n${est.notes}`
    : `[Cloned from ${est.estimateNumber}]`;
  return createEstimate({
    estimateNumber: newNumber,
    customerName: est.customerName,
    customerId: est.customerId,
    vehicle: est.vehicle,
    jobCardId: est.jobCardId,
    status: 'Draft',
    lines: est.lines,
    discount: est.discount,
    shopSupplies: est.shopSupplies,
    taxRate: est.taxRate,
    notes: clonedNotes,
    validUntil: '',
    approvedDate: null,
    currency: est.currency,
  });
}
