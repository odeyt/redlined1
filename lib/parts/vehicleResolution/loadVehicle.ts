import 'server-only';

/**
 * The canonical vehicle, read server-side.
 *
 * ## Why this is shared rather than written twice
 *
 * It used to be written twice, and the two copies disagreed.
 *
 * `/api/parts/search` built its vehicle from the REQUEST BODY, which the
 * browser fills from the estimate form. That form carries id, vin, year,
 * make, model, trim and engine — but not `transmission` or `fuelType`.
 * `/api/parts/vehicle-resolution/confirm` read the same vehicle from the
 * database, where both columns exist.
 *
 * The fingerprint is taken over all eight fields. So for any vehicle with a
 * transmission or a fuel type recorded, the two routes computed DIFFERENT
 * fingerprints for the same car, and confirm answered every technician with
 * 409 VEHICLE_CHANGED. On this shop's data that was 95 of 115 vehicles: the
 * variant chooser rendered, listed real candidates, and could never accept
 * one.
 *
 * Nothing detected it because each route was self-consistent. Only running
 * search and confirm against each other exposes it — which is why the
 * regression test asserts the two agree rather than asserting either alone.
 *
 * Reading the vehicle here also means resolution no longer trusts the browser
 * for the fields that decide a fitment claim.
 */
import { getAdminDb } from '@/lib/supabaseServer';
import type { CanonicalVehicle } from './types';

/**
 * Returns null when the vehicle is not this shop's, which callers must treat
 * as "not authorised" rather than "not found" — the two are the same answer
 * to anyone probing for another shop's vehicle ids.
 */
export async function loadCanonicalVehicle(
  shopId: string,
  vehicleId: string,
): Promise<CanonicalVehicle | null> {
  const { data } = await getAdminDb()
    .from('vehicles')
    .select('id, vin, year, make, model, trim, engine, transmission, fuel_type')
    .eq('id', vehicleId)
    .eq('shop_id', shopId)
    .maybeSingle();

  if (!data) return null;
  const v = data as Record<string, unknown>;
  return {
    id: String(v.id),
    vin: (v.vin as string) || undefined,
    year: Number(v.year) || undefined,
    make: (v.make as string) || undefined,
    model: (v.model as string) || undefined,
    trim: (v.trim as string) || undefined,
    engine: (v.engine as string) || undefined,
    transmission: (v.transmission as string) || undefined,
    fuelType: (v.fuel_type as string) || undefined,
  };
}
