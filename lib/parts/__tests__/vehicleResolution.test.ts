/**
 * Vehicle resolution foundations, and the invariant the milestone turns on:
 *
 *   OEM Match Score  !=  Vehicle Fitment
 *
 * These are the provider-independent parts — the fingerprint, marque matching
 * and the truth table. They are pure functions over Redlined1's own data and
 * over provider ANSWERS, not provider response shapes, so they can be settled
 * before a single live call is spent.
 */
import {
  vehicleFingerprint, fingerprintSource, isStale, hasEnoughToResolve, FINGERPRINT_FIELDS,
} from '../vehicleResolution/fingerprint';
import {
  sameMarque, canonicalMarque, normalizeMarque, matchManufacturer, NEVER_EQUIVALENT,
} from '../vehicleResolution/manufacturer';
import { decideFitment, mayBeRecommended, FITMENT_HEADLINE } from '../vehicleResolution/fitmentTruth';
import type { CanonicalVehicle } from '../vehicleResolution/types';

const TACOMA: CanonicalVehicle = {
  id: 'v1', vin: 'JTEBU5JR0K5123456', year: 2019,
  make: 'Toyota', model: 'Tacoma', engine: '3.5L V6',
};

describe('the fingerprint decides when a cached provider id is stale', () => {
  it('is stable for the same vehicle', () => {
    expect(vehicleFingerprint(TACOMA)).toBe(vehicleFingerprint({ ...TACOMA }));
  });

  it('ignores punctuation and case in a make', () => {
    // "Mercedes-Benz" and "Mercedes Benz" are one vehicle. Treating them as
    // two would discard a good mapping on a cosmetic edit.
    const a: CanonicalVehicle = { id: 'v', make: 'Mercedes-Benz', model: 'S-Class' };
    const b: CanonicalVehicle = { id: 'v', make: 'mercedes benz', model: 's class' };
    expect(vehicleFingerprint(a)).toBe(vehicleFingerprint(b));
  });

  it('changes when the ENGINE changes', () => {
    // The case the cache exists to get right: same row, different vehicle to
    // a parts catalogue.
    const other = { ...TACOMA, engine: '2.7L I4' };
    expect(isStale(vehicleFingerprint(TACOMA), other)).toBe(true);
  });

  it('changes when the VIN is corrected', () => {
    expect(isStale(vehicleFingerprint(TACOMA), { ...TACOMA, vin: 'JTEBU5JR0K5999999' })).toBe(true);
  });

  it.each(['year', 'make', 'model', 'trim', 'transmission', 'fuelType'] as const)(
    'changes when %s changes', field => {
      const changed = { ...TACOMA, [field]: 'something-else' } as CanonicalVehicle;
      expect(isStale(vehicleFingerprint(TACOMA), changed)).toBe(true);
    });

  it('does NOT cover fields that cannot change which parts fit', () => {
    // Mileage, plate and status change constantly. Including them would throw
    // away a good mapping every time somebody recorded a service.
    const src = fingerprintSource(TACOMA);
    for (const noise of ['mileage', 'plate', 'status', 'owner', 'notes']) {
      expect(src).not.toContain(noise);
    }
    expect(FINGERPRINT_FIELDS).toHaveLength(8);
  });

  it('needs make and model before it is worth asking the provider', () => {
    expect(hasEnoughToResolve(TACOMA)).toBe(true);
    expect(hasEnoughToResolve({ id: 'v', make: 'Toyota' })).toBe(false);
    expect(hasEnoughToResolve({ id: 'v', model: 'Tacoma' })).toBe(false);
    // A year is not required — manufacturer and model still resolve without one.
    expect(hasEnoughToResolve({ id: 'v', make: 'Toyota', model: 'Tacoma' })).toBe(true);
  });
});

describe('marque matching is exact, never similar', () => {
  it('accepts spelling and punctuation variants of the SAME marque', () => {
    expect(sameMarque('Mercedes-Benz', 'MERCEDES BENZ')).toBe(true);
    expect(sameMarque('VW', 'Volkswagen')).toBe(true);
    expect(sameMarque('Chevy', 'Chevrolet')).toBe(true);
    expect(sameMarque('Land Rover', 'LAND ROVER')).toBe(true);
  });

  it('REFUSES related marques — the rule this module exists for', () => {
    // One company, shared engineering, entirely separate parts catalogues.
    for (const [a, b] of NEVER_EQUIVALENT) {
      expect(sameMarque(a, b)).toBe(false);
    }
  });

  it('refuses a prefix or substring overlap', () => {
    // A prefix rule alone would make "merc" match "mercury".
    expect(sameMarque('Mercury', 'Mercedes-Benz')).toBe(false);
    expect(sameMarque('Ford', 'Fordson')).toBe(false);
  });

  it('is false when either side is missing', () => {
    expect(sameMarque('', 'Toyota')).toBe(false);
    expect(sameMarque('Toyota', undefined)).toBe(false);
  });

  it('normalises before aliasing', () => {
    expect(normalizeMarque('Mercedes-Benz')).toBe('mercedesbenz');
    expect(canonicalMarque('VW')).toBe('volkswagen');
  });
});

