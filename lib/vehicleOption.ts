/**
 * The string a vehicle is identified by in a <select>.
 *
 * Every vehicle dropdown in the app used `value={v.label}` directly. A vehicle
 * whose label is empty — no year, make or model recorded, which happens
 * routinely on a VIN-first intake — therefore produced `<option value="">`,
 * identical to the placeholder's value. Choosing it set the field to '', the
 * controlled select snapped straight back to "— select vehicle —", and the
 * vehicle simply could not be picked. Reported from an Android phone on the
 * inspection form, where the only vehicle on file had a VIN and nothing else.
 *
 * Falling back through VIN and plate keeps the stored value human-readable,
 * which matters because these fields are written onto inspections, job cards
 * and estimates as display text rather than as a foreign key. The id is a
 * last resort: opaque, but never empty and never ambiguous.
 */
export interface VehicleOptionLike {
  id: string;
  label?: string | null;
  vin?: string | null;
  plate?: string | null;
}

export function vehicleOptionValue(v: VehicleOptionLike): string {
  return v.label?.trim() || v.vin?.trim() || v.plate?.trim() || v.id;
}

/**
 * What the option shows. Kept beside the value so the two cannot drift —
 * a dropdown whose text and value disagree is how the original bug hid.
 */
export function vehicleOptionLabel(v: VehicleOptionLike): string {
  const name = v.label?.trim();
  const detail = v.vin?.trim() || v.plate?.trim();
  if (name && detail) return `${name} · ${detail}`;
  return name || detail || 'Unnamed vehicle';
}
