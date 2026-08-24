/**
 * What makes a cached provider vehicle id still valid.
 *
 * A mapping is not "this Redlined1 row → that provider id". It is "this
 * DESCRIPTION of a vehicle → that provider id". Change the engine and it is a
 * different vehicle to a parts catalogue, however unchanged the row id is —
 * so the fingerprint covers the attributes that actually steer resolution and
 * nothing else.
 *
 * Mileage, plate, status, owner and notes are deliberately excluded: they
 * change constantly and none of them changes which parts fit. Including them
 * would throw away a good mapping every time somebody recorded a service.
 */
import { createHash } from 'crypto';
import type { CanonicalVehicle } from './types';

/**
 * The attributes that steer resolution, in a fixed order.
 *
 * VIN is in here even though it is not used for matching yet: if a VIN is
 * corrected, the vehicle's identity has changed and a mapping resolved from
 * the old one should not be trusted.
 */
export const FINGERPRINT_FIELDS = [
  'vin', 'year', 'make', 'model', 'trim', 'engine', 'transmission', 'fuelType',
] as const;

function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    // Punctuation carries no meaning here: "Mercedes-Benz" and "Mercedes Benz"
    // are the same vehicle and must not invalidate each other's mapping.
    .replace(/[^a-z0-9]/g, '');
}

/** The canonical string a fingerprint is taken over. Exported for tests. */
export function fingerprintSource(vehicle: CanonicalVehicle): string {
  return FINGERPRINT_FIELDS
    .map(f => `${f}=${normalize((vehicle as unknown as Record<string, unknown>)[f])}`)
    .join('|');
}

/**
 * A short, stable hash. Compared, never parsed.
 *
 * sha256 truncated to 16 hex characters — this identifies a cache row, it does
 * not protect anything, and a shorter value keeps the mapping table readable
 * when someone is debugging why a vehicle re-resolved.
 */
export function vehicleFingerprint(vehicle: CanonicalVehicle): string {
  return createHash('sha256').update(fingerprintSource(vehicle)).digest('hex').slice(0, 16);
}

/** True when a cached mapping no longer describes this vehicle. */
export function isStale(cachedFingerprint: string, vehicle: CanonicalVehicle): boolean {
  return cachedFingerprint !== vehicleFingerprint(vehicle);
}

/**
 * Whether Redlined1 holds enough to attempt resolution at all.
 *
 * Make and model are the floor: without both there is nothing to look up, and
 * asking the provider anyway would spend a call to be told so. Year is not
 * required here — it narrows modifications later, and a vehicle with no year
 * can still resolve a manufacturer and model, which is worth doing.
 */
export function hasEnoughToResolve(vehicle: CanonicalVehicle): boolean {
  return Boolean(String(vehicle.make ?? '').trim() && String(vehicle.model ?? '').trim());
}
