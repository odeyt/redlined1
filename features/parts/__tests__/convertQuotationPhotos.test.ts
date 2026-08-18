/**
 * Converting a parts quotation must not strand its photos.
 *
 * Images are keyed on (entity_type, entity_id). The conversion creates a new
 * order row with a new id and deletes the quotation, so photos that are not
 * moved first end up pointing at an id that no longer exists — the rows and
 * the storage objects survive, and nothing displays them. Reported from a
 * shop as "redline erased all the pictures".
 *
 * Asserted against the source rather than by rendering: the ordering is the
 * whole property, and a render test that mounted the view would pass whether
 * or not the two calls happened in the right sequence.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SOURCE = readFileSync(
  join(process.cwd(), 'features/parts/PartsEstimatesView.tsx'),
  'utf8',
);

describe('parts quotation → parts order', () => {
  it('moves the photos across', () => {
    expect(SOURCE).toMatch(/reassignEntityImages\('parts_estimate', e\.id, 'parts_order', order\.id\)/);
  });

  it('moves them before deleting the quotation, not after', () => {
    // After the delete there is no record to move them from, and no way to
    // work out where they belonged.
    const reassign = SOURCE.indexOf('reassignEntityImages(');
    const remove = SOURCE.indexOf('await deletePartsEstimate(e.id)');
    expect(reassign).toBeGreaterThan(-1);
    expect(remove).toBeGreaterThan(-1);
    expect(reassign).toBeLessThan(remove);
  });

  it('keeps the quotation when the photos cannot be moved', () => {
    // The order exists either way. Deleting the quotation after a failed move
    // would strand the photos permanently; keeping it leaves both visible.
    const between = SOURCE.slice(
      SOURCE.indexOf('reassignEntityImages('),
      SOURCE.indexOf('await deletePartsEstimate(e.id)'),
    );
    expect(between).toMatch(/catch/);
    expect(between).toMatch(/return;/);
  });
});
