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

/**
 * The LIVE envelope and field names, captured 2026-08-24.
 *
 *   { countModels, models: [{ modelId, modelName, modelYearFrom, modelYearTo }] }
 *
 * The year fields hold ISO DATES. An earlier fixture guessed
 * `yearOfConstrFrom`, which parsed to undefined — and an undefined production
 * window passes every year check, which is how a 2009 S-Class matched sixteen
 * series including the 1970s W116.
 */
const MB_MODELS = {
  countModels: 3,
  models: [
    { modelId: 9001, modelName: 'S-CLASS (W221)', modelYearFrom: '2005-09-01', modelYearTo: '2013-12-01' },
    { modelId: 9002, modelName: 'S-CLASS (W222)', modelYearFrom: '2013-05-01', modelYearTo: '2020-12-01' },
    { modelId: 9003, modelName: 'C-CLASS (W204)', modelYearFrom: '2007-01-01', modelYearTo: '2014-12-01' },
  ],
};

/**
 * The LIVE variants envelope and fields, captured 2026-08-24 (41 rows for the
 * W221). Note `modelTypes` — nothing was looking for that key, and the first
 * live call parsed ZERO variants from a perfectly good response. Note also
 * that the numbers arrive as strings with four decimals.
 */
const S_CLASS_W221_VARIANTS = {
  modelType: 'S-CLASS (W221, V221)',
  countModelTypes: 3,
  modelTypes: [
    {
      vehicleId: 5501, manufacturerName: 'MERCEDES-BENZ', modelName: 'S-CLASS (W221, V221)',
      typeEngineName: 'S 500 (221.071)',
      constructionIntervalStart: '2005-09-01', constructionIntervalEnd: '2013-12-01',
      powerKw: '285.0000', powerPs: '388.0000', fuelType: 'Petrol', bodyType: 'Saloon',
      numberOfCylinders: 8, capacityLt: '5.5000', capacityTech: '5461.0000',
      engineCodes: 'M 273.961',
    },
    {
      vehicleId: 5502, manufacturerName: 'MERCEDES-BENZ', modelName: 'S-CLASS (W221, V221)',
      typeEngineName: 'S 350 (221.056)',
      constructionIntervalStart: '2005-09-01', constructionIntervalEnd: '2013-12-01',
      powerKw: '200.0000', powerPs: '272.0000', fuelType: 'Petrol', bodyType: 'Saloon',
      numberOfCylinders: 6, capacityLt: '3.5000', capacityTech: '3498.0000',
      engineCodes: 'M 272.965',
    },
    {
      vehicleId: 5503, manufacturerName: 'MERCEDES-BENZ', modelName: 'S-CLASS (W221, V221)',
      typeEngineName: 'S 320 CDI (221.022)',
      constructionIntervalStart: '2005-10-01', constructionIntervalEnd: '2013-12-01',
      powerKw: '173.0000', powerPs: '235.0000', fuelType: 'Diesel', bodyType: 'Saloon',
      numberOfCylinders: 6, capacityLt: '3.0000', capacityTech: '2987.0000',
      engineCodes: 'OM 642',
    },
  ],
};

/**
 * The LIVE applicability shape — a BARE ARRAY, and carrying no vehicle id.
 *
 * 370 rows came back for a Mercedes brake-pad OEM, every one of them
 * descriptive only. Matching on an id could never have succeeded.
 */
