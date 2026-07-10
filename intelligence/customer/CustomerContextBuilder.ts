// SI-13: Customer Lifetime Intelligence — Context Builder

import { supabase } from '@/lib/supabase';
import type {
  CustomerLifetimeContext,
  RawCustomerRow,
  VehicleRow,
  JobCardRow,
  EstimateRow,
  InvoiceRow,
  DeclinedWorkRow,
  AppointmentRow,
  ServiceAdvisorSessionRow,
} from './types';

export async function buildCustomerContext(shopId: string, customerId: string): Promise<CustomerLifetimeContext> {
  const warnings: string[] = [];
  const builtAt = new Date().toISOString();

  const [
    customerResult,
    vehiclesResult,
    jobsResult,
    estimatesResult,
    invoicesResult,
    declinedResult,
    appointmentsResult,
    sessionResult,
    memoryResult,
    vehicleIntelResult,
  ] = await Promise.allSettled([
    supabase.from('customers').select('id, shop_id, created_at, visit_count, last_visit_date, is_fleet, is_commercial, notes').eq('id', customerId).eq('shop_id', shopId).maybeSingle(),
    supabase.from('vehicles').select('id, make, model, year, is_active').eq('customer_id', customerId).eq('shop_id', shopId),
    supabase.from('job_cards').select('id, created_at, status, completed_at').eq('customer_id', customerId).eq('shop_id', shopId).order('created_at', { ascending: false }).limit(100),
    supabase.from('estimates').select('id, total_amount, currency, status, approved_at, declined_at, created_at').eq('customer_id', customerId).eq('shop_id', shopId).order('created_at', { ascending: false }).limit(100),
    supabase.from('invoices').select('id, total_amount, status, paid_at, created_at').eq('customer_id', customerId).eq('shop_id', shopId).order('created_at', { ascending: false }).limit(100),
    supabase.from('estimate_declined_items').select('id, description, estimated_value, created_at, reason').eq('customer_id', customerId).eq('shop_id', shopId).order('created_at', { ascending: false }).limit(50),
    supabase.from('appointments').select('id, scheduled_at, status, created_at').eq('customer_id', customerId).eq('shop_id', shopId).order('scheduled_at', { ascending: false }).limit(30),
    supabase.from('service_advisor_sessions').select('id, session_status, created_at, estimate_quality_score').eq('customer_id', customerId).eq('shop_id', shopId).order('created_at', { ascending: false }).limit(20),
    supabase.from('business_memory').select('memory_text').eq('shop_id', shopId).eq('entity_type', 'customer').eq('entity_id', customerId).eq('is_active', true).order('created_at', { ascending: false }).limit(10),
    supabase.from('vehicle_intelligence_signals').select('signal_key, title').eq('shop_id', shopId).in('vehicle_id', [customerId]).eq('is_active', true).limit(20),
  ]);

  const customer = customerResult.status === 'fulfilled' && customerResult.value.data
    ? mapCustomer(customerResult.value.data)
    : null;

  if (!customer) warnings.push('customer_not_found_or_no_access');

  const vehicles: VehicleRow[] = vehiclesResult.status === 'fulfilled'
    ? (vehiclesResult.value.data ?? []).map(mapVehicle)
    : (warnings.push('vehicles_unavailable'), []);

  const jobHistory: JobCardRow[] = jobsResult.status === 'fulfilled'
    ? (jobsResult.value.data ?? []).map(mapJob)
    : (warnings.push('job_history_unavailable'), []);

  const estimateHistory: EstimateRow[] = estimatesResult.status === 'fulfilled'
    ? (estimatesResult.value.data ?? []).map(mapEstimate)
    : (warnings.push('estimate_history_unavailable'), []);

  const invoiceHistory: InvoiceRow[] = invoicesResult.status === 'fulfilled'
    ? (invoicesResult.value.data ?? []).map(mapInvoice)
    : (warnings.push('invoice_history_unavailable'), []);

  const declinedWork: DeclinedWorkRow[] = declinedResult.status === 'fulfilled'
    ? (declinedResult.value.data ?? []).map(mapDeclined)
    : (warnings.push('declined_work_unavailable'), []);

  const appointmentHistory: AppointmentRow[] = appointmentsResult.status === 'fulfilled'
    ? (appointmentsResult.value.data ?? []).map(mapAppointment)
    : (warnings.push('appointment_history_unavailable'), []);

  const serviceAdvisorHistory: ServiceAdvisorSessionRow[] = sessionResult.status === 'fulfilled'
    ? (sessionResult.value.data ?? []).map(mapAdvisorSession)
    : [];

  let businessMemorySummary: string | null = null;
  if (memoryResult.status === 'fulfilled' && memoryResult.value.data && memoryResult.value.data.length > 0) {
    businessMemorySummary = memoryResult.value.data.map((m: { memory_text: string }) => m.memory_text).join(' | ');
  }

  let vehicleIntelligenceSummary: string | null = null;
  if (vehicleIntelResult.status === 'fulfilled' && vehicleIntelResult.value.data && vehicleIntelResult.value.data.length > 0) {
    vehicleIntelligenceSummary = vehicleIntelResult.value.data.map((s: { signal_key: string; title: string }) => s.title).join(', ');
  }

  return {
    shopId,
    customerId,
    customer,
    vehicles,
    jobHistory,
    estimateHistory,
    invoiceHistory,
    declinedWork,
    appointmentHistory,
    businessMemorySummary,
    vehicleIntelligenceSummary,
    serviceAdvisorHistory,
    dataQualityWarnings: warnings,
    builtAt,
  };
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapCustomer(row: Record<string, unknown>): RawCustomerRow {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    createdAt: String(row.created_at),
    visitCount: row.visit_count != null ? Number(row.visit_count) : undefined,
    lastVisitDate: row.last_visit_date ? String(row.last_visit_date) : null,
    isFleet: Boolean(row.is_fleet),
    isCommercial: Boolean(row.is_commercial),
    notes: row.notes ? String(row.notes) : null,
  };
}

