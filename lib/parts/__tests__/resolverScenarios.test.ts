/**
 * The eight scenarios that define M-PARTS2B, end to end and offline.
 *
 * Every one runs from a Redlined1 vehicle through the resolver to a fitment
 * verdict, against fixtures. Nothing here contacts AutoPartsAPI — a CI suite
 * that spent provider quota would be a suite nobody could run.
 *
 * The through-line: Redlined1 must tell the truth about what it knows.
 * Scenario B and E are the common real outcomes, and they are UNVERIFIED and
 * AMBIGUOUS. That is success, not shortfall.
 */
import { readVariants, readModels, readManufacturers } from '../vehicleResolution/resolver';
import { matchModification } from '../vehicleResolution/modification';
import { matchModel } from '../vehicleResolution/model';
import { matchManufacturer } from '../vehicleResolution/manufacturer';
import { vehicleFingerprint, isStale } from '../vehicleResolution/fingerprint';
import { normalizeApplicability, explicitExclusion } from '../vehicleResolution/applicability';
import { decideFitment, mayBeRecommended } from '../vehicleResolution/fitmentTruth';
import { quotaLevel } from '../providers/autopartsapi/telemetry';
import type { CanonicalVehicle } from '../vehicleResolution/types';

// ─── Sanitised fixtures, provider-shaped ─────────────────────────────────────

const MANUFACTURERS = [
  { manuId: 74, manuName: 'MERCEDES-BENZ' },
  { manuId: 111, manuName: 'TOYOTA' },
  { manuId: 20, manuName: 'CHRYSLER' },
  { manuId: 88, manuName: 'LEXUS' },
];

const MB_MODELS = {
  data: [
    { modelId: 9001, modelName: 'S-CLASS (W221)', yearOfConstrFrom: '200509', yearOfConstrTo: '201312' },
    { modelId: 9002, modelName: 'S-CLASS (W222)', yearOfConstrFrom: '201305', yearOfConstrTo: '202012' },
    { modelId: 9003, modelName: 'C-CLASS (W204)', yearOfConstrFrom: '200701', yearOfConstrTo: '201412' },
  ],
};

const S_CLASS_W221_VARIANTS = {
  data: [
    {
      vehicleId: 5501, typeName: 'S 500 (221.071)', yearOfConstrFrom: '200509', yearOfConstrTo: '201312',
      cylinderCapacityCcm: 5461, powerKw: 285, fuelType: 'Petrol', engineCode: 'M273.961',
    },
    {
      vehicleId: 5502, typeName: 'S 350 (221.056)', yearOfConstrFrom: '200509', yearOfConstrTo: '201312',
      cylinderCapacityCcm: 3498, powerKw: 200, fuelType: 'Petrol', engineCode: 'M272.965',
    },
    {
      vehicleId: 5503, typeName: 'S 320 CDI (221.022)', yearOfConstrFrom: '200510', yearOfConstrTo: '201312',
      cylinderCapacityCcm: 2987, powerKw: 173, fuelType: 'Diesel', engineCode: 'OM642',
    },
  ],
};

const S_CLASS: CanonicalVehicle = {
  id: 'veh-1', vin: 'WDDNG7DB0A0000000', year: 2009,
  make: 'MERCEDES-BENZ', model: 'S-Class', engine: '5.5L 8-cyl',
};

/** The same car as most of the fleet actually looks like: no engine. */
const S_CLASS_NO_ENGINE: CanonicalVehicle = {
  id: 'veh-2', year: 2009, make: 'MERCEDES-BENZ', model: 'S-Class',
};

function resolveOffline(vehicle: CanonicalVehicle) {
  const manu = matchManufacturer(vehicle.make, readManufacturers(MANUFACTURERS));
  if (manu.status !== 'matched') return { step: 'manufacturer', manu } as const;

  const model = matchModel(vehicle.model, vehicle.year, readModels(MB_MODELS));
  if (model.status !== 'matched') return { step: 'model', manu, model } as const;

  const mod = matchModification(
    { year: vehicle.year, engine: vehicle.engine, fuelType: vehicle.fuelType },
    readVariants(S_CLASS_W221_VARIANTS),
  );
  return { step: 'modification', manu, model, mod } as const;
}

describe('Scenario A — make/model/year + engine resolves to one variant', () => {
  it('reaches a single provider vehicle id', () => {
    const r = resolveOffline(S_CLASS);
    expect(r.step).toBe('modification');
    expect(r.manu.manufacturer!.id).toBe(74);
    expect(r.model!.model!.id).toBe(9001);
    expect(r.mod!.status).toBe('matched');
    expect(r.mod!.modification!.vehicleId).toBe(5501);
  });

  it('reads cubic centimetres as litres', () => {
    // 5461cc is "5.5L 8-cyl" as a service advisor typed it.
    expect(readVariants(S_CLASS_W221_VARIANTS)[0].displacementL).toBe(5.5);
  });

  it('reads the provider year format', () => {
    // "200509" is September 2005, not the year 200509.
    expect(readModels(MB_MODELS)[0].yearFrom).toBe(2005);
    expect(readModels(MB_MODELS)[0].yearTo).toBe(2013);
  });
});

describe('Scenario B — no engine recorded is AMBIGUOUS, not a guess', () => {
  it('returns every candidate rather than choosing', () => {
    // 108 of 114 production vehicles are this case.
    const r = resolveOffline(S_CLASS_NO_ENGINE);
    expect(r.mod!.status).toBe('insufficient_data');
    expect(r.mod!.candidates).toHaveLength(3);
    expect(r.mod!.modification).toBeUndefined();
  });

  it('says why, in words a technician can act on', () => {
    const r = resolveOffline(S_CLASS_NO_ENGINE);
    expect(r.mod!.detail).toContain('No engine detail is recorded');
  });
});

