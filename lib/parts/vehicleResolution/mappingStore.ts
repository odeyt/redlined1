import 'server-only';

/**
 * Reading and writing the persisted vehicle mapping.
 *
 * ## Two layers of tenancy, and the application layer is the real one
 *
 * RLS scopes what a MEMBER SESSION can read. Everything here runs as
 * `service_role`, which bypasses RLS entirely — so RLS is the second line and
 * the checks in this file are the first. Every function takes a `shopId` and
 * every query filters on it; nothing accepts a vehicle id alone.
 *
 * That is not belt-and-braces, it is the actual boundary. A server route that
 * forgot to pass the caller's shop would otherwise read another shop's
 * mapping quite happily.
 *
 * ## Why a technician's confirmation outranks a computed one
 *
 * A resolver match is an inference from make, model and year. A confirmation
 * is a person who looked at the car. Both are stored, and the confirmation
 * carries who and when, so a wrong mapping can be traced to a decision rather
 * than to an algorithm nobody can question.
 */
import { getAdminDb } from '@/lib/supabaseServer';
import { logger } from '@/lib/logger';
import type { ProviderVehicleResolution, VehicleResolutionEvidence } from './types';

export interface StoredMapping {
  vehicle_fingerprint: string;
  provider_vehicle_id: number | null;
  provider_manufacturer_id: number | null;
  provider_model_id: number | null;
  provider_manufacturer_name: string | null;
  provider_model_name: string | null;
  provider_modification_desc: string | null;
  resolution_status: string;
  confirmed_by_user_id: string | null;
  confirmed_at: string | null;
}

/**
 * The mapping for one vehicle, scoped to the shop that asked.
 *
 * Returns null rather than throwing: a missing mapping is the normal first
 * case, not an error, and a database hiccup must not stop a parts search that
 * can still resolve from scratch.
 */
export async function readMapping(
  shopId: string,
  vehicleId: string,
): Promise<StoredMapping | null> {
  if (!shopId || !vehicleId) return null;
  try {
    const { data } = await getAdminDb()
      .from('parts_provider_vehicle_mappings')
      .select('vehicle_fingerprint, provider_vehicle_id, provider_manufacturer_id, '
        + 'provider_model_id, provider_manufacturer_name, provider_model_name, '
        + 'provider_modification_desc, resolution_status, confirmed_by_user_id, confirmed_at')
      .eq('shop_id', shopId)          // the boundary, not an optimisation
      .eq('vehicle_id', vehicleId)
      .eq('provider', 'autopartsapi')
      .maybeSingle();
    return (data as StoredMapping | null) ?? null;
  } catch (err) {
    logger.warn('parts.mapping.read_failed', {
      reason: err instanceof Error ? err.message.slice(0, 80) : 'unknown',
    });
    return null;
  }
}

/** Confirm the vehicle belongs to this shop before anything is written for it. */
export async function vehicleBelongsToShop(shopId: string, vehicleId: string): Promise<boolean> {
  if (!shopId || !vehicleId) return false;
  const { data } = await getAdminDb()
    .from('vehicles')
    .select('id')
    .eq('id', vehicleId)
    .eq('shop_id', shopId)
    .maybeSingle();
  return Boolean(data);
}

export interface WriteMappingInput {
  shopId: string;
  vehicleId: string;
  resolution: ProviderVehicleResolution;
  /** Present only when a person chose the variant. */
  confirmedByUserId?: string;
}

/**
 * Upsert the mapping for a (shop, vehicle).
 *
 * One live mapping per pair, enforced by a unique index — a re-resolution
 * replaces rather than accumulating rows nobody can choose between.
 *
 * REFUSES when the vehicle is not this shop's. The caller has already checked
 * membership; this checks the vehicle, which is the part a route is most
 * likely to take on trust from a request body.
 */
export async function writeMapping(input: WriteMappingInput): Promise<boolean> {
  const { shopId, vehicleId, resolution } = input;

  if (!await vehicleBelongsToShop(shopId, vehicleId)) {
    logger.warn('parts.mapping.write_refused_foreign_vehicle', { shopId });
    return false;
  }

  const evidence: VehicleResolutionEvidence[] = resolution.evidence ?? [];

  try {
    const { error } = await getAdminDb()
      .from('parts_provider_vehicle_mappings')
      .upsert({
        shop_id: shopId,
        vehicle_id: vehicleId,
        provider: 'autopartsapi',
        provider_type_id: resolution.typeId ?? null,
        provider_manufacturer_id: resolution.manufacturerId ?? null,
        provider_model_id: resolution.modelId ?? null,
        provider_vehicle_id: resolution.vehicleId ?? null,
        provider_manufacturer_name: resolution.manufacturerName ?? null,
        provider_model_name: resolution.modelName ?? null,
        provider_modification_desc: resolution.modificationDescription ?? null,
        resolution_status: resolution.resolutionStatus,
        resolution_evidence: evidence,
        vehicle_fingerprint: resolution.fingerprint,
        confirmed_by_user_id: input.confirmedByUserId ?? null,
        confirmed_at: input.confirmedByUserId ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'shop_id,vehicle_id,provider' });

    if (error) {
      logger.warn('parts.mapping.write_failed', { code: error.code });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('parts.mapping.write_failed', {
      reason: err instanceof Error ? err.message.slice(0, 80) : 'unknown',
    });
    return false;
  }
}

/**
 * Whether a browser-supplied provider vehicle id is one the resolver actually
 * offered for this vehicle.
 *
 * §15: a `providerVehicleId` from a request body is untrusted. Accepting one
 * because it is an integer would let a caller pin any vehicle to any
 * catalogue variant — and a confirmed mapping is the strongest evidence in
 * the fitment chain, so forging one forges VERIFIED FIT.
 */
export function candidateWasOffered(
  providerVehicleId: unknown,
  offered: Array<{ vehicleId: number }>,
): boolean {
  // A NUMBER, not something that coerces to one. `Number('101')` is 101, and
  // accepting that would mean this guard's answer depends on whoever called
  // it having validated first. It is the last line before a mapping is
  // written, so it assumes nothing about its caller.
  if (typeof providerVehicleId !== 'number') return false;
  if (!Number.isInteger(providerVehicleId) || providerVehicleId <= 0) return false;
  return offered.some(c => c.vehicleId === providerVehicleId);
}
