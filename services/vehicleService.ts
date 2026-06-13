import { supabase } from '@/lib/supabase';
import { getShopId } from '@/lib/shopStore';
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
};

function toVehicle(row: VehicleRow): Vehicle & { id: string } {
  return {
    id: row.id,
    customerId: row.customer_id,
    vin: row.vin ?? '',
    label: row.label ?? '',
    trim: row.trim ?? '',
    engine: row.engine ?? '',
    transmission: row.transmission ?? '',
    mileage: row.mileage ?? '',
    plate: row.plate ?? '',
    status: row.status ?? '',
    recommendation: row.recommendation ?? '',
  };
}

export async function fetchVehicles() {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('shop_id', getShopId())
    .order('label');
  if (error) throw error;
  return (data ?? []).map(toVehicle);
}

export async function saveVehicle(vehicle: Omit<Vehicle, 'customerId'> & { customerId: string }) {
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      shop_id: getShopId(),
      customer_id: vehicle.customerId,
      vin: vehicle.vin,
      label: vehicle.label,
      trim: vehicle.trim,
      engine: vehicle.engine,
      transmission: vehicle.transmission,
      mileage: vehicle.mileage,
      plate: vehicle.plate,
      status: vehicle.status || 'No open jobs',
      recommendation: vehicle.recommendation,
    })
    .select()
    .single();
  if (error) throw error;
  return toVehicle(data);
}

export async function fetchCustomerNames(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name')
    .eq('shop_id', getShopId())
    .order('name');
  if (error) throw error;
  return data ?? [];
}
