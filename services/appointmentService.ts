import { supabase } from '@/lib/supabase';
import { recordAudit } from '@/lib/domain/auditFromBrowser';
import { AUDIT } from '@/lib/domain/audit';
import { getShopId, getShopIds } from '@/lib/shopStore';
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
  shop_id?: string;
};

function toRow(r: DbRow): AppointmentRecord {
  return {
    id: r.id,
    date: r.date ?? '',
    data: [r.time, r.customer, r.vehicle, r.service, r.job_card ?? '', r.bay ?? '', r.reminder ?? 'Confirmed', r.technician ?? ''] as AppointmentRow,
  };
}

let technicianColumnExists: boolean | null = null;
let shopIdColumnExists:     boolean | null = null;

export async function fetchAppointments(): Promise<AppointmentRecord[]> {
  const shopId = getShopId();
  const shopIds = getShopIds();

  // If we have a valid shop ID and know the column exists, filter by it
  let query = supabase.from('appointments').select('*').order('date', { ascending: true }).order('time', { ascending: true });

  if (shopId && shopIdColumnExists !== false) {
    query = query.in('shop_id', shopIds) as typeof query;
  }

  const { data, error } = await query;

  if (error) {
    // shop_id column missing — retry without filter
    if (error.code === '42703' || error.message?.includes('shop_id')) {
      shopIdColumnExists = false;
      const { data: d2, error: e2 } = await supabase
        .from('appointments').select('*')
        .order('date', { ascending: true }).order('time', { ascending: true });
      if (e2) throw e2;
      return ((d2 ?? []) as DbRow[]).map(toRow);
    }
    throw error;
  }

  const rows = (data ?? []) as DbRow[];
  if (rows.length > 0) {
    if (technicianColumnExists === null) technicianColumnExists = 'technician' in rows[0];
    if (shopIdColumnExists === null)     shopIdColumnExists     = 'shop_id' in rows[0];
  } else {
    shopIdColumnExists = true; // assume it exists if we got no error
  }

  return rows.map(toRow);
}

function basePayload(date: string, row: AppointmentRow) {
  const shopId = getShopId();
  const payload: Record<string, unknown> = {
    date,
    time:     row[0],
    customer: row[1],
    vehicle:  row[2],
    service:  row[3],
    job_card: row[4] ?? '',
    bay:      row[5] ?? '',
    reminder: row[6] ?? 'Confirmed',
  };
  // Only include shop_id if we have a valid non-empty UUID
  if (shopId && shopIdColumnExists !== false) {
    payload.shop_id = shopId;
  }
  return payload;
}

export async function createAppointment(date: string, row: AppointmentRow): Promise<AppointmentRecord> {
  const base = basePayload(date, row);

  const withTech = { ...base, ...(technicianColumnExists !== false ? { technician: row[7] ?? '' } : {}) };

  const { data, error } = await supabase
    .from('appointments').insert(withTech).select().single();

  if (!error) {
    if (technicianColumnExists === null) technicianColumnExists = true;
    const created = toRow(data as DbRow);
    publishAppointmentBooked(created);
    return created;
  }

  // Missing technician column — retry without it
  if (error.code === '42703' && error.message?.toLowerCase().includes('technician')) {
    technicianColumnExists = false;
    const { data: d2, error: e2 } = await supabase
      .from('appointments').insert(base).select().single();
    if (e2) throw e2;
    const created = toRow(d2 as DbRow);
    publishAppointmentBooked(created);
    return created;
  }

  // shop_id column missing or bad UUID — retry without shop_id
  if (error.code === '42703' || error.code === '22P02' || error.message?.includes('shop_id') || error.message?.includes('uuid')) {
    shopIdColumnExists = false;
    const { shop_id: _, ...noShopPayload } = { ...withTech, shop_id: undefined };
    const clean = Object.fromEntries(Object.entries(noShopPayload).filter(([, v]) => v !== undefined));
    const { data: d3, error: e3 } = await supabase
      .from('appointments').insert(clean).select().single();
    if (e3) throw e3;
    const created = toRow(d3 as DbRow);
    publishAppointmentBooked(created);
    return created;
  }

  throw error;
}

// Non-blocking Sapelee Event Bus hook — fire-and-forget, never throws.
// Shared by all three insert paths above (primary + two column-missing
// retry fallbacks) so the event fires exactly once regardless of which
// path actually succeeded.
function publishAppointmentBooked(created: AppointmentRecord): void {
  import('@/lib/sapelee/publish')
    .then(({ publishSapeleeEvent }) =>
      publishSapeleeEvent(supabase, {
        eventType: 'appointment.booked',
        payload: {
          appointmentId: created.id,
          scheduledFor: new Date(created.date).toISOString(),
        },
        shopId: getShopId(),
        aggregateType: 'appointment',
        aggregateId: created.id,
      })
    )
    .catch(() => { /* sapelee integration must never affect production */ });
}

export async function updateAppointment(id: string, date: string, row: AppointmentRow): Promise<void> {
  const payload: Record<string, unknown> = {
    date,
    time:     row[0],
    customer: row[1],
    vehicle:  row[2],
    service:  row[3],
    job_card: row[4] ?? '',
    bay:      row[5] ?? '',
    reminder: row[6] ?? 'Confirmed',
    ...(technicianColumnExists !== false ? { technician: row[7] ?? '' } : {}),
  };

  let q = supabase.from('appointments').update(payload).eq('id', id);
  const shopId = getShopId();
  if (shopId && shopIdColumnExists !== false) q = q.eq('shop_id', shopId) as typeof q;

  const { error } = await q;
  if (!error) return;

  // Retry without technician if column missing
  if (error.code === '42703' && error.message?.toLowerCase().includes('technician')) {
    technicianColumnExists = false;
    delete payload.technician;
    const { error: e2 } = await supabase.from('appointments').update(payload).eq('id', id);
    if (e2) throw e2;
    return;
  }
  throw error;
}

export async function deleteAppointment(id: string): Promise<void> {
  const { data: before } = await supabase
    .from('appointments').select('*').eq('id', id).maybeSingle();

  const { error } = await supabase
    .from('appointments').delete().eq('id', id);
  if (error) throw error;

  // A cancelled booking is a customer who was told to come in and then was
  // not. Worth being able to say who cancelled it and when.
  await recordAudit({
    action: AUDIT.appointmentDeleted,
    entityType: 'appointment',
    entityId: id,
    before: before ? {
      date: before.date, time: before.time, customer: before.customer,
      vehicle: before.vehicle, service: before.service, technician: before.technician,
    } : null,
  });
}
