/**
 * What choosing a vehicle should fill in, everywhere it is chosen.
 *
 * ## The complaint
 *
 * "When adding customer or vehicles, all equivalent info should autopopulate
 * into job card, inspection, repair order, and parts quote."
 *
 * Every one of those four screens already had a vehicle picker, and every one
 * filled in a different, partial subset:
 *
 *     Job Cards      engine and mileage — needed for the oil suggestion
 *     Inspections    the VIN, and nothing else
 *     Repair Orders  nothing
 *     Parts Quotes   nothing
 *
 * and not one of them filled in the OWNER, which is the field a technician
 * types most often and the one the vehicle already knows.
 *
 * Four screens solving the same problem four ways is how they stay
 * inconsistent: fixing the one someone complains about leaves the other three,
 * and the next screen added starts from nothing again. So the rule is decided
 * once, here, and each screen applies the fields it actually has.
 *
 * ## It never overwrites something already filled in
 *
 * A technician who has typed a customer, or corrected a mileage, must not have
 * it replaced because they then picked the vehicle. Autofill is for EMPTY
 * fields — see `fillBlanks`. The one exception is the vehicle itself, which is
 * what was just chosen.
 *
 * That rule is what makes this safe to apply on every screen without knowing
 * what the technician was in the middle of.
 */

/** The vehicle fields any of these screens might want. */
export interface AutofillVehicle {
  id?: string | null;
  label?: string | null;
  vin?: string | null;
  plate?: string | null;
  make?: string | null;
  model?: string | null;
  year?: string | number | null;
  engine?: string | null;
  mileage?: string | number | null;
  customerId?: string | null;
}

export interface AutofillCustomer {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** Everything a chosen vehicle knows, flattened to the names the forms use. */
export interface VehicleAutofill {
  vin: string;
  plate: string;
  make: string;
  model: string;
  year: string;
  engine: string;
  mileage: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

const str = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).trim();

/**
 * The values a chosen vehicle implies, including its owner's details.
 *
 * Returns every field as a string, blank where the vehicle does not know it —
 * so a caller can treat "" uniformly as "nothing to offer" without checking
 * for null, undefined and NaN separately.
 */
export function vehicleAutofill(
  vehicle: AutofillVehicle | null | undefined,
  customers: readonly AutofillCustomer[] | null | undefined,
): VehicleAutofill {
  const owner = vehicle?.customerId
    ? (customers ?? []).find(c => c?.id === vehicle.customerId)
    : undefined;

  return {
    vin: str(vehicle?.vin),
    plate: str(vehicle?.plate),
    make: str(vehicle?.make),
    model: str(vehicle?.model),
    year: str(vehicle?.year),
    engine: str(vehicle?.engine),
    mileage: str(vehicle?.mileage),
    // The owner id is worth carrying even when the customer record is not
    // loaded: it still links the record correctly, and the name can be
    // resolved later.
    customerId: str(vehicle?.customerId),
    customerName: str(owner?.name),
    customerPhone: str(owner?.phone),
    customerEmail: str(owner?.email),
  };
}

/**
 * Merge autofill into a form WITHOUT overwriting anything already there.
 *
 * Only keys present in `current` are considered, so a screen that has no
 * `mileage` field does not grow one, and only blank values are replaced. A
 * technician's half-finished entry survives picking a vehicle.
 *
 * Returns the ORIGINAL object when nothing would change, so a caller passing
 * this to setState does not force a render for an empty result.
 */
export function fillBlanks<T extends Record<string, unknown>>(
  current: T,
  autofill: Partial<Record<keyof T & string, string>>,
): T {
  let changed = false;
  const next = { ...current };

  for (const [key, value] of Object.entries(autofill)) {
    if (!value) continue;                       // nothing to offer
    if (!(key in current)) continue;            // this screen has no such field
    const existing = current[key];
    // Blank means unset: '', null, undefined. A 0 is a real value a technician
    // may have typed — a mileage of 0 on a new car is not "empty".
    const isBlank = existing === '' || existing === null || existing === undefined;
    if (!isBlank) continue;
    (next as Record<string, unknown>)[key] = value;
    changed = true;
  }

  return changed ? next : current;
}
