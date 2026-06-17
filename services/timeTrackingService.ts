import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';

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
    .eq('shop_id', getShopId())
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
    .eq('shop_id', getShopId())
    .select()
    .single();
  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from('time_entries')
    .delete()
    .eq('id', id)
    .eq('shop_id', getShopId());
  if (error) throw error;
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
