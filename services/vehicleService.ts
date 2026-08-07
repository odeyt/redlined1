import { supabase } from '@/lib/supabase';
import { getShopId, getShopIds } from '@/lib/shopStore';
import type { Vehicle } from '@/lib/types';

type VehicleRow = {
  id: string;
  customer_id: string;
  vin: string;
  label: string;
  trim: string;
  engine: string;
  transmission: string;
  mileage: string;
  plate: string;
  status: string;
  recommendation: string;
  // service-record fields
  make: string | null;
  model: string | null;
  year: string | null;
  fuel_type: string | null;
  issues: string | null;
  damage_intake: string | null;
  issues_resolved: boolean | null;
  parts_exchanged: string | null;
  parts_needed: string | null;
  flat_rate_lak: number | null;
  image_ids: string[] | null;
  tech_pay_entries: string | null;
  assigned_tech: string | null;
  date_received: string | null;
  shop_id: string | null;
  completed_at: string | null;
};

export type VehicleRecord = Vehicle & {
  id: string;
  make: string;
  model: string;
  year: string;
  fuelType: string;
  issues: string;
  damageIntake: string;
  issuesResolved: boolean;
  partsExchanged: string;
  partsNeeded: string;
  flatRateLak: number | null;
  imageIds: string[];
  techPayEntries: string;
  assignedTech: string;
  dateReceived: string | null;
  /** Which location the vehicle belongs to. Both are mirrored into one list. */
  shopId: string;
  /**
   * When the vehicle's status last became a completed one. Null for work
   * finished before this was recorded — those can only be dated by when they
   * arrived, which is not the same thing.
   */
  completedAt: string | null;
};

function toVehicle(row: VehicleRow): VehicleRecord {
  return {
    id:              row.id,
    customerId:      row.customer_id,
    vin:             row.vin ?? '',
    label:           row.label ?? '',
    trim:            row.trim ?? '',
    engine:          row.engine ?? '',
    transmission:    row.transmission ?? '',
    mileage:         row.mileage ?? '',
    plate:           row.plate ?? '',
    status:          row.status ?? '',
    recommendation:  row.recommendation ?? '',
    make:            row.make ?? '',
    model:           row.model ?? '',
    year:            row.year ?? '',
    fuelType:        row.fuel_type ?? '',
    issues:          row.issues ?? '',
    damageIntake:    row.damage_intake ?? '',
    issuesResolved:  row.issues_resolved ?? false,
    partsExchanged:  row.parts_exchanged ?? '',
    partsNeeded:     row.parts_needed ?? '',
    flatRateLak:     row.flat_rate_lak ?? null,
    imageIds:        row.image_ids ?? [],
    techPayEntries:  row.tech_pay_entries ?? '',
    assignedTech:    row.assigned_tech ?? '',
    dateReceived:    row.date_received ?? null,
    shopId:          row.shop_id ?? '',
    completedAt:     row.completed_at ?? null,
  };
}

export async function fetchVehicles(): Promise<VehicleRecord[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .in('shop_id', getShopIds())
    .order('label');
  if (error) throw error;
  return (data ?? []).map(toVehicle);
}

export async function fetchVehiclesAll(): Promise<VehicleRecord[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('label');
  if (error) throw error;
  return (data ?? []).map(toVehicle);
}

export async function saveVehicle(
  vehicle: Omit<Vehicle, 'customerId'> & {
    customerId: string;
    make?: string; model?: string; year?: string; fuelType?: string;
  }
): Promise<VehicleRecord> {
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      shop_id:      getShopId(),
      customer_id:  vehicle.customerId || null,
      vin:          vehicle.vin,
      label:        vehicle.label,
      trim:         vehicle.trim,
      engine:       vehicle.engine,
      transmission: vehicle.transmission,
      mileage:      vehicle.mileage,
      plate:        vehicle.plate,
      status:       vehicle.status || 'Active',
      recommendation: vehicle.recommendation,
      make:         vehicle.make ?? null,
      model:        vehicle.model ?? null,
      year:         vehicle.year ?? null,
      fuel_type:    vehicle.fuelType ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  // Non-blocking Sapelee Event Bus hook — fire-and-forget, never throws.
  // Deliberately no VIN in the payload — privacy scope decision, see
  // lib/events/schemas/redlined1-events.ts on the Sapelee side.
  try {
    const { publishSapeleeEvent } = await import('@/lib/sapelee/publish');
    publishSapeleeEvent(supabase, {
      eventType: 'vehicle.created',
      payload: {
        vehicleId: data.id,
        customerId: vehicle.customerId || undefined,
        year: vehicle.year && !Number.isNaN(Number(vehicle.year)) ? Number(vehicle.year) : undefined,
        make: vehicle.make,
        model: vehicle.model,
      },
      shopId: getShopId(),
      aggregateType: 'vehicle',
      aggregateId: data.id,
    });
  } catch { /* sapelee integration must never affect production */ }
  return toVehicle(data);
}

