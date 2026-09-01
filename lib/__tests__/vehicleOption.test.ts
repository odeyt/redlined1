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

describe('it does not repeat a plate the name already states', () => {
  /**
   * Reported from production with a screenshot: the vehicle dropdown on a
   * parts quotation read "Hyundai Starex #0919 · #0919".
   *
   * Shops here name a vehicle by its plate, so the label already carries it
   * and appending it says the same thing twice. 13 of this shop's 121 named
   * vehicles read that way. The fixtures below are their real names.
   */
  it('the reported case', () => {
    expect(vehicleOptionLabel({ id: 'v1', label: 'Hyundai Starex #0919', plate: '#0919' }))
      .toBe('Hyundai Starex #0919');
  });

  it('matches however the plate happens to be punctuated', () => {
    // The column holds both '1268' and '#7002'; the label holds '#1268' and
    // '# 3434'. None of that is identity.
    const cases: Array<[string, string]> = [
      ['Ford Ranger #1268', '1268'],
      ['Geely #7002', '#7002'],
      ['Toyota Land cruiser # 3434', '3434'],
      ['Toyota Hilux Vigo #4689', '#4689'],
      ['Toyota Landcruiser #7788', '7788'],
    ];
    for (const [label, plate] of cases) {
      expect(vehicleOptionLabel({ id: 'v1', label, plate })).toBe(label);
    }
  });

  it('finds the plate even when it is not the last word', () => {
    const label = 'Honda Accord #9703  – Welkham to Laos';
    expect(vehicleOptionLabel({ id: 'v1', label, plate: '9703' })).toBe(label);
  });
});

describe('but it still shows a detail that adds something', () => {
  /**
   * The other 108. Dropping the detail wholesale would lose the only thing
   * telling two "Toyota Hilux" apart, so this is the half that must not
   * regress.
   */
  it('keeps a plate the name does not mention', () => {
    expect(vehicleOptionLabel({ id: 'v1', label: '2020 Toyota Hilux', plate: '4521' }))
      .toBe('2020 Toyota Hilux · 4521');
  });

  it('keeps a VIN the name does not mention', () => {
    expect(vehicleOptionLabel({ id: 'v1', label: '2020 Camry', vin: VIN }))
      .toBe(`2020 Camry · ${VIN}`);
  });

  it('does not mistake a plate for part of a longer number', () => {
    /**
     * Why whole tokens rather than a substring test. Plate '11' sits inside
     * '2011', and a substring check would silently drop a real plate — worse
     * than showing a repeated one, because nothing on screen would hint the
     * plate existed.
     */
    expect(vehicleOptionLabel({ id: 'v1', label: '2011 Toyota Camry', plate: '11' }))
      .toBe('2011 Toyota Camry · 11');
  });

  it('keeps a plate that differs only in its tail', () => {
    expect(vehicleOptionLabel({ id: 'v1', label: 'Ford Ranger #1268', plate: '1269' }))
      .toBe('Ford Ranger #1268 · 1269');
  });

  it('drops a detail that is only punctuation', () => {
    // '#' on its own repeats nothing and adds nothing.
    expect(vehicleOptionLabel({ id: 'v1', label: 'Ford Ranger', plate: '#' }))
      .toBe('Ford Ranger');
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
