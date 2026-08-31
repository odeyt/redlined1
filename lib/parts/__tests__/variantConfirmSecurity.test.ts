/**
 * The variant-confirmation security boundary.
 *
 * A confirmed mapping is the strongest evidence in the fitment chain. With a
 * part identity match and an applicability hit it produces VERIFIED FIT — a
 * green badge a shop fits brakes on. So forging a confirmation forges the
 * verdict, and `providerVehicleId` arrives from a browser.
 *
 * ## The one that is easy to get wrong
 *
 * The mapping store runs as `service_role`, which bypasses RLS ENTIRELY. RLS
 * protects a member reading their own rows; it has nothing to say about a
 * server route. So every check in the route IS the boundary, and a test that
 * only proved RLS worked would prove nothing about this path.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { candidateWasOffered } from '../vehicleResolution/mappingStore';
import { vehicleFingerprint } from '../vehicleResolution/fingerprint';
import type { CanonicalVehicle } from '../vehicleResolution/types';

const ROUTE = readFileSync(
  join(process.cwd(), 'app/api/parts/vehicle-resolution/confirm/route.ts'), 'utf8');
const STORE = readFileSync(
  join(process.cwd(), 'lib/parts/vehicleResolution/mappingStore.ts'), 'utf8');

const OFFERED = [{ vehicleId: 101 }, { vehicleId: 102 }, { vehicleId: 103 }];

describe('a forged candidate cannot become a confirmed mapping', () => {
  it('accepts an id the resolver actually offered', () => {
    expect(candidateWasOffered(101, OFFERED)).toBe(true);
    expect(candidateWasOffered(103, OFFERED)).toBe(true);
  });

  it('REFUSES an id that was never offered', () => {
    // The headline case: a plausible-looking integer from a request body.
    expect(candidateWasOffered(999999, OFFERED)).toBe(false);
  });

  it('refuses a candidate belonging to a different vehicle', () => {
    // Legitimate for another car, and therefore not evidence about this one.
    const anotherVehiclesCandidates = [{ vehicleId: 501 }, { vehicleId: 502 }];
    expect(candidateWasOffered(501, OFFERED)).toBe(false);
    expect(candidateWasOffered(101, anotherVehiclesCandidates)).toBe(false);
  });

  it.each([
    ['a string that looks numeric', '101'],
    ['SQL in a number field', '101; drop table vehicles'],
    ['a negative id', -101],
    ['zero', 0],
    ['a float', 101.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['null', null],
    ['an object', { vehicleId: 101 }],
  ])('refuses %s', (_label, value) => {
    expect(candidateWasOffered(value, OFFERED)).toBe(false);
  });

  it('refuses everything when nothing was offered', () => {
    expect(candidateWasOffered(101, [])).toBe(false);
  });
});

describe('the route validates against candidates IT derived', () => {
  it('re-resolves rather than trusting anything sent alongside the id', () => {
    // The browser chooses between options the server produced. A route that
    // accepted a candidate list from the request would be validating the
    // attacker's input against the attacker's input.
    expect(ROUTE).toContain('await resolveProviderVehicle(vehicle');
    expect(ROUTE).toContain('bypassMapping: true');
    expect(ROUTE).toContain('candidateWasOffered(input.providerVehicleId, offered)');
  });

  it('accepts no candidate list from the request body', () => {
    const schema = ROUTE.slice(ROUTE.indexOf('const ConfirmSchema'), ROUTE.indexOf('async function getAuth'));
    expect(schema).toContain('.strict()');
    expect(schema).not.toMatch(/candidates\s*:/);
    expect(schema).not.toMatch(/modificationDescription\s*:/);
    expect(schema).not.toMatch(/manufacturerId\s*:/);
  });

  it('reads the canonical vehicle server-side, never from the body', () => {
    /**
     * The loader moved into lib/parts/vehicleResolution/loadVehicle.ts so the
     * search route reads the vehicle the SAME way. It previously built its
     * own from the request body, which omits transmission and fuelType, and
     * the resulting fingerprint mismatch made this endpoint reject 95 of 115
     * vehicles with 409 VEHICLE_CHANGED.
     *
     * The property under test is unchanged — server-side, scoped to the shop
     * — so it is asserted where the code now lives.
     */
    expect(ROUTE).toContain('await loadCanonicalVehicle(scope, input.vehicleId)');
    const loader = readFileSync(
      join(process.cwd(), 'lib/parts/vehicleResolution/loadVehicle.ts'), 'utf8');
    // The shop predicate is now a set — the caller's read scope — but it is
    // still the tenancy boundary, and service_role means it is the only one.
    expect(loader).toContain(".in('shop_id', scope)");
    expect(loader).toContain(".eq('id', vehicleId)");
    // An empty scope must match nothing rather than everything. Without this
    // guard the boundary would rest on how PostgREST encodes `in.()`.
    expect(loader).toContain('if (!scope.length');

    const schema = ROUTE.slice(0, ROUTE.indexOf('async function getAuth'));
    expect(schema).not.toMatch(/\bengine\s*:/);
    expect(schema).not.toMatch(/\bmake\s*:/);
  });
});

