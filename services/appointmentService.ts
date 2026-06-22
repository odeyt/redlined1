import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
import type { AppointmentRow } from '@/lib/types';

export type AppointmentRecord = {
  id: string;
  date: string;
  data: AppointmentRow;
};

type DbRow = {
  id: string;
  date: string;
  time: string;
  customer: string;
  vehicle: string;
  service: string;
  job_card: string;
  bay: string;
  reminder: string;
  technician?: string;
};

function toRow(r: DbRow): AppointmentRecord {
  return {
    id: r.id,
    date: r.date ?? '',
    data: [r.time, r.customer, r.vehicle, r.service, r.job_card, r.bay, r.reminder, r.technician ?? ''] as AppointmentRow,
  };
}

// Tracks whether the technician column has been confirmed to exist.
// Starts as null (unknown), set to true/false after first INSERT attempt.
let technicianColumnExists: boolean | null = null;

export async function fetchAppointments(): Promise<AppointmentRecord[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('shop_id', getShopId())
    .order('date', { ascending: true })
    .order('time', { ascending: true });
  if (error) throw error;
  const rows = (data as DbRow[]);
  // Detect column existence from first row
  if (rows.length > 0 && technicianColumnExists === null) {
    technicianColumnExists = 'technician' in rows[0];
  }
  return rows.map(toRow);
}

function basePayload(date: string, row: AppointmentRow) {
  return {
    shop_id:    getShopId(),
    date,
    time:       row[0],
    customer:   row[1],
    vehicle:    row[2],
    service:    row[3],
    job_card:   row[4] ?? '',
    bay:        row[5] ?? '',
    reminder:   row[6] ?? 'Confirmed',
  };
}

export async function createAppointment(date: string, row: AppointmentRow): Promise<AppointmentRecord> {
  const base = basePayload(date, row);

  // If we already know the column is missing, skip it
  if (technicianColumnExists === false) {
    const { data, error } = await supabase
      .from('appointments').insert(base).select().single();
    if (error) throw error;
    return toRow(data as DbRow);
  }

  // Try with technician column first
  const { data, error } = await supabase
    .from('appointments')
    .insert({ ...base, technician: row[7] ?? '' })
    .select()
    .single();

  if (!error) {
    technicianColumnExists = true;
    return toRow(data as DbRow);
  }

  // If the error is about the missing technician column, retry without it
  if (error.message?.toLowerCase().includes('technician') ||
      error.code === '42703') {
    technicianColumnExists = false;
    const { data: d2, error: e2 } = await supabase
      .from('appointments').insert(base).select().single();
    if (e2) throw e2;
    return toRow(d2 as DbRow);
  }

  throw error;
}

export async function updateAppointment(id: string, date: string, row: AppointmentRow): Promise<void> {
  const base = {
    date,
    time:     row[0],
    customer: row[1],
    vehicle:  row[2],
    service:  row[3],
    job_card: row[4] ?? '',
    bay:      row[5] ?? '',
    reminder: row[6] ?? 'Confirmed',
  };

  if (technicianColumnExists === false) {
    const { error } = await supabase
      .from('appointments').update(base).eq('id', id).eq('shop_id', getShopId());
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('appointments')
    .update({ ...base, technician: row[7] ?? '' })
    .eq('id', id)
    .eq('shop_id', getShopId());

  if (!error) { technicianColumnExists = true; return; }

  if (error.message?.toLowerCase().includes('technician') || error.code === '42703') {
    technicianColumnExists = false;
    const { error: e2 } = await supabase
      .from('appointments').update(base).eq('id', id).eq('shop_id', getShopId());
    if (e2) throw e2;
    return;
  }

  throw error;
}

export async function deleteAppointment(id: string): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', id)
    .eq('shop_id', getShopId());
  if (error) throw error;
}
