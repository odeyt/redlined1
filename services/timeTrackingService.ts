import { supabase } from '@/lib/supabase';
import { recordAudit } from '@/lib/domain/auditFromBrowser';
import { AUDIT } from '@/lib/domain/audit';
import { getShopId, getShopIds } from '@/lib/shopStore';

export interface TimeEntry {
  id: string;
  jobCardId: string | null;
  jobCardNumber: string | null;
  technicianId: string | null;
  technicianName: string;
  clockIn: string;
  clockOut: string | null;
  notes: string;
}

function mapRow(r: Record<string, unknown>): TimeEntry {
  return {
    id: r.id as string,
    jobCardId: r.job_card_id as string | null,
    jobCardNumber: r.job_card_number as string | null,
    technicianId: r.technician_id as string | null,
    technicianName: r.technician_name as string,
    clockIn: r.clock_in as string,
    clockOut: r.clock_out as string | null,
    notes: (r.notes as string) ?? '',
  };
}

export async function fetchTimeEntries(): Promise<TimeEntry[]> {
  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .in('shop_id', getShopIds())
    .order('clock_in', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function clockIn(params: {
  technicianName: string;
  technicianId?: string;
  jobCardId?: string;
  jobCardNumber?: string;
  notes?: string;
}): Promise<TimeEntry> {
  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      shop_id: getShopId(),
      technician_name: params.technicianName,
      technician_id: params.technicianId ?? null,
      job_card_id: params.jobCardId ?? null,
      job_card_number: params.jobCardNumber ?? null,
      notes: params.notes ?? '',
      clock_in: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

export async function clockOut(id: string): Promise<TimeEntry> {
  const { data, error } = await supabase
    .from('time_entries')
    .update({ clock_out: new Date().toISOString() })
    .eq('id', id)
    .in('shop_id', getShopIds())
    .select()
    .single();
  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const { data: before } = await supabase
    .from('time_entries').select('*').eq('id', id).in('shop_id', getShopIds()).maybeSingle();

  const { error } = await supabase
    .from('time_entries')
    .delete()
    .eq('id', id)
    .in('shop_id', getShopIds());
  if (error) throw error;

  // Only deletion is recorded here. Clocking in and out already leaves the row
  // itself as the record; deleting one is what removes the evidence of hours
  // worked, and hours are what people are paid on.
  await recordAudit({
    action: AUDIT.timeEntryDeleted,
    entityType: 'time_entry',
    entityId: id,
    before: before ? {
      technician: before.technician_name, jobCardNumber: before.job_card_number,
      clockIn: before.clock_in, clockOut: before.clock_out, notes: before.notes,
    } : null,
  });
}

export function elapsedMinutes(clockIn: string): number {
  return Math.floor((Date.now() - new Date(clockIn).getTime()) / 60000);
}

export function formatDuration(minutes: number | null): string {
  if (minutes == null || minutes < 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