export async function updateVehicle(id: string, vehicle: Omit<Vehicle, 'customerId'> & { customerId: string }): Promise<VehicleRecord> {
  const { data, error } = await supabase
    .from('vehicles')
    .update({
      customer_id:  vehicle.customerId || null,
      vin:          vehicle.vin,
      label:        vehicle.label,
      trim:         vehicle.trim,
      engine:       vehicle.engine,
      transmission: vehicle.transmission,
      mileage:      vehicle.mileage,
      plate:        vehicle.plate,
      status:       vehicle.status || 'No open jobs',
      recommendation: vehicle.recommendation,
    })
    .eq('id', id)
    .in('shop_id', getShopIds())
    .select()
    .single();
  if (error) throw error;
  return toVehicle(data);
}

export async function updateVehicleServiceRecord(
  id: string,
  fields: Partial<{
    status: string;
    assignedTech: string;
    dateReceived: string | null;
    make: string;
    model: string;
    year: string;
    vin: string;
    plate: string;
    fuelType: string;
    issues: string;
    damageIntake: string;
    issuesResolved: boolean;
    partsExchanged: string;
    partsNeeded: string;
    flatRateLak: number | null;
    imageIds: string[];
    techPayEntries: string;
    recommendation: string;
  }>
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (fields.status          !== undefined) payload.status          = fields.status;
  if (fields.recommendation  !== undefined) payload.recommendation  = fields.recommendation;
  if (fields.assignedTech    !== undefined) payload.assigned_tech   = fields.assignedTech;
  if (fields.dateReceived  !== undefined) payload.date_received   = fields.dateReceived;
  if (fields.make          !== undefined) payload.make            = fields.make;
  if (fields.model         !== undefined) payload.model           = fields.model;
  if (fields.year          !== undefined) payload.year            = fields.year;
  if (fields.vin           !== undefined) payload.vin             = fields.vin;
  if (fields.plate         !== undefined) payload.plate           = fields.plate;
  if (fields.fuelType      !== undefined) payload.fuel_type       = fields.fuelType;
  if (fields.issues        !== undefined) payload.issues          = fields.issues;
  if (fields.damageIntake  !== undefined) payload.damage_intake   = fields.damageIntake;
  if (fields.issuesResolved!== undefined) payload.issues_resolved = fields.issuesResolved;
  if (fields.partsExchanged!== undefined) payload.parts_exchanged = fields.partsExchanged;
  if (fields.partsNeeded   !== undefined) payload.parts_needed    = fields.partsNeeded;
  if (fields.flatRateLak   !== undefined) payload.flat_rate_lak   = fields.flatRateLak;
  if (fields.imageIds      !== undefined) payload.image_ids       = fields.imageIds;
  if (fields.techPayEntries!== undefined) payload.tech_pay_entries= fields.techPayEntries;
  // count, not just error: an update matching zero rows reports success, so a
  // save that changed nothing would look identical to one that worked.
  const { error, count } = await supabase
    .from('vehicles')
    .update(payload, { count: 'exact' })
    .eq('id', id)
    .in('shop_id', getShopIds());
  if (error) throw error;
  if (count === 0) {
    throw new Error('The vehicle was not saved — no matching record was found. It may belong to a different location, or your account may not have permission to change it.');
  }
}

export async function transferVehicle(id: string, targetShopId: string): Promise<void> {
  const { error } = await supabase
    .from('vehicles')
    .update({ shop_id: targetShopId })
    .eq('id', id)
    .in('shop_id', getShopIds());
  if (error) throw error;
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase
    .from('vehicles')
    .delete()
    .eq('id', id)
    .in('shop_id', getShopIds());
  if (error) throw error;
}

export async function fetchCustomerNames(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name')
    .in('shop_id', getShopIds())
    .order('name');
  if (error) throw error;
  return data ?? [];
}
