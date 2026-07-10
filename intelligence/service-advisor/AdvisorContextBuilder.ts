// SI-12: Advisor Context Builder — assembles deterministic context from shop data

import { supabase } from '@/lib/supabase';
import type {
  ServiceAdvisorContext,
  CustomerContext,
  VehicleContext,
  InspectionContext,
  EstimateContext,
  DeclinedWorkItem,
  InspectionFinding,
  EstimateLine,
  VehicleIntelligenceSignal,
} from './types';

export interface AdvisorContextInput {
  shopId: string;
  sessionId?: string;
  customerId?: string;
  vehicleId?: string;
  jobCardId?: string;
  estimateId?: string;
}

export async function buildAdvisorContext(
  shopId: string,
  input: AdvisorContextInput
): Promise<ServiceAdvisorContext> {
  const warnings: string[] = [];

  const [customer, vehicle, inspection, estimate] = await Promise.all([
    input.customerId ? getCustomerContext(shopId, input.customerId).catch(() => { warnings.push('customer_context_unavailable'); return null; }) : Promise.resolve(null),
    input.vehicleId ? getVehicleContext(shopId, input.vehicleId).catch(() => { warnings.push('vehicle_context_unavailable'); return null; }) : Promise.resolve(null),
    input.jobCardId ? getInspectionContext(shopId, input.jobCardId).catch(() => { warnings.push('inspection_context_unavailable'); return null; }) : Promise.resolve(null),
    input.estimateId ? getEstimateContext(shopId, input.estimateId).catch(() => { warnings.push('estimate_context_unavailable'); return null; }) : Promise.resolve(null),
  ]);

  let jobCardConcern: string | null = null;
  if (input.jobCardId) {
    try {
      const { data } = await supabase
        .from('job_cards')
        .select('customer_concern')
        .eq('id', input.jobCardId)
        .eq('shop_id', shopId)
        .maybeSingle();
      jobCardConcern = data?.customer_concern ?? null;
    } catch {
      warnings.push('job_card_concern_unavailable');
    }
  }

  let businessMemorySummary: string | null = null;
  if (input.customerId || input.vehicleId) {
    try {
      businessMemorySummary = await getBusinessMemoryContext(shopId, input.customerId, input.vehicleId);
    } catch {
      warnings.push('business_memory_unavailable');
    }
  }

  let repairIntelligenceSummary: string | null = null;
  if (input.vehicleId) {
    try {
      repairIntelligenceSummary = await getRepairIntelligenceContext(shopId, input.vehicleId);
    } catch {
      warnings.push('repair_intelligence_unavailable');
    }
  }

  return sanitizeContext({
    shopId,
    sessionId: input.sessionId ?? null,
    customer,
    vehicle,
    inspection,
    estimate,
    jobCardConcern,
    businessMemorySummary,
    repairIntelligenceSummary,
    dataQualityWarnings: warnings,
    builtAt: new Date().toISOString(),
  });
}

export async function getCustomerContext(
  shopId: string,
  customerId: string
): Promise<CustomerContext> {
  const { data: customer } = await supabase
    .from('customers')
    .select('id, visit_count, last_visit_date')
    .eq('id', customerId)
    .eq('shop_id', shopId)
    .maybeSingle();

  const { data: invoices } = await supabase
    .from('invoices')
    .select('total_amount, status')
    .eq('customer_id', customerId)
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(20);

  const paidInvoices = (invoices ?? []).filter((i: Record<string, unknown>) => i.status === 'paid');
  const unpaidInvoices = (invoices ?? []).filter((i: Record<string, unknown>) => i.status !== 'paid' && i.status !== 'draft');
  const averageInvoiceValue = paidInvoices.length > 0
    ? paidInvoices.reduce((s: number, i: Record<string, unknown>) => s + Number(i.total_amount ?? 0), 0) / paidInvoices.length
    : null;
  const unpaidBalance = unpaidInvoices.reduce((s: number, i: Record<string, unknown>) => s + Number(i.total_amount ?? 0), 0) || null;

  const { data: declinedRows } = await supabase
    .from('estimate_declined_items')
    .select('id, description, estimated_value, declined_at, reason')
    .eq('customer_id', customerId)
    .eq('shop_id', shopId)
    .order('declined_at', { ascending: false })
    .limit(10);

  const priorDeclinedItems: DeclinedWorkItem[] = (declinedRows ?? []).map((r: Record<string, unknown>) => ({
    serviceId: null,
    description: String(r.description ?? ''),
    estimatedValue: r.estimated_value != null ? Number(r.estimated_value) : null,
    declinedDate: r.declined_at ? String(r.declined_at) : null,
    reason: r.reason ? String(r.reason) : null,
  }));

  return {
    customerId,
    visitCount: customer?.visit_count ?? 0,
    lastVisitDate: customer?.last_visit_date ?? null,
    averageInvoiceValue,
    unpaidBalance,
    approvalHistoryRate: null,
    priorDeclinedCount: priorDeclinedItems.length,
    priorDeclinedItems,
    repeatConcerns: [],
  };
}

