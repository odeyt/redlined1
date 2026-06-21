import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import type { AppointmentRow } from '@/lib/types';

export type AppointmentRecord = {
  id: string;
  data: AppointmentRow;
};

type DbRow = {
  id: string;
  time: string;
  customer: string;
  vehicle: string;
  service: string;
  job_card: string;
  bay: string;
  reminder: string;
  technician: string;
};

function toRow(r: DbRow): AppointmentRecord {
  return {
    id: r.id,
    data: [r.time, r.customer, r.vehicle, r.service, r.job_card, r.bay, r.reminder, r.technician] as AppointmentRow,
  };
}

export async function fetchAppointments(): Promise<AppointmentRecord[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('shop_id', getShopId())
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as DbRow[]).map(toRow);
}

export async function createAppointment(row: AppointmentRow): Promise<AppointmentRecord> {
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      shop_id: getShopId(),
      time: row[0],
      customer: row[1],
      vehicle: row[2],
      service: row[3],
      job_card: row[4] ?? '',
      bay: row[5] ?? '',
      reminder: row[6] ?? 'Confirmed',
      technician: row[7] ?? '',
    })
    .select()
    .single();
  if (error) throw error;
  return toRow(data as DbRow);
}

export async function updateAppointment(id: string, row: AppointmentRow): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .update({
      time: row[0],
      customer: row[1],
      vehicle: row[2],
      service: row[3],
      job_card: row[4] ?? '',
      bay: row[5] ?? '',
      reminder: row[6] ?? 'Confirmed',
      technician: row[7] ?? '',
    })
    .eq('id', id)
    .eq('shop_id', getShopId());
  if (error) throw error;
}

export async function deleteAppointment(id: string): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', id)
    .eq('shop_id', getShopId());
  if (error) throw error;
}
