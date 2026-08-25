/**
 * When a search may be scoped to the vehicle.
 *
 * Extracted from the route so the decision can be tested directly rather than
 * inferred from the shape of an if-statement. Two conditions, and both exist
 * to stop us answering a question nobody asked:
 *
 *   1. The technician searched by DESCRIPTION. An OEM or part-number search
 *      already has a better path — `oem_search` answers identity directly —
 *      and running both spends two provider calls to answer one question.
 *
 *   2. The vehicle is PINNED to exactly one catalogue variant. `ambiguous`
 *      means several legitimate candidates survived; scoping a search to one
 *      of them would be choosing on the technician's behalf and then
 *      presenting the consequence as fact.
 */
import type { ProviderVehicleResolution } from '../vehicleResolution/types';

export interface VehicleFirstGateInput {
  oemNumber?: string;
  manufacturerPartNumber?: string;
}

/**
 * Returns the provider vehicle id to scope by, or `undefined` to leave the
 * search unscoped. Returning the id rather than a boolean means the caller
 * cannot pass the gate and then use a different vehicle.
 */
export function vehicleFirstTarget(
  input: VehicleFirstGateInput,
  resolution?: Pick<ProviderVehicleResolution, 'resolutionStatus' | 'vehicleId'>,
): number | undefined {
  if (input.oemNumber || input.manufacturerPartNumber) return undefined;
  if (!resolution || resolution.resolutionStatus !== 'resolved') return undefined;

  const id = resolution.vehicleId;
  // A provider id of 0 is what the variant reader falls back to when a row
  // carries no usable id. It is not a vehicle.
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return undefined;
  return id;
}
