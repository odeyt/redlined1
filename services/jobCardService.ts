import { supabase } from '@/lib/supabase';
import { getShopId, getShopIds } from '@/lib/shopStore';

export interface StageHistoryEntry {
  stage: string; label: string; icon: string;
  advancedAt: string; notifiedSms: boolean; notifiedEmail: boolean;
}

export interface JobCardFull {
  id: string;
  ro: string | null;
  invoice: string | null;
  customer: string;
  vehicle: string;
  serviceType: string;
  channel: string;
  location: string;
  technicians: string[];
  status: string;
  priority: string;
  approval: string;
  laborHours: number;
  partsTotal: number;
  workflow: string[];
  nextAction: string;
  checkInDate: string;
  closedDate: string | null;
  statusToken: string | null;
  repairStage: string;
  stageHistory: StageHistoryEntry[];
  customerPhone: string;
  customerEmail: string;
  notes: string;
}

function toJob(row: Record<string, unknown>): JobCardFull {
  return {
    id: row.id as string,
    ro: row.ro as string | null,
    invoice: row.invoice as string | null,
    customer: row.customer as string,
    vehicle: row.vehicle as string,
    serviceType: row.service_type as string,
    channel: row.channel as string,
    location: row.location as string,
    technicians: (row.technicians as string[]) ?? [],
    status: row.status as string,
    priority: row.priority as string,
    approval: row.approval as string,
    laborHours: Number(row.labor_hours ?? 0),
    partsTotal: Number(row.parts_total ?? 0),
    workflow: (row.workflow as string[]) ?? [],
    nextAction: row.next_action as string,
    checkInDate: row.check_in_date as string,
    closedDate: row.closed_date as string | null,
    statusToken: (row.status_token as string) || null,
    repairStage: (row.repair_stage as string) || 'checked_in',
    stageHistory: (row.stage_history as StageHistoryEntry[]) ?? [],
    customerPhone: (row.customer_phone as string) || '',
    customerEmail: (row.customer_email as string) || '',
    notes: (row.notes as string) || '',
  };
}

export async function fetchJobCards(): Promise<JobCardFull[]> {
  const { data, error } = await supabase
    .from('job_cards')
    .select('*')
    .in('shop_id', getShopIds())
    .order('check_in_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toJob);
}

export async function fetchClosedJobs(): Promise<JobCardFull[]> {
  const { data, error } = await supabase
    .from('closed_jobs')
    .select('*')
    .in('shop_id', getShopIds())
    .order('closed_date', { ascending: false });
  // If the shop_id column doesn't exist yet (pre-migration), return empty rather than crashing
  if (error) {
    if (error.message?.includes('shop_id')) return [];
    throw error;
  }
  return (data ?? []).map(toJob);
}

export async function createJobCard(fields: {
  customer: string;
  vehicle: string;
  serviceType: string;
  channel: string;
  location: string;
  technicians: string[];
  priority: string;
  approvalCode: string;
  notes?: string;
}): Promise<JobCardFull> {
  const id = `JC-${Date.now()}`;
  const approved = !!fields.approvalCode;
  const { data, error } = await supabase
    .from('job_cards')
    .insert({
      id,
      shop_id: getShopId(),
      ro: null,
      invoice: null,
      customer: fields.customer,
      vehicle: fields.vehicle,
      service_type: fields.serviceType,
      channel: fields.channel,
      location: fields.location,
      technicians: fields.technicians,
      status: approved ? 'Approved' : 'Booked',
      priority: fields.priority,
      approval: approved ? 'Approved' : 'Pending',
      labor_hours: fields.serviceType.includes('Diagnostic') ? 1.1 : 1.6,
      parts_total: fields.serviceType.includes('Diagnostic') ? 0 : 96.5,
      workflow: approved ? ['Booked', 'Approved'] : ['Booked'],
      next_action: approved ? 'Convert to repair order' : 'Request approval',
      check_in_date: new Date().toISOString(),
      notes: fields.notes ?? '',
    })
    .select()
    .single();
  if (error) throw error;
  // Non-blocking intelligence hook — fire-and-forget, never throws
  try {
    const { publishEvent } = await import('@/intelligence/IntelligenceService');
    publishEvent('JobCardCreated', getShopId(), '', 'job_card', id);
  } catch { /* intelligence must never affect production */ }
  return toJob(data);
}

export async function updateJobCard(id: string, fields: Partial<{
  status: string;
  approval: string;
  workflow: string[];
  nextAction: string;
  ro: string | null;
  invoice: string | null;
  technicians: string[];
  vehicle: string;
  serviceType: string;
  priority: string;
  location: string;
  laborHours: number;
  partsTotal: number;
}>): Promise<void> {
  const update: Record<string, unknown> = {};
  if (fields.status !== undefined) update.status = fields.status;
  if (fields.approval !== undefined) update.approval = fields.approval;
  if (fields.workflow !== undefined) update.workflow = fields.workflow;
  if (fields.nextAction !== undefined) update.next_action = fields.nextAction;
  if (fields.ro !== undefined) update.ro = fields.ro;
  if (fields.invoice !== undefined) update.invoice = fields.invoice;
  if (fields.technicians !== undefined) update.technicians = fields.technicians;
  if (fields.vehicle !== undefined) update.vehicle = fields.vehicle;
  if (fields.serviceType !== undefined) update.service_type = fields.serviceType;
  if (fields.priority !== undefined) update.priority = fields.priority;
  if (fields.location !== undefined) update.location = fields.location;
  if (fields.laborHours !== undefined) update.labor_hours = fields.laborHours;
  if (fields.partsTotal !== undefined) update.parts_total = fields.partsTotal;
  const { error } = await supabase.from('job_cards').update(update).eq('id', id).in('shop_id', getShopIds());
  if (error) throw error;
}

export async function closeJob(job: JobCardFull): Promise<void> {
  const closedDate = new Date().toISOString();
  const { error: insertError } = await supabase.from('closed_jobs').insert({
    id: job.id,
    shop_id: getShopId(),
    ro: job.ro,
    invoice: job.invoice,
    customer: job.customer,
    vehicle: job.vehicle,
    service_type: job.serviceType,
    channel: job.channel,
    location: job.location,
    technicians: job.technicians,
    status: 'Closed',
    priority: job.priority,
    approval: job.approval,
    labor_hours: job.laborHours,
    parts_total: job.partsTotal,
    workflow: [...job.workflow, 'Closed'],
    check_in_date: job.checkInDate,
    closed_date: closedDate,
    created_at: job.checkInDate,
  });
  if (insertError) throw insertError;
  const { error: deleteError } = await supabase.from('job_cards').delete().eq('id', job.id).in('shop_id', getShopIds());
  if (deleteError) throw deleteError;
  // Non-blocking intelligence hook — fire-and-forget, never throws
  try {
    const { publishEvent } = await import('@/intelligence/IntelligenceService');
    publishEvent('RepairOrderCompleted', getShopId(), '', 'job_card', job.id);
  } catch { /* intelligence must never affect production */ }
}

export async function deleteJobCard(id: string): Promise<void> {
  const { error } = await supabase.from('job_cards').delete().eq('id', id).in('shop_id', getShopIds());
  if (error) throw error;
}