function mapVehicle(row: Record<string, unknown>): VehicleRow {
  return {
    id: String(row.id),
    make: row.make ? String(row.make) : null,
    model: row.model ? String(row.model) : null,
    year: row.year != null ? Number(row.year) : null,
    isActive: Boolean(row.is_active),
  };
}

function mapJob(row: Record<string, unknown>): JobCardRow {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    status: row.status ? String(row.status) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function mapEstimate(row: Record<string, unknown>): EstimateRow {
  return {
    id: String(row.id),
    totalAmount: row.total_amount != null ? Number(row.total_amount) : null,
    currency: row.currency ? String(row.currency) : null,
    status: row.status ? String(row.status) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    declinedAt: row.declined_at ? String(row.declined_at) : null,
    createdAt: String(row.created_at),
  };
}

function mapInvoice(row: Record<string, unknown>): InvoiceRow {
  return {
    id: String(row.id),
    totalAmount: row.total_amount != null ? Number(row.total_amount) : null,
    status: row.status ? String(row.status) : null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    createdAt: String(row.created_at),
  };
}

function mapDeclined(row: Record<string, unknown>): DeclinedWorkRow {
  return {
    id: String(row.id),
    description: String(row.description ?? ''),
    estimatedValue: row.estimated_value != null ? Number(row.estimated_value) : null,
    declinedAt: row.created_at ? String(row.created_at) : null,
    reason: row.reason ? String(row.reason) : null,
  };
}

function mapAppointment(row: Record<string, unknown>): AppointmentRow {
  return {
    id: String(row.id),
    scheduledAt: row.scheduled_at ? String(row.scheduled_at) : null,
    status: row.status ? String(row.status) : null,
    createdAt: String(row.created_at),
  };
}

function mapAdvisorSession(row: Record<string, unknown>): ServiceAdvisorSessionRow {
  return {
    id: String(row.id),
    sessionStatus: String(row.session_status ?? 'draft'),
    createdAt: String(row.created_at),
    estimateQualityScore: row.estimate_quality_score != null ? Number(row.estimate_quality_score) : null,
  };
}
