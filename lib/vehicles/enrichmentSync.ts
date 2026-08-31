/**
 * Folding a completed enrichment back into an open edit form.
 *
 * ## The bug this exists to prevent
 *
 * `VehicleDrawer` snapshots the vehicle into local state when it opens and
 * never re-reads it. `VehicleQualityPanel`, mounted inside that drawer, writes
 * straight to the database through `/api/vehicles/quality`. One of the four
 * catalogue-enrichable fields — `fuelType` — has an input in that same form.
 *
 * So without this, the sequence is:
 *
 *   1. technician applies a fuel type from the catalogue → database updated
 *   2. panel says "Updated 1 field."
 *   3. technician presses Save on the drawer
 *   4. the drawer sends its snapshot, whose `fuelType` is still the old value
 *   5. the enrichment is gone, and nothing reported a failure
 *
 * The panel would have been telling the truth at step 2 and the record would
 * still be wrong. That is the shape of failure this codebase keeps meeting:
 * every part reports success and the outcome is still wrong.
 *
 * ## Why the applied list, rather than re-reading the vehicle
 *
 * Re-reading would also fix `fuelType`, and would discard every other edit the
 * technician had typed but not yet saved. Applying exactly the fields the
 * server reports changing touches nothing else.
 *
 * Pure, so it can be tested by running it. The drawer is a 2700-line component
 * with no rendering harness available in this repo, and a rule this quiet
 * needs to be executed rather than grepped.
 */

/** One field the server changed, and what it changed it to. */
export interface AppliedField {
  field: string;
  after: string | number | null;
}

/**
 * Returns a copy of `form` with the applied fields folded in.
 *
 * Fields the form does not already hold are IGNORED rather than added.
 * `engineCode`, `displacementL` and `cylinders` are enrichable but have no
 * input in the drawer, and inventing keys on a record that gets sent straight
 * to an UPDATE is how a write starts carrying columns nobody meant to touch.
 *
 * Returns the ORIGINAL reference when nothing applies, so a caller passing
 * this to `setState` does not trigger a render for an empty result.
 */
export function applyEnrichedFieldsToForm<T extends object>(
  form: T,
  applied: readonly AppliedField[],
): T {
  if (!applied.length) return form;

  const next = { ...form } as Record<string, unknown>;
  let touched = false;

  for (const { field, after } of applied) {
    if (!(field in form)) continue;
    // `null` becomes an empty string: these land in controlled inputs, and a
    // null value there flips the input to uncontrolled and logs a React
    // warning the technician never sees but which loses the field's state.
    next[field] = after ?? '';
    touched = true;
  }

  return touched ? (next as T) : form;
}
