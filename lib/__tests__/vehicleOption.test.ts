/**
 * A vehicle with no label must still be selectable.
 *
 * Reported from an Android phone on the inspection form: the only vehicle on
 * file could not be chosen. It had a VIN and nothing else, so its label was
 * empty, and every vehicle dropdown in the app rendered `value={v.label}`.
 * An empty label means `<option value="">` — the same value as the
 * "— select vehicle —" placeholder. Choosing it set the field to '', the
 * controlled select reverted, and the vehicle was unselectable by
 * construction.
 *
 * VIN-first intake makes label-less vehicles ordinary, not an edge case: the
 * guided flow records a VIN before anyone types a year or model.
 */
import { vehicleOptionValue, vehicleOptionLabel } from '../vehicleOption';

const VIN = 'ALALSKDJJDDHDHKJU';

describe('vehicleOptionValue', () => {
  it('never returns an empty string, which is what collided with the placeholder', () => {
    const cases = [
      { id: 'v1' },
      { id: 'v1', label: '' },
      { id: 'v1', label: '   ' },
      { id: 'v1', label: null, vin: null, plate: null },
    ];
    for (const v of cases) {
      expect(vehicleOptionValue(v).length).toBeGreaterThan(0);
    }
  });

  it('prefers the label when there is one', () => {
    expect(vehicleOptionValue({ id: 'v1', label: '2020 Toyota Camry', vin: VIN }))
      .toBe('2020 Toyota Camry');
  });

  it('falls back to the VIN — the reported case', () => {
    expect(vehicleOptionValue({ id: 'v1', label: '', vin: VIN })).toBe(VIN);
  });

  it('falls back to the plate when there is no VIN either', () => {
    expect(vehicleOptionValue({ id: 'v1', label: '', vin: '', plate: 'ABC-123' })).toBe('ABC-123');
  });

  it('falls back to the id when the vehicle has nothing else', () => {
    // Opaque, but never empty and never ambiguous.
    expect(vehicleOptionValue({ id: 'v1', label: '', vin: '', plate: '' })).toBe('v1');
  });

  it('ignores whitespace-only values', () => {
    expect(vehicleOptionValue({ id: 'v1', label: '  ', vin: `  ${VIN}  ` })).toBe(VIN);
  });
});

describe('vehicleOptionLabel', () => {
  it('shows the name and the identifying detail together', () => {
    expect(vehicleOptionLabel({ id: 'v1', label: '2020 Camry', vin: VIN }))
      .toBe(`2020 Camry · ${VIN}`);
  });

  it('does not render a leading separator when the name is missing', () => {
    // The bug was visible in the screenshot as "· ALALSKDJJDDHDHKJU" — a
    // dangling separator was the clue that the label was empty.
    expect(vehicleOptionLabel({ id: 'v1', label: '', vin: VIN })).toBe(VIN);
    expect(vehicleOptionLabel({ id: 'v1', label: '', vin: VIN })).not.toMatch(/^\s*·/);
  });

  it('never renders an empty option', () => {
    expect(vehicleOptionLabel({ id: 'v1' })).toBe('Unnamed vehicle');
  });
});

describe('round trip: what is shown can be found again', () => {
  it('a value selected from the list matches exactly one vehicle', () => {
    // This is what the onChange handler does to resolve the VIN.
    const vehicles = [
      { id: 'v1', label: '2020 Camry', vin: 'AAA' },
      { id: 'v2', label: '', vin: VIN },
      { id: 'v3', label: '', vin: '', plate: 'XYZ-9' },
    ];
    for (const v of vehicles) {
      const chosen = vehicleOptionValue(v);
      const found = vehicles.filter(x => vehicleOptionValue(x) === chosen);
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(v.id);
    }
  });
});
