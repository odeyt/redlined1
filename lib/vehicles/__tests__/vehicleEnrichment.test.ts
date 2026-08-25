/**
 * Catalogue enrichment — what may be written, by whom, and what it costs the
 * provider mapping.
 *
 * The planner and the fingerprint decision are pure and are called directly.
 * The route's authorization is asserted separately, at the bottom, because it
 * needs a request to exercise and this project has no route harness.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  planEnrichment, decideFingerprint, isEnrichableField,
  CATALOG_ENRICHABLE_FIELDS,
} from '../enrichment';
import type { CatalogComparison, FieldSuggestion } from '../catalogComparison';
import type { QualityVehicle } from '../quality';

const PROVENANCE = {
  source: 'autopartsapi' as const,
  providerVehicleId: 3977,
  mappingFingerprint: 'abc123def4567890',
  observedAt: '2026-08-26T00:00:00.000Z',
};

function suggestion(over: Partial<FieldSuggestion>): FieldSuggestion {
  return {
    field: 'engineCode', label: 'Engine code', comparison: 'MISSING_LOCAL',
    currentValue: null, suggestedValue: 'M 272.965', ...PROVENANCE, ...over,
  };
}

function comparison(suggestions: FieldSuggestion[]): CatalogComparison {
  return {
    available: true, providerVehicleId: 3977,
    modificationDescription: 'S 500 (221.071, 221.171)',
    technicianConfirmed: true, suggestions,
  };
}

const vehicle: QualityVehicle = {
  id: 'v1', year: 2009, make: 'MERCEDES-BENZ', model: 'S-Class',
  engine: '5.5L 8-cyl', fuelType: 'Petrol',
};

describe('a missing field can be filled from the catalogue', () => {
  it('plans the write when the technician asks for it', () => {
    const plan = planEnrichment(['engineCode'], comparison([suggestion({})]));
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({
      field: 'engineCode', column: 'engine_code', before: null, after: 'M 272.965',
    });
  });

  it('takes the value from the SERVER comparison, never the request', () => {
    // The request named a field. Only the server supplied a value.
    const plan = planEnrichment(['engineCode'], comparison([
      suggestion({ suggestedValue: 'M 273.961' }),
    ]));
    expect(plan.entries[0].after).toBe('M 273.961');
  });

  it('does nothing for a field the technician did not select', () => {
    const plan = planEnrichment(['engineCode'], comparison([
      suggestion({}),
      suggestion({ field: 'cylinders', suggestedValue: '8' }),
    ]));
    expect(plan.entries.map(e => e.field)).toEqual(['engineCode']);
  });
});

describe('a value already held is not rewritten', () => {
  it('refuses a MATCH as nothing to change', () => {
    const plan = planEnrichment(['engineCode'], comparison([
      suggestion({ comparison: 'MATCH', currentValue: 'M 272.965' }),
    ]));
    expect(plan.entries).toHaveLength(0);
    expect(plan.refused).toEqual([{ field: 'engineCode', reason: 'nothing_to_change' }]);
  });

  it('refuses UNKNOWN, where the catalogue said nothing', () => {
    const plan = planEnrichment(['cylinders'], comparison([
      suggestion({ field: 'cylinders', comparison: 'UNKNOWN', suggestedValue: null }),
    ]));
    expect(plan.entries).toHaveLength(0);
  });
});

describe('a conflict is applied only when explicitly chosen', () => {
  it('plans the replacement when the technician selects it', () => {
    const plan = planEnrichment(['engineCode'], comparison([
      suggestion({ comparison: 'CONFLICT', currentValue: 'M 272.944' }),
    ]));
    expect(plan.entries[0]).toMatchObject({ before: 'M 272.944', after: 'M 272.965' });
  });

  it('changes nothing when the technician selects nothing', () => {
    const plan = planEnrichment([], comparison([
      suggestion({ comparison: 'CONFLICT', currentValue: 'M 272.944' }),
    ]));
    expect(plan.entries).toHaveLength(0);
  });
});

describe('the writable allowlist is the boundary', () => {
  it.each(['make', 'model', 'vin', 'shop_id', 'customer_id', 'plate', 'status', 'owner_id'])(
    'refuses %s', (field) => {
      expect(isEnrichableField(field)).toBe(false);
      const plan = planEnrichment([field], comparison([
        suggestion({ field, suggestedValue: 'forged' }),
      ]));
      expect(plan.entries).toHaveLength(0);
      expect(plan.refused[0].reason).toBe('not_enrichable');
    });

  it('refuses a field the catalogue never offered, even if enrichable', () => {
    // The comparison is the menu. Asking for something not on it is refused.
    const plan = planEnrichment(['cylinders'], comparison([suggestion({})]));
    expect(plan.entries).toHaveLength(0);
    expect(plan.refused).toEqual([{ field: 'cylinders', reason: 'not_offered' }]);
  });

  it('never allows VIN, whatever the catalogue claims', () => {
    // A catalogue lookup cannot know a VIN. A shop read it off the car.
    expect(CATALOG_ENRICHABLE_FIELDS as readonly string[]).not.toContain('vin');
  });

  it('holds only the four fields a provider variant can speak to', () => {
    expect([...CATALOG_ENRICHABLE_FIELDS].sort())
      .toEqual(['cylinders', 'displacementL', 'engineCode', 'fuelType']);
  });

  it('deduplicates a repeated field rather than writing twice', () => {
    const plan = planEnrichment(['engineCode', 'engineCode'], comparison([suggestion({})]));
    expect(plan.entries).toHaveLength(1);
  });
});

describe('mass assignment cannot slip through', () => {
  it('a request full of forbidden fields plans nothing', () => {
    const plan = planEnrichment(
      ['shop_id', 'customer_id', 'vin', 'owner_id', 'status', 'mileage'],
      comparison([suggestion({})]),
    );
    expect(plan.entries).toHaveLength(0);
    expect(plan.refused).toHaveLength(6);
    expect(plan.refused.every(r => r.reason === 'not_enrichable')).toBe(true);
  });

  it('one allowed field alongside forbidden ones applies only the allowed one', () => {
    const plan = planEnrichment(['engineCode', 'shop_id'], comparison([suggestion({})]));
    expect(plan.entries.map(e => e.field)).toEqual(['engineCode']);
  });
});

describe('the fingerprint consequence is decided before anything is written', () => {
  it('a non-fingerprint field leaves the mapping alone', () => {
    /**
     * engineCode, displacementL and cylinders are deliberately outside
     * FINGERPRINT_FIELDS. Accepting an engine code offered BY the mapped
     * variant must not invalidate the mapping that supplied it.
     */
    const plan = planEnrichment(['engineCode'], comparison([suggestion({})]));
    const d = decideFingerprint(vehicle, plan, true);
    expect(d.changed).toBe(false);
    expect(d.mapping).toBe('unchanged');
  });

  it('a fingerprint field filled from the mapped variant is REBOUND, not lost', () => {
    const plan = planEnrichment(['fuelType'], comparison([
      suggestion({ field: 'fuelType', label: 'Fuel type', currentValue: null, suggestedValue: 'Diesel' }),
    ]));
    const d = decideFingerprint({ ...vehicle, fuelType: undefined }, plan, true);
    expect(d.changed).toBe(true);
    expect(d.mapping).toBe('rebound');
    expect(d.reason).toContain('supplied by the mapped variant itself');
  });

  it('replacing a CONFLICTING identity value invalidates the mapping', () => {
    // The record said one thing and the catalogue another. Resolving that can
    // genuinely change which variant applies.
    const plan = planEnrichment(['fuelType'], comparison([
      suggestion({ field: 'fuelType', label: 'Fuel type', comparison: 'CONFLICT',
        currentValue: 'Petrol', suggestedValue: 'Diesel' }),
    ]));
    const d = decideFingerprint(vehicle, plan, true);
    expect(d.mapping).toBe('invalidated');
  });

  it('does not invent a mapping consequence when there is no mapping', () => {
    const plan = planEnrichment(['engineCode'], comparison([suggestion({})]));
    expect(decideFingerprint(vehicle, plan, false).mapping).toBe('unchanged');
  });

  it('the fingerprint it reports is the one the update actually produces', () => {
    const plan = planEnrichment(['fuelType'], comparison([
      suggestion({ field: 'fuelType', label: 'Fuel type', currentValue: null, suggestedValue: 'Diesel' }),
    ]));
    const start = { ...vehicle, fuelType: undefined };
    const d = decideFingerprint(start, plan, true);
    // Recomputing from the vehicle as it will be must match `after`.
    const again = decideFingerprint({ ...start, fuelType: 'Diesel' }, { entries: [], refused: [] }, true);
    expect(again.before).toBe(d.after);
  });
});

