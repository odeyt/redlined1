/**
 * The quality panel is mounted, and applying a suggestion is not silently
 * undone by the form it is mounted inside.
 *
 * The sync rule is RUN here rather than grepped. The mount itself can only be
 * asserted against source — `VehiclesView.tsx` is a 2700-line component and
 * this repo has no React rendering harness — so the two techniques are used
 * for the two different jobs, and the risky half is the one that executes.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { applyEnrichedFieldsToForm } from '../enrichmentSync';

/** The drawer's form shape, reduced to what matters here. */
interface Form {
  id: string;
  label: string;
  engine: string;
  fuelType: string;
  mileage: string;
}

const form = (): Form => ({
  id: 'v1', label: 'Corolla', engine: '', fuelType: '', mileage: '120000',
});

describe('an applied enrichment reaches the open form', () => {
  /**
   * THE regression.
   *
   * Enrichment writes `fuelType` to the database. The drawer holds its own
   * copy from when it opened and sends that copy on Save. If this does not
   * fold the change in, Save writes the stale value back and the enrichment
   * is gone — with the panel having correctly reported success.
   */
  it('folds in a field the form also edits', () => {
    const next = applyEnrichedFieldsToForm(form(), [{ field: 'fuelType', after: 'Diesel' }]);
    expect(next.fuelType).toBe('Diesel');
  });

  it('leaves every other field exactly as the technician left it', () => {
    // Re-reading the whole vehicle would have fixed fuelType and thrown away
    // an unsaved mileage correction. This must not.
    const edited = { ...form(), mileage: '999999', label: 'renamed but unsaved' };
    const next = applyEnrichedFieldsToForm(edited, [{ field: 'fuelType', after: 'Petrol' }]);
    expect(next.mileage).toBe('999999');
    expect(next.label).toBe('renamed but unsaved');
    expect(next.engine).toBe('');
  });

  it('applies several fields at once', () => {
    const next = applyEnrichedFieldsToForm(form(), [
      { field: 'fuelType', after: 'Diesel' },
      { field: 'engine', after: 'OM 642' },
    ]);
    expect(next.fuelType).toBe('Diesel');
    expect(next.engine).toBe('OM 642');
  });
});

describe('it does not invent fields the form does not hold', () => {
  /**
   * `engineCode`, `displacementL` and `cylinders` are enrichable but have no
   * input in the drawer. The form object is sent to an UPDATE, so adding keys
   * to it means a write starts carrying columns nobody meant to touch.
   */
  it('ignores enrichable fields with no input in this form', () => {
    const next = applyEnrichedFieldsToForm(form(), [
      { field: 'engineCode', after: 'OM642' },
      { field: 'displacementL', after: 3.0 },
      { field: 'cylinders', after: 6 },
    ]);
    expect(next).not.toHaveProperty('engineCode');
    expect(next).not.toHaveProperty('displacementL');
    expect(next).not.toHaveProperty('cylinders');
  });

  it('returns the same object when nothing applies, so no render is forced', () => {
    const f = form();
    expect(applyEnrichedFieldsToForm(f, [])).toBe(f);
    expect(applyEnrichedFieldsToForm(f, [{ field: 'engineCode', after: 'X' }])).toBe(f);
  });

  it('still applies the known fields when unknown ones are mixed in', () => {
    const next = applyEnrichedFieldsToForm(form(), [
      { field: 'cylinders', after: 6 },
      { field: 'fuelType', after: 'Hybrid' },
    ]);
    expect(next.fuelType).toBe('Hybrid');
    expect(next).not.toHaveProperty('cylinders');
  });
});

describe('null does not break a controlled input', () => {
  it('becomes an empty string rather than null', () => {
    // A null value flips a controlled input to uncontrolled. React warns in
    // the console, which nobody in a workshop is reading, and the field
    // stops tracking its own state.
    const next = applyEnrichedFieldsToForm(form(), [{ field: 'fuelType', after: null }]);
    expect(next.fuelType).toBe('');
    expect(next.fuelType).not.toBeNull();
  });
});

describe('the panel is actually mounted', () => {
  /**
   * It was built, tested and deployed in M-PARTS2C.4 and rendered nowhere for
   * a week. A component with no mount point is not a feature, and nothing in
   * the suite noticed, because every test it had asserted its own source.
   */
  const VIEW = readFileSync(
    join(process.cwd(), 'features/vehicles/VehiclesView.tsx'), 'utf8');

  it('is imported and rendered by the vehicle drawer', () => {
    expect(VIEW).toContain("from '@/features/vehicles/VehicleQualityPanel'");
    expect(VIEW).toContain('<VehicleQualityPanel');
  });

  it('is given the active shop and the drawer\'s own vehicle', () => {
    const mount = VIEW.slice(VIEW.indexOf('<VehicleQualityPanel'));
    expect(mount).toContain('shopId={drawerShopId}');
    expect(mount).toContain('vehicleId={vehicle.id}');
  });

  it('wires the applied callback to the form sync', () => {
    // Mounting it without this is the silent-undo bug above.
    const mount = VIEW.slice(VIEW.indexOf('<VehicleQualityPanel'));
    expect(mount).toContain('onApplied={syncEnrichedFields}');
    expect(VIEW).toContain('applyEnrichedFieldsToForm(prev, applied)');
  });
});