describe('authorization runs in the required order', () => {
  it('checks session, then shop membership, then vehicle ownership', () => {
    const iAuth = ROUTE.indexOf('await getAuth(input.shopId)');
    /**
     * The scope is derived only after membership is established. Order
     * matters and is not cosmetic: `readableShopIds` widens an ALREADY
     * authorised shop. Called before `getAuth`, it would be deriving mirror
     * links for a shop id straight out of the request body, from a caller who
     * has not been shown to belong to it — turning a widening into the
     * authorisation itself.
     */
    const iScope = ROUTE.indexOf('await readableShopIds(');
    /**
     * The scoped load IS the ownership gate now. It replaced a
     * `vehicleBelongsToShop` call that ran the identical id-plus-shop
     * predicate and returned false in exactly the cases this returns null.
     * One vehicle read, not two — two is how search and confirm drifted apart
     * and rejected 95 of 115 vehicles.
     */
    const iVehicle = ROUTE.indexOf('await loadCanonicalVehicle(');
    const iFingerprint = ROUTE.indexOf('vehicleFingerprint(vehicle)');
    const iResolve = ROUTE.indexOf('await resolveProviderVehicle(');
    const iWrite = ROUTE.indexOf('await writeMapping(');

    expect(iAuth).toBeGreaterThan(-1);
    expect(iAuth).toBeLessThan(iScope);
    expect(iScope).toBeLessThan(iVehicle);
    expect(iVehicle).toBeLessThan(iFingerprint);
    expect(iFingerprint).toBeLessThan(iResolve);
    expect(iResolve).toBeLessThan(iWrite);
  });

  it('confirms against the vehicle owner, so a mirrored car keeps one mapping', () => {
    // `writeMapping` re-checks that the vehicle belongs to the shop it is
    // keyed under. Passing the requesting shop for a mirrored vehicle is
    // therefore not a mild inaccuracy — the write is refused and the
    // technician's confirmation is silently lost.
    expect(ROUTE).toContain('shopId: ownerShopId');
    expect(ROUTE).not.toMatch(/writeMapping\(\{[\s\S]{0,200}?shopId: input\.shopId/);
  });

  it('the store re-checks vehicle ownership before writing', () => {
    // Belt and braces on purpose: the vehicle id is the field a route is most
    // likely to take on trust from a body.
    expect(STORE).toContain('if (!await vehicleBelongsToShop(shopId, vehicleId))');
    expect(STORE).toContain('write_refused_foreign_vehicle');
  });

  it('every store query filters by shop', () => {
    // service_role bypasses RLS, so this filter IS the tenancy boundary.
    const reads = STORE.match(/\.from\('parts_provider_vehicle_mappings'\)[\s\S]*?maybeSingle\(\)/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    for (const q of reads) expect(q).toContain(".eq('shop_id', shopId)");
  });

  it('records that RLS does not protect this path', () => {
    // If this comment goes, someone has forgotten why the checks exist.
    expect(STORE).toMatch(/bypasses RLS/i);
  });
});

describe('a stale vehicle cannot be pinned to a variant', () => {
  const vehicle: CanonicalVehicle = {
    id: 'v1', year: 2009, make: 'MERCEDES-BENZ', model: 'S-Class', engine: '5.5L 8-cyl',
  };

  it('the fingerprint changes when the vehicle does', () => {
    // A technician can leave Search Parts open while somebody edits the
    // vehicle in another tab.
    const seen = vehicleFingerprint(vehicle);
    const now = vehicleFingerprint({ ...vehicle, engine: '3.5L V6' });
    expect(seen).not.toBe(now);
  });

  it('the route compares them and returns a conflict', () => {
    expect(ROUTE).toContain('if (current !== input.fingerprint)');
    expect(ROUTE).toContain("code: 'VEHICLE_CHANGED'");
    expect(ROUTE).toContain('status: 409');
  });

  it('the fingerprint is required in the request', () => {
    expect(ROUTE).toMatch(/fingerprint: z\.string\(\)/);
  });
});

describe('failures are named, and never raw', () => {
  it.each([
    'UNAUTHORIZED', 'VEHICLE_CHANGED', 'CANDIDATE_INVALID',
    'PROVIDER_UNAVAILABLE', 'PERSIST_FAILED', 'CONFIRMED',
  ])('has an explicit %s state', code => {
    expect(ROUTE).toContain(`'${code}'`);
  });

  it('never returns a database or provider message', () => {
    expect(ROUTE).not.toMatch(/error\.message/);
    expect(ROUTE).not.toMatch(/err\.message/);
  });

  it('does not log the attacker-controlled id', () => {
    // The logger call itself, not the surrounding code — the validation a few
    // lines above legitimately names the field.
    const call = ROUTE.match(/logger\.warn\('parts\.confirm\.candidate_not_offered'[^)]*\)/)?.[0];
    expect(call).toBeTruthy();
    expect(call).not.toContain('providerVehicleId');
    expect(call).toContain('shopId');
  });

  it('a provider outage does not fail the estimate', () => {
    expect(ROUTE).toContain('You can still add parts manually.');
  });
});

describe('confirmation is idempotent', () => {
  it('upserts on the unique key rather than inserting', () => {
    // Choosing the same variant twice must not create two mappings, and two
    // concurrent confirmations must converge rather than race.
    expect(STORE).toContain('.upsert(');
    expect(STORE).toContain("onConflict: 'shop_id,vehicle_id,provider'");
  });

  it('records who confirmed and when', () => {
    expect(STORE).toContain('confirmed_by_user_id');
    expect(STORE).toContain('confirmed_at');
    expect(ROUTE).toContain('confirmedByUserId: auth.userId');
  });

  it('does not touch canonical vehicle fields', () => {
    // Enriching the vehicle from a provider selection is a separate,
    // deliberate feature — not a side effect of confirming a variant.
    expect(ROUTE).not.toMatch(/from\('vehicles'\)[\s\S]{0,200}\.update\(/);
    expect(STORE).not.toMatch(/from\('vehicles'\)[\s\S]{0,200}\.update\(/);
  });
});