describe('Scenario C — a confirmed variant is reusable', () => {
  it('a stored mapping matching the fingerprint is still valid', () => {
    const stored = vehicleFingerprint(S_CLASS);
    expect(isStale(stored, S_CLASS)).toBe(false);
  });
});

describe('Scenario D — changing the engine invalidates the mapping', () => {
  it('a different engine is a different vehicle to a catalogue', () => {
    const stored = vehicleFingerprint(S_CLASS);
    expect(isStale(stored, { ...S_CLASS, engine: '3.5L V6' })).toBe(true);
  });

  it('recording mileage does not invalidate it', () => {
    // Nothing that cannot change which parts fit may throw away a mapping.
    const stored = vehicleFingerprint(S_CLASS);
    const sameCar = { ...S_CLASS } as CanonicalVehicle & { mileage?: string };
    sameCar.mileage = '184000';
    expect(isStale(stored, sameCar)).toBe(false);
  });
});

describe('Scenario E — perfect part match, unknown applicability, still UNVERIFIED', () => {
  it('is the invariant the milestone turns on', () => {
    const applicability = normalizeApplicability({ data: [{ vehicleId: 9999 }] }, 5501);
    expect(applicability.answer).toBe('unknown');

    const fit = decideFitment({
      partIdentity: 'verified_equivalent',
      vehicleResolution: 'resolved',
      applicability: applicability.answer,
    });
    expect(fit.status).not.toBe('verified');
    expect(fit.status).not.toBe('incompatible');
  });

  it('an unlisted variant is not a statement that it does not fit', () => {
    const a = normalizeApplicability({ data: [{ vehicleId: 1 }, { vehicleId: 2 }] }, 5501);
    expect(a.answer).toBe('unknown');
    expect(a.detail).toContain('does not state that list is complete');
  });

  it('applicability without a resolved vehicle is unknown however long the list', () => {
    const a = normalizeApplicability({ data: [{ vehicleId: 1 }, { vehicleId: 2 }] }, undefined);
    expect(a.answer).toBe('unknown');
    expect(a.matchedResolvedVehicle).toBe(false);
  });
});

describe('Scenario F — all three affirmatives produce VERIFIED FIT', () => {
  it('and only all three', () => {
    const a = normalizeApplicability({ data: [{ vehicleId: 5501 }, { vehicleId: 5502 }] }, 5501);
    expect(a.answer).toBe('confirmed');
    expect(a.matchedResolvedVehicle).toBe(true);

    const fit = decideFitment({
      partIdentity: 'verified_equivalent',
      vehicleResolution: 'resolved',
      applicability: a.answer,
    });
    expect(fit.status).toBe('verified');
  });

  it('drops to unverified if the vehicle was never pinned', () => {
    const fit = decideFitment({
      partIdentity: 'verified_equivalent',
      vehicleResolution: 'ambiguous',
      applicability: 'confirmed',
    });
    expect(fit.status).toBe('unverified');
  });
});

describe('Scenario G — explicit incompatibility overrides everything', () => {
  it('beats a perfect part match and a resolved vehicle', () => {
    const fit = decideFitment({
      partIdentity: 'verified_equivalent',
      vehicleResolution: 'resolved',
      applicability: explicitExclusion('Excluded for this variant').answer,
    });
    expect(fit.status).toBe('incompatible');
    expect(mayBeRecommended(fit.status)).toBe(false);
  });

  it('nothing INFERS an exclusion — it must be stated', () => {
    // No code path turns an absent vehicle into `excluded`. The only producer
    // is explicitExclusion, which nothing currently calls.
    const fs = jest.requireActual('fs') as typeof import('fs');
    const path = jest.requireActual('path') as typeof import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'lib/parts/vehicleResolution/applicability.ts'), 'utf8');
    const produced = src.match(/answer: 'excluded'/g) ?? [];
    expect(produced).toHaveLength(1);
    expect(src).toContain('export function explicitExclusion');
  });
});

describe('Scenario H — cross-marque rows earn no endorsement', () => {
  it('a Toyota catalogue row on a Mercedes stays unverified', () => {
    const fit = decideFitment({
      partIdentity: 'verified_equivalent',
      vehicleResolution: 'resolved',
      applicability: 'unknown',
      marqueContradicts: true,
    });
    expect(fit.status).toBe('unverified');
    expect(fit.reason).toContain('collide across marques');
  });

  it('the resolver never matches Toyota to Lexus', () => {
    const m = matchManufacturer('Toyota', readManufacturers(MANUFACTURERS));
    expect(m.manufacturer!.name).toBe('TOYOTA');
  });

  it('M-PARTS2A behaviour is not weakened by applicability existing', () => {
    // A contradicting marque with confirmed applicability would mean the
    // provider listed our vehicle under another marque's part — treat the
    // marque contradiction as the stronger signal and stay unverified.
    const fit = decideFitment({
      partIdentity: 'verified_equivalent',
      vehicleResolution: 'resolved',
      applicability: 'confirmed',
      marqueContradicts: true,
    });
    expect(fit.status).not.toBe('verified');
  });
});

describe('quota levels are computed from the LOCAL count', () => {
  it('crosses at 70 and 90 per cent', () => {
    expect(quotaLevel(0, 100)).toBe('normal');
    expect(quotaLevel(69, 100)).toBe('normal');
    expect(quotaLevel(70, 100)).toBe('warning');
    expect(quotaLevel(89, 100)).toBe('warning');
    expect(quotaLevel(90, 100)).toBe('critical');
    expect(quotaLevel(500, 100)).toBe('critical');
  });

  it('never divides by a zero allowance', () => {
    expect(quotaLevel(10, 0)).toBe('normal');
  });
});