describe('the route enforces what the planner assumes', () => {
  /**
   * The planner is only safe because the comparison it reads was built by the
   * server for the CURRENT fingerprint. These assert the route does that,
   * since a route needs a request to exercise and there is no harness here.
   */
  const ROUTE = readFileSync(
    join(process.cwd(), 'app/api/vehicles/quality/route.ts'), 'utf8');

  it('accepts field NAMES only — no values in the schema', () => {
    expect(ROUTE).toContain('fields: z.array(z.string().max(40))');
    expect(ROUTE).not.toMatch(/values\s*:\s*z\./);
    expect(ROUTE).toContain('.strict()');
  });

  it('rebuilds the comparison server-side before planning', () => {
    const post = ROUTE.slice(ROUTE.indexOf('export async function POST'));
    expect(post.indexOf('compareVehicleWithCatalog'))
      .toBeLessThan(post.indexOf('planEnrichment'));
  });

  it('checks shop membership, then vehicle ownership, then fingerprint', () => {
    const post = ROUTE.slice(ROUTE.indexOf('export async function POST'));
    const auth = post.indexOf('getAuth(input.shopId)');
    const owns = post.indexOf('vehicleBelongsToShop');
    const fp = post.indexOf('VEHICLE_CHANGED');
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(owns);
    expect(owns).toBeLessThan(fp);
  });

  it('refuses a stale fingerprint rather than enriching an older identity', () => {
    expect(ROUTE).toContain("code: 'VEHICLE_CHANGED'");
    expect(ROUTE).toContain('fingerprint !== input.fingerprint');
  });

  it('scopes the vehicle read to the shop', () => {
    // service_role bypasses RLS, so the predicate is the boundary.
    expect(ROUTE).toContain(".eq('id', vehicleId).eq('shop_id', shopId)");
  });

  it('spends no provider call on the read path', () => {
    const get = ROUTE.slice(ROUTE.indexOf('export async function GET'),
      ROUTE.indexOf('export async function POST'));
    for (const forbidden of ['autoPartsApiRequest', 'resolveProviderVehicle', 'cachedFetch']) {
      expect(get).not.toContain(forbidden);
    }
  });
});
