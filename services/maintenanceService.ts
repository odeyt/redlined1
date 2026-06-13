import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';

export interface MaintenanceSchedule {
  id: string;
  vehicle: string;
  vin: string;
  customerName: string;
  customerId: string;
  customerEmail: string;
  customerPhone: string;
  serviceType: string;
  intervalMiles: number;
  intervalDays: number;
  lastServiceDate: string | null;
  lastServiceMiles: number;
  nextDueDate: string | null;
  nextDueMiles: number;
  notes: string;
  status: string;
  createdAt: string;
}

export const COMMON_SERVICE_TYPES = [
  'Oil Change', 'Tire Rotation', 'Brake Inspection', 'Air Filter', 'Cabin Filter',
  'Transmission Service', 'Coolant Flush', 'Brake Fluid Flush', 'Spark Plugs',
  'Timing Belt', 'Power Steering Flush', 'Differential Service', 'Full Inspection',
  'State Inspection', 'Wheel Alignment', 'Battery Test', 'AC Service',
];

function mapRow(r: Record<string, unknown>): MaintenanceSchedule {
  return {
    id: r.id as string,
    vehicle: (r.vehicle as string) || '',
    vin: (r.vin as string) || '',
    customerName: (r.customer_name as string) || '',
    customerId: (r.customer_id as string) || '',
    customerEmail: (r.customer_email as string) || '',
    customerPhone: (r.customer_phone as string) || '',
    serviceType: (r.service_type as string) || '',
    intervalMiles: Number(r.interval_miles ?? 0),
    intervalDays: Number(r.interval_days ?? 0),
    lastServiceDate: (r.last_service_date as string) || null,
    lastServiceMiles: Number(r.last_service_miles ?? 0),
    nextDueDate: (r.next_due_date as string) || null,
    nextDueMiles: Number(r.next_due_miles ?? 0),
    notes: (r.notes as string) || '',
    status: (r.status as string) || 'Active',
    createdAt: (r.created_at as string) || '',
  };
}

export async function fetchMaintenanceSchedules(): Promise<MaintenanceSchedule[]> {
  const { data, error } = await supabase
    .from('maintenance_schedules')
    .select('*')
    .eq('shop_id', getShopId())
    .order('next_due_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createMaintenanceSchedule(ms: Omit<MaintenanceSchedule, 'id' | 'createdAt'>): Promise<MaintenanceSchedule> {
  const { data, error } = await supabase
    .from('maintenance_schedules')
    .insert({
      shop_id: getShopId(),
      vehicle: ms.vehicle,
      vin: ms.vin || null,
      customer_name: ms.customerName,
      customer_id: ms.customerId || null,
      customer_email: ms.customerEmail,
      customer_phone: ms.customerPhone,
      service_type: ms.serviceType,
      interval_miles: ms.intervalMiles,
      interval_days: ms.intervalDays,
      last_service_date: ms.lastServiceDate || null,
      last_service_miles: ms.lastServiceMiles,
      next_due_date: ms.nextDueDate || null,
      next_due_miles: ms.nextDueMiles,
      notes: ms.notes,
      status: ms.status,
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function updateMaintenanceSchedule(id: string, updates: Partial<MaintenanceSchedule>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.vehicle !== undefined) payload.vehicle = updates.vehicle;
  if (updates.vin !== undefined) payload.vin = updates.vin;
  if (updates.customerName !== undefined) payload.customer_name = updates.customerName;
  if (updates.customerId !== undefined) payload.customer_id = updates.customerId || null;
  if (updates.customerEmail !== undefined) payload.customer_email = updates.customerEmail;
  if (updates.customerPhone !== undefined) payload.customer_phone = updates.customerPhone;
  if (updates.serviceType !== undefined) payload.service_type = updates.serviceType;
  if (updates.intervalMiles !== undefined) payload.interval_miles = updates.intervalMiles;
  if (updates.intervalDays !== undefined) payload.interval_days = updates.intervalDays;
  if (updates.lastServiceDate !== undefined) payload.last_service_date = updates.lastServiceDate || null;
  if (updates.lastServiceMiles !== undefined) payload.last_service_miles = updates.lastServiceMiles;
  if (updates.nextDueDate !== undefined) payload.next_due_date = updates.nextDueDate || null;
  if (updates.nextDueMiles !== undefined) payload.next_due_miles = updates.nextDueMiles;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.status !== undefined) payload.status = updates.status;
  const { error } = await supabase.from('maintenance_schedules').update(payload).eq('id', id).eq('shop_id', getShopId());
  if (error) throw error;
}

export async function deleteMaintenanceSchedule(id: string): Promise<void> {
  const { error } = await supabase.from('maintenance_schedules').delete().eq('id', id).eq('shop_id', getShopId());
  if (error) throw error;
}

export function getDaysUntilDue(nextDueDate: string | null): number | null {
  if (!nextDueDate) return null;
  const due = new Date(nextDueDate);
  const now = new Date();
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getDueStatus(ms: MaintenanceSchedule): 'overdue' | 'due-soon' | 'ok' | 'unknown' {
  const days = getDaysUntilDue(ms.nextDueDate);
  if (days === null) return 'unknown';
  if (days < 0) return 'overdue';
  if (days <= 30) return 'due-soon';
  return 'ok';
}