describe('picking a provider manufacturer', () => {
  const list = [
    { id: 111, name: 'TOYOTA' },
    { id: 20, name: 'CHRYSLER' },
    { id: 36, name: 'FORD' },
    { id: 74, name: 'MERCEDES-BENZ' },
    { id: 88, name: 'LEXUS' },
  ];

  it('matches one manufacturer', () => {
    const m = matchManufacturer('Mercedes Benz', list);
    expect(m.status).toBe('matched');
    expect(m.manufacturer!.id).toBe(74);
  });

  it('never picks a related marque', () => {
    const m = matchManufacturer('Toyota', list);
    expect(m.manufacturer!.id).toBe(111);
    expect(m.manufacturer!.name).not.toBe('LEXUS');
  });

  it('reports ambiguity rather than choosing', () => {
    const dupes = [...list, { id: 999, name: 'Toyota' }];
    const m = matchManufacturer('Toyota', dupes);
    expect(m.status).toBe('ambiguous');
    expect(m.candidates).toHaveLength(2);
    expect(m.manufacturer).toBeUndefined();
  });

  it('reports a missing make instead of guessing', () => {
    expect(matchManufacturer('', list).status).toBe('missing_input');
  });

  it('reports no match plainly', () => {
    const m = matchManufacturer('Proton', list);
    expect(m.status).toBe('no_match');
    expect(m.detail).toContain('Proton');
  });
});

describe('the fitment truth table', () => {
  const base = {
    partIdentity: 'verified_equivalent',
    vehicleResolution: 'resolved',
    applicability: 'confirmed',
  } as const;

  it('VERIFIED requires all three affirmatives', () => {
    const v = decideFitment({ ...base });
    expect(v.status).toBe('verified');
  });

  it('a 100/100 part match with NO applicability is UNVERIFIED-or-LIKELY, never verified', () => {
    // The invariant. Part identity is not vehicle fitment.
    const v = decideFitment({ ...base, applicability: 'unknown' });
    expect(v.status).not.toBe('verified');
    expect(v.reason).toContain('Absence is not a statement');
  });

  it('a resolved vehicle with unconfirmed identity is not verified', () => {
    const v = decideFitment({ ...base, partIdentity: 'analogue_candidate' });
    expect(v.status).not.toBe('verified');
  });

  it('an ambiguous variant is never verified, and says what to do', () => {
    const v = decideFitment({ ...base, vehicleResolution: 'ambiguous' });
    expect(v.status).toBe('unverified');
    expect(v.reason).toContain('Choose the variant');
  });

  it.each(['insufficient_data', 'not_found', 'ambiguous'] as const)(
    'vehicle resolution %s can never be verified', vehicleResolution => {
      expect(decideFitment({ ...base, vehicleResolution }).status).not.toBe('verified');
    });

  it('EXCLUDED overrides everything, including a perfect part match', () => {
    const v = decideFitment({ ...base, applicability: 'excluded' });
    expect(v.status).toBe('incompatible');
    expect(mayBeRecommended(v.status)).toBe(false);
  });

  it('absence is NOT contradiction', () => {
    // "unknown" must never become "incompatible". A red label on correct
    // parts teaches shops to ignore the label.
    expect(decideFitment({ ...base, applicability: 'unknown' }).status).not.toBe('incompatible');
    expect(decideFitment({ ...base, applicability: 'not_asked' }).status).not.toBe('incompatible');
  });

  it('a contradicting marque is unverified, not incompatible', () => {
    // The provider has not rejected it; it is simply not evidence about this
    // vehicle.
    const v = decideFitment({ ...base, marqueContradicts: true });
    expect(v.status).toBe('unverified');
    expect(v.reason).toContain('collide across marques');
  });

  it('an explicit exclusion still wins over a contradicting marque', () => {
    const v = decideFitment({ ...base, marqueContradicts: true, applicability: 'excluded' });
    expect(v.status).toBe('incompatible');
  });

  it('every verdict explains which input was the limit', () => {
    const cases: Array<Parameters<typeof decideFitment>[0]> = [
      { ...base, applicability: 'unknown' },
      { ...base, vehicleResolution: 'ambiguous' },
      { ...base, vehicleResolution: 'insufficient_data' },
      { ...base, vehicleResolution: 'not_found' },
      { ...base, partIdentity: 'discovery_only' },
      { ...base, applicability: 'not_asked' },
    ];
    for (const c of cases) {
      const v = decideFitment(c);
      expect(v.reason.length).toBeGreaterThan(20);
      expect(v.reason).toMatch(/[.]$/);
    }
  });

  it('labels fitment separately from part identity', () => {
    // Two fields, two vocabularies. Nothing renders them as one percentage.
    expect(FITMENT_HEADLINE.verified).toBe('VERIFIED FIT');
    expect(FITMENT_HEADLINE.unverified).toBe('UNVERIFIED');
    expect(FITMENT_HEADLINE.incompatible).toBe('DOES NOT FIT');
  });
});
