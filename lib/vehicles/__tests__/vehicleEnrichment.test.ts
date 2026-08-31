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
import {
  vehicleFingerprint, FINGERPRINT_FIELDS,
} from '../../parts/vehicleResolution/fingerprint';

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
  it('every enrichable field participates in stale-mapping detection', () => {
    /**
     * These were briefly OUTSIDE the fingerprint, on the reasoning that they
     * describe a vehicle without changing which vehicle it is. Wrong in the
     * direction that matters: a later hand-typed engine code no variant
     * supports would then sit beside a mapping still reading as valid, and
     * could still produce VERIFIED FIT.
     */
    for (const f of ['engineCode', 'displacementL', 'cylinders', 'fuelType']) {
      expect(FINGERPRINT_FIELDS as readonly string[]).toContain(f);
    }
  });

  it('the loader reads every fingerprint column', () => {
    /**
     * The M-PARTS2C.1 bug in one assertion: two paths fingerprinting the same
     * car differently rejected 95 of 115 vehicles. Derived from the field
     * list, so the NEXT field added cannot be forgotten either.
     */
    const loader = readFileSync(
      join(process.cwd(), 'lib/parts/vehicleResolution/loadVehicle.ts'), 'utf8');
    const column: Record<string, string> = {
      vin: 'vin', year: 'year', make: 'make', model: 'model', trim: 'trim',
      engine: 'engine', transmission: 'transmission', fuelType: 'fuel_type',
      engineCode: 'engine_code', displacementL: 'displacement_l', cylinders: 'cylinders',
    };
    for (const f of FINGERPRINT_FIELDS) {
      expect(column[f]).toBeDefined();
      expect(loader).toContain(column[f]);
    }
  });

  it('1. accepting an engine code the variant supplied REBINDS the mapping', () => {
    // Rule A: fingerprint A -> B, same providerVehicleId kept, no call.
    const plan = planEnrichment(['engineCode'], comparison([
      suggestion({ currentValue: null, suggestedValue: 'M 272.965' }),
    ]));
    const d = decideFingerprint({ ...vehicle, engineCode: undefined }, plan, true);
    expect(d.changed).toBe(true);
    expect(d.before).not.toBe(d.after);
    expect(d.mapping).toBe('rebound');
    expect(d.reason).toContain('supplied by the mapped variant itself');
  });

  it('2. accepting displacement and cylinders also rebinds', () => {
    const plan = planEnrichment(['displacementL', 'cylinders'], comparison([
      suggestion({ field: 'displacementL', label: 'Displacement', currentValue: null, suggestedValue: '3.5' }),
      suggestion({ field: 'cylinders', label: 'Cylinders', currentValue: null, suggestedValue: '6' }),
    ]));
    const d = decideFingerprint(
      { ...vehicle, displacementL: undefined, cylinders: undefined }, plan, true);
    expect(d.changed).toBe(true);
    expect(d.mapping).toBe('rebound');
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

describe('B — a later unsupported change makes the mapping stale', () => {
  /**
   * Not an enrichment path: someone edits the vehicle by hand afterwards. The
   * mapping was bound to the OLD fingerprint, so it must stop matching. This
   * is what prevents a stale mapping producing VERIFIED FIT, and it is the
   * whole reason these fields belong in the fingerprint.
   */
  const mapped: QualityVehicle = {
    ...vehicle, engineCode: 'M 272.965', displacementL: 3.5, cylinders: 6,
  };
  const bound = vehicleFingerprint(mapped);

  it('3. an engine code typed to an unsupported value no longer matches', () => {
    expect(vehicleFingerprint({ ...mapped, engineCode: 'M 999.999' })).not.toBe(bound);
  });

  it('4. a displacement change makes the mapping stale', () => {
    expect(vehicleFingerprint({ ...mapped, displacementL: 5.5 })).not.toBe(bound);
  });

  it('5. a cylinder-count change makes the mapping stale', () => {
    expect(vehicleFingerprint({ ...mapped, cylinders: 8 })).not.toBe(bound);
  });

  it('the comparison refuses a mapping whose fingerprint no longer matches', () => {
    const cmp = readFileSync(
      join(process.cwd(), 'lib/vehicles/catalogComparison.ts'), 'utf8');
    expect(cmp).toContain('m.vehicle_fingerprint !== currentFingerprint');
    expect(cmp).toContain("unavailableReason: 'fingerprint_stale'");
  });
});

describe('forged input is rejected before anything is written', () => {
  it('6. a field the catalogue never offered writes nothing and rebinds nothing', () => {
    /**
     * The request carries field NAMES only, so a forged VALUE has nowhere to
     * enter: the plan takes its value from the server-built comparison. A
     * field absent from that comparison cannot be planned at all.
     */
    const absent = planEnrichment(['cylinders'], comparison([suggestion({})]));
    expect(absent.entries).toHaveLength(0);
    expect(absent.refused).toEqual([{ field: 'cylinders', reason: 'not_offered' }]);

    const d = decideFingerprint(vehicle, absent, true);
    expect(d.changed).toBe(false);
    expect(d.mapping).toBe('unchanged');
  });

  it('7. a forged providerVehicleId cannot reach the comparison', () => {
    // The route accepts no such field, and the mapping is read from the
    // database by shop and vehicle rather than taken from the request.
    const route = readFileSync(
      join(process.cwd(), 'app/api/vehicles/quality/route.ts'), 'utf8');
    expect(route).not.toMatch(/providerVehicleId\s*:\s*z\./);
    const cmp = readFileSync(
      join(process.cwd(), 'lib/vehicles/catalogComparison.ts'), 'utf8');
    expect(cmp).toContain('num(m.provider_vehicle_id)');
  });

  /**
   * The boundary moved when the parts path learned about mirroring, and this
   * test says so rather than being quietly relaxed.
   *
   * BEFORE: a vehicle was enrichable only from the shop that owned it.
   * NOW:    it is enrichable from the owning shop and from any shop that
   *         mirrors it AND that this user personally belongs to.
   *
   * That is a widening, and it is deliberate — `services/vehicleService.ts`
   * has always allowed the same account to update and delete mirrored
   * vehicles. What has NOT widened is the part that matters: the scope is
   * derived on the server from `shop_mirrors`, so an unmirrored tenant's
   * vehicle is as unreachable as it ever was, and no request body can say
   * otherwise.
   */
  it('8. a shop cannot enrich a vehicle outside its server-derived scope', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/vehicles/quality/route.ts'), 'utf8');

    // The scope comes from the session and the mirror table — never the body.
    expect(route).toContain('await readableShopIds(auth.userId, input.shopId)');
    expect(route).not.toMatch(/shopIds\s*:\s*z\./);
    expect(route).not.toMatch(/scope\s*:\s*z\./);

    // And it gates the load, which is what every later step reads from.
    expect(route).toContain('await loadQualityVehicle(scope, input.vehicleId)');

    // service_role bypasses RLS, so the shop predicate IS the boundary.
    for (const file of ['lib/vehicles/enrichment.ts', 'lib/vehicles/catalogComparison.ts']) {
      expect(readFileSync(join(process.cwd(), file), 'utf8')).toContain(".eq('shop_id', shopId)");
    }
  });

  /**
   * The widening must not leak into what gets WRITTEN. Enrichment updates the
   * vehicle row, its mapping and its audit event; all three have to land on
   * the owning shop. Passing the active shop would write a row that the
   * owner's own queries cannot see — or, worse, nothing at all, silently.
   */
  it('8b. everything written is keyed to the vehicle owner, not the visitor', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/vehicles/quality/route.ts'), 'utf8');
    const post = route.slice(route.indexOf('export async function POST'));

    // Scoped to the WRITE call, not the whole handler. `input.shopId` still
    // appears in this function and correctly so — the log lines record which
    // shop the request came from, which is a different question from which
    // shop the data belongs to, and banning it outright would have forced
    // those to lie.
    const applyCall = post.slice(
      post.indexOf('await applyEnrichment({'),
      post.indexOf('logger.info(\'vehicles.enriched\''),
    );
    expect(applyCall).toContain('shopId: ownerShopId');
    expect(applyCall).not.toContain('input.shopId');

    expect(post).toContain('compareVehicleWithCatalog(ownerShopId');
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
    // The scope is derived only AFTER membership is established — it widens an
    // authorised shop and must never be what authorises one.
    const scope = post.indexOf('readableShopIds(');
    // The load is now the ownership gate: it returns null for a vehicle in no
    // readable shop, which is the same refusal the separate ownership check
    // used to make.
    const owns = post.indexOf('loadQualityVehicle(scope');
    const fp = post.indexOf('VEHICLE_CHANGED');
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(scope);
    expect(scope).toBeLessThan(owns);
    expect(owns).toBeLessThan(fp);
  });

  it('refuses a stale fingerprint rather than enriching an older identity', () => {
    expect(ROUTE).toContain("code: 'VEHICLE_CHANGED'");
    expect(ROUTE).toContain('fingerprint !== input.fingerprint');
  });

  it('scopes the vehicle read to the shop', () => {
    // service_role bypasses RLS, so the predicate is the boundary.
    //
    // The supplementary read pins to the OWNER the scoped read already
    // settled on, rather than re-querying across the whole scope. Widening it
    // could only match a different shop's row for the same id — which cannot
    // happen for a primary key, but the narrow predicate is the one that
    // stays correct if that ever stops being true.
    expect(ROUTE).toContain(".eq('id', vehicleId).eq('shop_id', base.ownerShopId)");

    // And the scoped read itself is bounded by the derived scope.
    const loader = readFileSync(
      join(process.cwd(), 'lib/parts/vehicleResolution/loadVehicle.ts'), 'utf8');
    expect(loader).toContain(".in('shop_id', scope)");
  });

  it('spends no provider call on the read path', () => {
    const get = ROUTE.slice(ROUTE.indexOf('export async function GET'),
      ROUTE.indexOf('export async function POST'));
    for (const forbidden of ['autoPartsApiRequest', 'resolveProviderVehicle', 'cachedFetch']) {
      expect(get).not.toContain(forbidden);
    }
  });
});