const APPLICABILITY_LIVE_SHAPE = [
  {
    manufacturerName: 'MERCEDES-BENZ', modelName: 'S-CLASS (W221, V221)',
    typeEngineName: 'S 500 (221.071)', bodyType: 'Saloon',
    constructionIntervalStart: '2005-09-01', constructionIntervalEnd: '2013-12-01',
    powerKw: '285.0000', powerPs: '388.0000', capacityTax: null,
  },
  {
    manufacturerName: 'MERCEDES-BENZ', modelName: 'SPRINTER 3,5-t Bus (B906)',
    typeEngineName: '318 CDI (906.731, 906.733)', bodyType: 'Bus',
    constructionIntervalStart: '2008-02-01', constructionIntervalEnd: '2009-12-01',
    powerKw: '135.0000', powerPs: '184.0000', capacityTax: null,
  },
];

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

  it('reads the live variant fields', () => {
    const v = readVariants(S_CLASS_W221_VARIANTS)[0];
    // capacityLt is already litres and arrives as the string "5.5000".
    expect(v.displacementL).toBe(5.5);
    // powerKw is "285.0000", not 285.
    expect(v.powerKw).toBe(285);
    expect(v.cylinders).toBe(8);
    expect(v.description).toBe('S 500 (221.071)');
    expect(v.engineCode).toBe('M 273.961');
    expect(v.yearFrom).toBe(2005);
  });

  it('takes the series name from the ROW, not the envelope', () => {
    // The envelope's `modelType` returned "PC" live — a category, not a
    // series. Applicability rows name the series, so both sides of that
    // comparison must come from provider rows.
    expect(readVariants(S_CLASS_W221_VARIANTS)[0].modelName).toBe('S-CLASS (W221, V221)');
    expect(readVariants({ modelType: 'PC', modelTypes: [] })).toHaveLength(0);
  });

  it('finds variants under the `modelTypes` envelope key', () => {
    // The first live call parsed ZERO variants from a 41-row response
    // because nothing was looking for this key.
    expect(readVariants(S_CLASS_W221_VARIANTS)).toHaveLength(3);
    expect(readVariants({ modelTypes: [] })).toHaveLength(0);
  });

  it('reads the LIVE year fields, from ISO dates', () => {
    // modelYearFrom / modelYearTo, "2005-09-01" -> 2005. Read under any other
    // name they come back undefined, and an undefined window passes every
    // year check.
    expect(readModels(MB_MODELS)[0].yearFrom).toBe(2005);
    expect(readModels(MB_MODELS)[0].yearTo).toBe(2013);
  });

  it('an unparsed year window would let the wrong decade through', () => {
    // The live failure, pinned: a 1970s series with no readable window
    // matched a 2009 car.
    const unreadable = { models: [{ modelId: 1, modelName: 'S-CLASS (W116)', someOtherField: '1972' }] };
    const parsed = readModels(unreadable);
    expect(parsed[0].yearFrom).toBeUndefined();
    // Which is exactly why the fixture above must use the real field names.
    expect(matchModel('S-Class', 2009, parsed).status).not.toBe('no_match');
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

describe('applicability carries no vehicle id — the live finding', () => {
  const S500 = { modelName: 'S-CLASS (W221, V221)', typeEngineName: 'S 500 (221.071)' };

  it('matches the resolved variant on model AND engine name', () => {
    const a = normalizeApplicability(APPLICABILITY_LIVE_SHAPE, S500);
    expect(a.answer).toBe('confirmed');
    expect(a.matchedResolvedVehicle).toBe(true);
    expect(a.listed).toBe(2);
  });

  it('does NOT match a different variant of the same series', () => {
    // typeEngineName alone repeats across series, and modelName alone is the
    // whole series. Both, together, identify one variant.
    const a = normalizeApplicability(APPLICABILITY_LIVE_SHAPE, {
      modelName: 'S-CLASS (W221, V221)', typeEngineName: 'S 350 (221.056)',
    });
    expect(a.answer).toBe('unknown');
  });

  it('does not match a different series with a similar engine name', () => {
    const a = normalizeApplicability(APPLICABILITY_LIVE_SHAPE, {
      modelName: 'S-CLASS Coupe (C216)', typeEngineName: 'S 500 (221.071)',
    });
    expect(a.answer).toBe('unknown');
  });

  it('reads a BARE ARRAY envelope', () => {
    expect(normalizeApplicability(APPLICABILITY_LIVE_SHAPE, S500).listed).toBe(2);
  });

  it('is unknown when the variant has neither an id nor the descriptive pair', () => {
    // Matching on vehicleId alone could never succeed against this endpoint,
    // and would have made every part on every vehicle UNKNOWN forever —
    // caution that was actually a bug.
    expect(normalizeApplicability(APPLICABILITY_LIVE_SHAPE, { modelName: 'S-CLASS (W221, V221)' }).answer)
      .toBe('unknown');
    expect(normalizeApplicability(APPLICABILITY_LIVE_SHAPE, undefined).answer).toBe('unknown');
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