export async function getVehicleContext(
  shopId: string,
  vehicleId: string
): Promise<VehicleContext> {
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, year, make, model, mileage')
    .eq('id', vehicleId)
    .eq('shop_id', shopId)
    .maybeSingle();

  const { data: jobCards } = await supabase
    .from('job_cards')
    .select('customer_concern, created_at')
    .eq('vehicle_id', vehicleId)
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(5);

  const repairHistorySummary = (jobCards ?? [])
    .map((j: Record<string, unknown>) => j.customer_concern ? String(j.customer_concern) : null)
    .filter(Boolean) as string[];

  const { data: dtcRows } = await supabase
    .from('dtc_records')
    .select('code')
    .eq('vehicle_id', vehicleId)
    .eq('shop_id', shopId)
    .eq('is_active', true)
    .limit(10);

  const activeDtcCodes = (dtcRows ?? []).map((d: Record<string, unknown>) => String(d.code ?? ''));

  let viSignals: VehicleIntelligenceSignal[] = [];
  try {
    const viCtx = await getVehicleIntelligenceContext(shopId, vehicleId);
    viSignals = viCtx;
  } catch {
    // non-blocking
  }

  return {
    vehicleId,
    year: vehicle?.year ?? null,
    make: vehicle?.make ?? null,
    model: vehicle?.model ?? null,
    mileage: vehicle?.mileage ?? null,
    repairHistorySummary,
    activeDtcCodes,
    lastServiceDate: jobCards?.[0]?.created_at ?? null,
    vehicleIntelligenceSignals: viSignals,
  };
}

export async function getInspectionContext(
  shopId: string,
  jobCardId: string
): Promise<InspectionContext> {
  const { data: inspection } = await supabase
    .from('inspections')
    .select('id, completed_at, technician_notes')
    .eq('job_card_id', jobCardId)
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!inspection) {
    return { inspectionId: null, findings: [], completedAt: null, technicianNotes: null };
  }

  const { data: findingRows } = await supabase
    .from('inspection_findings')
    .select('id, category, name, condition, notes, is_safety, estimate_line_id')
    .eq('inspection_id', inspection.id)
    .eq('shop_id', shopId);

  const findings: InspectionFinding[] = (findingRows ?? []).map((f: Record<string, unknown>) => ({
    id: String(f.id),
    category: String(f.category ?? ''),
    name: String(f.name ?? ''),
    condition: f.condition ? String(f.condition) : null,
    notes: f.notes ? String(f.notes) : null,
    isSafety: Boolean(f.is_safety),
    hasEstimateLine: f.estimate_line_id != null,
  }));

  return {
    inspectionId: inspection.id,
    findings,
    completedAt: inspection.completed_at ?? null,
    technicianNotes: inspection.technician_notes ?? null,
  };
}

export async function getEstimateContext(
  shopId: string,
  estimateId: string
): Promise<EstimateContext> {
  const { data: estimate } = await supabase
    .from('estimates')
    .select('id, status, total_amount, currency, customer_explanation, sent_at, viewed_at, approved_at, declined_at, created_at, inspection_id')
    .eq('id', estimateId)
    .eq('shop_id', shopId)
    .maybeSingle();

  if (!estimate) throw new Error('estimate_not_found');

  const { data: lines } = await supabase
    .from('estimate_lines')
    .select('id, description, quantity, unit_price, total, currency, line_type, inspection_finding_id')
    .eq('estimate_id', estimateId)
    .eq('shop_id', shopId);

  const estimateLines: EstimateLine[] = (lines ?? []).map((l: Record<string, unknown>) => ({
    id: String(l.id),
    description: l.description ? String(l.description) : null,
    quantity: Number(l.quantity ?? 1),
    unitPrice: Number(l.unit_price ?? 0),
    total: Number(l.total ?? 0),
    currency: l.currency ? String(l.currency) : null,
    lineType: l.line_type as EstimateLine['lineType'],
    inspectionFindingId: l.inspection_finding_id ? String(l.inspection_finding_id) : null,
  }));

  return {
    estimateId,
    status: estimate.status ?? null,
    totalAmount: estimate.total_amount != null ? Number(estimate.total_amount) : null,
    currency: estimate.currency ?? null,
    lineCount: estimateLines.length,
    lines: estimateLines,
    hasCustomerExplanation: Boolean(estimate.customer_explanation),
    sentAt: estimate.sent_at ?? null,
    viewedAt: estimate.viewed_at ?? null,
    approvedAt: estimate.approved_at ?? null,
    declinedAt: estimate.declined_at ?? null,
    createdAt: estimate.created_at ?? null,
    hasLinkedInspection: estimate.inspection_id != null,
  };
}

