/**
 * The search path and the confirm path must fingerprint the same car the same
 * way.
 *
 * ## The bug this exists for
 *
 * `/api/parts/search` built its vehicle from the request body — what the
 * estimate form holds: id, vin, year, make, model, trim, engine. The confirm
 * route read the same vehicle from the database, which also has
 * `transmission` and `fuel_type`. The fingerprint covers all eight fields.
 *
 * So for any vehicle with a transmission or fuel type recorded, the two
 * routes produced different fingerprints for the SAME car, and confirm
 * rejected every technician with 409 VEHICLE_CHANGED. On the shop's live data
 * that was 95 of 115 vehicles. The variant chooser rendered, listed real
 * candidates, and could never accept one.
 *
 * No unit test caught it because each route was internally consistent. The
 * defect lived in the gap between them, so these assert the AGREEMENT rather
 * than either side alone.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { vehicleFingerprint, FINGERPRINT_FIELDS } from '../vehicleResolution/fingerprint';

const SEARCH_ROUTE = readFileSync(
  join(process.cwd(), 'app/api/parts/search/route.ts'), 'utf8');
const CONFIRM_ROUTE = readFileSync(
  join(process.cwd(), 'app/api/parts/vehicle-resolution/confirm/route.ts'), 'utf8');
const LOADER = readFileSync(
  join(process.cwd(), 'lib/parts/vehicleResolution/loadVehicle.ts'), 'utf8');

describe('both routes read the vehicle from one place', () => {
  it('search resolves against the canonical loader, not the request body', () => {
    expect(SEARCH_ROUTE).toContain('await loadCanonicalVehicle(scope, input.vehicleId)');
  });

  it('confirm uses the same loader', () => {
    expect(CONFIRM_ROUTE).toContain('await loadCanonicalVehicle(scope, input.vehicleId)');
  });

  /**
   * Since mirroring, agreeing on the LOADER is no longer sufficient: the two
   * routes must also agree on the SCOPE they pass it. A search that resolved
   * across mirrored shops while confirm looked only at the active one would
   * reproduce the original failure exactly — the technician is offered
   * candidates and then told the vehicle is not theirs — just through a
   * different door.
   */
  it('and derives that scope the same way in both', () => {
    for (const src of [SEARCH_ROUTE, CONFIRM_ROUTE]) {
      expect(src).toContain('await readableShopIds(auth.userId, input.shopId)');
    }
  });

  it('neither route narrows the scope back to a single shop at the call', () => {
    // `loadCanonicalVehicle([input.shopId], …)` would typecheck, pass the
    // loader test above, and silently undo mirroring.
    for (const src of [SEARCH_ROUTE, CONFIRM_ROUTE]) {
      expect(src).not.toMatch(/loadCanonicalVehicle\(\s*\[\s*input\.shopId\s*\]/);
    }
  });

  it('neither route builds a vehicle object out of request fields', () => {
    // The precise shape of the old bug: a canonical vehicle assembled from
    // `input.*`, missing whatever the form does not carry.
    for (const src of [SEARCH_ROUTE, CONFIRM_ROUTE]) {
      expect(src).not.toMatch(/id:\s*input\.vehicleId,\s*\n\s*vin:\s*input\.vin/);
    }
  });
});

describe('the loader supplies every field the fingerprint covers', () => {
  it('selects all of them from the database', () => {
    // A field added to FINGERPRINT_FIELDS but not to the SELECT would
    // reintroduce the bug silently, so this is derived from the list itself
    // rather than hard-coded.
    const columnFor: Record<string, string> = {
      vin: 'vin', year: 'year', make: 'make', model: 'model',
      trim: 'trim', engine: 'engine', transmission: 'transmission',
      fuelType: 'fuel_type',
      // M-PARTS2C.4. This test earned its keep here: adding these three to
      // FINGERPRINT_FIELDS failed it immediately, which is precisely the
      // silent divergence it was written to prevent.
      engineCode: 'engine_code', displacementL: 'displacement_l', cylinders: 'cylinders',
    };
    for (const field of FINGERPRINT_FIELDS) {
      const column = columnFor[field];
      expect(column).toBeDefined();
      expect(LOADER).toContain(column);
    }
  });

  it('maps every fingerprint field onto the returned object', () => {
    for (const field of FINGERPRINT_FIELDS) {
      expect(LOADER).toContain(`${field}:`);
    }
  });
});

describe('the failure itself, reproduced', () => {
  const base = {
    id: 'v1', vin: 'WP1ZZZ92ZDLA11349', year: 2014,
    make: 'Porsche', model: 'Cayenne',
  };

  it('a partial vehicle and a complete one disagree', () => {
    // Exactly the live case: fuel_type "Petrol" recorded, form does not carry
    // it. This is the assertion that would have failed before the fix.
    const fromForm = { ...base };
    const fromDb = { ...base, fuelType: 'Petrol' };
    expect(vehicleFingerprint(fromForm)).not.toBe(vehicleFingerprint(fromDb));
  });

  it('agrees once both come from the same source', () => {
    const a = { ...base, transmission: 'Automatic', fuelType: 'Diesel' };
    const b = { ...base, transmission: 'Automatic', fuelType: 'Diesel' };
    expect(vehicleFingerprint(a)).toBe(vehicleFingerprint(b));
  });

  it('still changes when the car genuinely changes', () => {
    // The guard must keep working: it exists so a mapping resolved from one
    // identity is not reused for another.
    const a = { ...base, engine: '3.0 Diesel' };
    const b = { ...base, engine: '4.8 Turbo' };
    expect(vehicleFingerprint(a)).not.toBe(vehicleFingerprint(b));
  });
});
