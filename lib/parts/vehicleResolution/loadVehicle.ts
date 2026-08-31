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

export interface LoadedVehicle {
  vehicle: CanonicalVehicle;
  /**
   * The shop that OWNS this vehicle, which under mirroring is not necessarily
   * the shop the request was made from.
   *
   * Returned rather than assumed because everything persisted ABOUT the
   * vehicle has to be keyed to it. A mapping written under the active shop
   * instead would be wrong three ways at once: `writeMapping` re-checks
   * ownership and would refuse it outright, so resolution would silently
   * re-run on every search forever; the two branches would each burn their own
   * AutoPartsAPI calls on one car; and a technician's confirmation in one
   * branch would be invisible in the other, even though a confirmation is a
   * statement about the CAR and the car does not change when you switch
   * location.
   *
   * Handing the caller the id makes the right key the one already in scope.
   */
  ownerShopId: string;
}

/**
 * Returns null when the vehicle is in none of the given shops, which callers
 * must treat as "not authorised" rather than "not found" — the two are the
 * same answer to anyone probing for another shop's vehicle ids.
 *
 * `shopIds` is the caller's READ SCOPE: the active shop, plus any mirrored
 * shops the user themselves belongs to. Build it with `readableShopIds` and
 * never from a request body — see `lib/shops/mirrorScope.ts` for why the
 * mirror link alone is not sufficient authority.
 */
export async function loadCanonicalVehicle(
  shopIds: readonly string[],
  vehicleId: string,
): Promise<LoadedVehicle | null> {
  /**
   * Every FINGERPRINT_FIELDS column, and nothing derived.
   *
   * When M-PARTS2C.4 added engineCode, displacementL and cylinders to the
   * fingerprint, omitting them here would have recreated the exact bug this
   * file exists to prevent: two code paths fingerprinting the same car
   * differently, and confirm rejecting every technician. The fixture test
   * asserts this SELECT covers FINGERPRINT_FIELDS so the next added field
   * cannot be forgotten either.
   */
  // An empty scope must match NOTHING. PostgREST renders `.in('shop_id', [])`
  // as an always-false predicate, but relying on that would make the tenancy
  // boundary depend on a URL-encoding detail of a third-party client, so it is
  // refused here where it is legible.
  const scope = shopIds.filter(Boolean);
  if (!scope.length || !vehicleId) return null;

  const { data } = await getAdminDb()
    .from('vehicles')
    .select('id, shop_id, vin, year, make, model, trim, engine, transmission, fuel_type, '
      + 'engine_code, displacement_l, cylinders')
    .eq('id', vehicleId)
    // The tenancy boundary. `service_role` bypasses RLS, so this predicate is
    // not a filter over rows the database already restricted — it is the only
    // thing restricting them.
    .in('shop_id', scope)
    .maybeSingle();

  if (!data) return null;
  const v = data as unknown as Record<string, unknown>;

  // Belt and braces against a widened scope arriving from somewhere it should
  // not: the row's own shop must be one the caller asked for. Cheap, and the
  // alternative is that a bug in scope construction is undetectable here.
  const ownerShopId = String(v.shop_id ?? '');
  if (!scope.includes(ownerShopId)) return null;

  return {
    ownerShopId,
    vehicle: {
      id: String(v.id),
      vin: (v.vin as string) || undefined,
      year: Number(v.year) || undefined,
      make: (v.make as string) || undefined,
      model: (v.model as string) || undefined,
      trim: (v.trim as string) || undefined,
      engine: (v.engine as string) || undefined,
      transmission: (v.transmission as string) || undefined,
      fuelType: (v.fuel_type as string) || undefined,
      engineCode: (v.engine_code as string) || undefined,
      displacementL: v.displacement_l != null ? Number(v.displacement_l) : undefined,
      cylinders: v.cylinders != null ? Number(v.cylinders) : undefined,
    },
  };
}