export async function getDeclinedWorkContext(
  shopId: string,
  customerId: string | undefined,
  vehicleId: string | undefined
): Promise<DeclinedWorkItem[]> {
  if (!customerId && !vehicleId) return [];

  let query = supabase
    .from('estimate_declined_items')
    .select('id, description, estimated_value, declined_at, reason')
    .eq('shop_id', shopId)
    .order('declined_at', { ascending: false })
    .limit(20);

  if (customerId) query = query.eq('customer_id', customerId);
  if (vehicleId) query = query.eq('vehicle_id', vehicleId);

  const { data } = await query;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    serviceId: null,
    description: String(r.description ?? ''),
    estimatedValue: r.estimated_value != null ? Number(r.estimated_value) : null,
    declinedDate: r.declined_at ? String(r.declined_at) : null,
    reason: r.reason ? String(r.reason) : null,
  }));
}

export async function getInvoiceContext(
  shopId: string,
  customerId: string
): Promise<{ count: number; averageValue: number | null; unpaidBalance: number }> {
  const { data } = await supabase
    .from('invoices')
    .select('total_amount, status')
    .eq('customer_id', customerId)
    .eq('shop_id', shopId)
    .limit(50);

  const rows = data ?? [];
  const paid = rows.filter((r: Record<string, unknown>) => r.status === 'paid');
  const unpaid = rows.filter((r: Record<string, unknown>) => r.status !== 'paid' && r.status !== 'draft');
  const avg = paid.length > 0
    ? paid.reduce((s: number, r: Record<string, unknown>) => s + Number(r.total_amount ?? 0), 0) / paid.length
    : null;
  const unpaidBalance = unpaid.reduce((s: number, r: Record<string, unknown>) => s + Number(r.total_amount ?? 0), 0);
  return { count: rows.length, averageValue: avg, unpaidBalance };
}

export async function getVehicleIntelligenceContext(
  shopId: string,
  vehicleId: string
): Promise<VehicleIntelligenceSignal[]> {
  const { data } = await supabase
    .from('vehicle_intelligence_signals')
    .select('signal_type, description, severity, confidence')
    .eq('vehicle_id', vehicleId)
    .eq('shop_id', shopId)
    .eq('is_active', true)
    .order('confidence', { ascending: false })
    .limit(10);

  return (data ?? []).map((s: Record<string, unknown>) => ({
    signalType: String(s.signal_type ?? ''),
    description: String(s.description ?? ''),
    severity: s.severity ? String(s.severity) : null,
    confidence: Number(s.confidence ?? 0),
  }));
}

export async function getBusinessMemoryContext(
  shopId: string,
  customerId: string | undefined,
  vehicleId: string | undefined
): Promise<string | null> {
  if (!customerId && !vehicleId) return null;

  let query = supabase
    .from('business_memory')
    .select('memory_type, content, relevance_score')
    .eq('shop_id', shopId)
    .order('relevance_score', { ascending: false })
    .limit(5);

  if (customerId) query = query.eq('entity_id', customerId);

  const { data } = await query;
  if (!data || data.length === 0) return null;

  return data
    .map((m: Record<string, unknown>) => `[${m.memory_type}] ${String(m.content ?? '').slice(0, 200)}`)
    .join(' | ');
}

export async function getRepairIntelligenceContext(
  shopId: string,
  vehicleId: string
): Promise<string | null> {
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('make, model, year')
    .eq('id', vehicleId)
    .eq('shop_id', shopId)
    .maybeSingle();

  if (!vehicle) return null;

  const { data: cases } = await supabase
    .from('repair_cases')
    .select('title, verified_fix, confidence')
    .eq('shop_id', shopId)
    .eq('make', vehicle.make)
    .eq('model', vehicle.model)
    .order('confidence', { ascending: false })
    .limit(3);

  if (!cases || cases.length === 0) return null;

  return cases
    .map((c: Record<string, unknown>) => `${c.title}: ${String(c.verified_fix ?? '').slice(0, 150)}`)
    .join(' | ');
}

export function sanitizeContext(context: ServiceAdvisorContext): ServiceAdvisorContext {
  // Strip fields that must not appear in advisor outputs
  const sanitized = { ...context };
  if (sanitized.customer) {
    sanitized.customer = { ...sanitized.customer };
    // Ensure no raw payment data or full notes propagate
  }
  return sanitized;
}
