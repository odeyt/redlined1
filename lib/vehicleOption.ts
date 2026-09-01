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

/** Comparison form: case and punctuation carry no identity here. */
const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Whether `name` already states `detail`, so appending it would repeat it.
 *
 * Compares WHOLE TOKENS, not substrings. A substring test drops a short plate
 * that merely happens to sit inside a longer word — plate "11" inside "2011
 * Toyota Camry" — and losing a real plate is worse than showing a repeated
 * one. Tokens are split on punctuation so "#0919" and "0919" are the same
 * token, which is exactly the shape this data comes in.
 */
function alreadyStated(name: string, detail: string): boolean {
  const target = normalise(detail);
  // A detail that normalises to nothing — "#", "--" — carries no information
  // to repeat or to add.
  if (!target) return true;
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).includes(target);
}

/**
 * What the option shows. Kept beside the value so the two cannot drift —
 * a dropdown whose text and value disagree is how the original bug hid.
 *
 * ## Why the detail is sometimes omitted
 *
 * Reported from production: the vehicle dropdown read "Hyundai Starex #0919 ·
 * #0919". Shops name a vehicle by its plate — "Ford Ranger #1268", "Toyota
 * Land cruiser # 3434" — so appending the plate repeats what the label
 * already says. 13 of this shop's 121 named vehicles read that way.
 *
 * The detail is NOT simply dropped. The other 108 have a label that says
 * nothing about the plate or VIN, and there the detail is the only thing
 * telling two "Toyota Hilux" apart. So it is omitted only when the label
 * already contains it.
 */
export function vehicleOptionLabel(v: VehicleOptionLike): string {
  const name = v.label?.trim();
  const detail = v.vin?.trim() || v.plate?.trim();
  if (name && detail && !alreadyStated(name, detail)) return `${name} · ${detail}`;
  return name || detail || 'Unnamed vehicle';
}
