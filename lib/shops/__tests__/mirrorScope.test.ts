/**
 * The mirror scope, EXECUTED.
 *
 * The rest of this feature is defended by tests that read route files as
 * strings, because a Next route needs a request to exercise and there is no
 * harness. That technique cannot say whether the rules are right — only that
 * the text is present. So the two pieces that hold the actual rules, the scope
 * derivation and the vehicle load, are run here against a fake database.
 *
 * The test that matters most is "a mirror link is not enough": a shop-level
 * link must not, on its own, let a person read a shop they do not belong to.
 * That rule exists in SQL for the browser's read — the RLS policy in
 * `2026-07-31_shop_mirrors_read_access.sql` checks both sides — and every
 * query here runs as `service_role`, which bypasses RLS entirely. This file is
 * the only thing that checks it on the server path.
 */
import { readableShopIds } from '../mirrorScope';
import { loadCanonicalVehicle } from '@/lib/parts/vehicleResolution/loadVehicle';

type Row = Record<string, unknown>;

const tables: Record<string, Row[]> = {
  shop_mirrors: [],
  shop_users: [],
  vehicles: [],
};

/**
 * Set to a table name to make that table's next query fail.
 *
 * The fake returns the matching rows AND an error, rather than `data: null`.
 * That is deliberate and it is what makes the fail-closed tests mean
 * something: with `data: null` the code falls closed by accident — `?? []`
 * yields an empty set whether or not anyone checked `error` — so the test
 * passed even with the error check deleted. Handing back rows alongside the
 * error is the shape that actually leaks, and it is not hypothetical: a
 * caller that ignores PostgREST's `error` and trusts `data` is exactly the
 * bug this guards against.
 */
let failingTable: string | null = null;

jest.mock('@/lib/supabaseServer', () => ({
  getAdminDb: () => ({
    from: (table: string) => {
      const filters: Array<(r: Row) => boolean> = [];
      let single = false;

      const api: Record<string, unknown> = {
        select: () => api,
        eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return api; },
        in: (k: string, vs: unknown[]) => { filters.push(r => vs.includes(r[k])); return api; },
        maybeSingle: () => { single = true; return api; },
        // Thenable, so the same builder serves `await q.eq(...)` and
        // `await q.eq(...).in(...)` and `await q.eq(...).maybeSingle()`.
        then: (resolve: (v: unknown) => unknown) => {
          const rows = (tables[table] ?? []).filter(r => filters.every(f => f(r)));
          const data = single ? (rows[0] ?? null) : rows;
          if (failingTable === table) {
            // Rows AND an error. See the note on `failingTable`.
            return resolve({ data, error: { message: 'simulated failure' } });
          }
          return resolve({ data, error: null });
        },
      };
      return api;
    },
  }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

const SHOP_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const SHOP_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const SHOP_C = 'cccccccc-0000-0000-0000-000000000003';
const OWNER = 'user-owner';
const TECH = 'user-tech-location-one-only';

beforeEach(() => {
  tables.shop_mirrors = [];
  tables.shop_users = [];
  tables.vehicles = [];
  failingTable = null;
});

describe('the active shop is always in scope', () => {
  it('returns it alone when nothing mirrors it', async () => {
    tables.shop_users = [{ user_id: OWNER, shop_id: SHOP_A }];
    expect(await readableShopIds(OWNER, SHOP_A)).toEqual([SHOP_A]);
  });

  it('and is always first, so callers can rely on [0]', async () => {
    tables.shop_mirrors = [{ shop_id: SHOP_A, mirror_shop_id: SHOP_B }];
    tables.shop_users = [
      { user_id: OWNER, shop_id: SHOP_A }, { user_id: OWNER, shop_id: SHOP_B },
    ];
    const scope = await readableShopIds(OWNER, SHOP_A);
    expect(scope[0]).toBe(SHOP_A);
  });

  it('returns nothing at all when there is no active shop', async () => {
    expect(await readableShopIds(OWNER, '')).toEqual([]);
  });
});

describe('a mirror link widens the scope', () => {
  it('includes a mirrored shop the user belongs to', async () => {
    tables.shop_mirrors = [{ shop_id: SHOP_A, mirror_shop_id: SHOP_B }];
    tables.shop_users = [
      { user_id: OWNER, shop_id: SHOP_A }, { user_id: OWNER, shop_id: SHOP_B },
    ];
    expect(await readableShopIds(OWNER, SHOP_A)).toEqual([SHOP_A, SHOP_B]);
  });

  it('is directional — B mirroring A does not let A read B', async () => {
    // The production rows are configured in both directions independently.
    // A one-way link is a real configuration and must not be symmetrised.
    tables.shop_mirrors = [{ shop_id: SHOP_B, mirror_shop_id: SHOP_A }];
    tables.shop_users = [
      { user_id: OWNER, shop_id: SHOP_A }, { user_id: OWNER, shop_id: SHOP_B },
    ];
    expect(await readableShopIds(OWNER, SHOP_A)).toEqual([SHOP_A]);
    expect(await readableShopIds(OWNER, SHOP_B)).toEqual([SHOP_B, SHOP_A]);
  });

  it('does not duplicate the active shop if it mirrors itself', async () => {
    tables.shop_mirrors = [{ shop_id: SHOP_A, mirror_shop_id: SHOP_A }];
    tables.shop_users = [{ user_id: OWNER, shop_id: SHOP_A }];
    expect(await readableShopIds(OWNER, SHOP_A)).toEqual([SHOP_A]);
  });

  it('orders mirrors deterministically', async () => {
    tables.shop_mirrors = [
      { shop_id: SHOP_A, mirror_shop_id: SHOP_C },
      { shop_id: SHOP_A, mirror_shop_id: SHOP_B },
    ];
    tables.shop_users = [
      { user_id: OWNER, shop_id: SHOP_A },
      { user_id: OWNER, shop_id: SHOP_B },
      { user_id: OWNER, shop_id: SHOP_C },
    ];
    expect(await readableShopIds(OWNER, SHOP_A)).toEqual([SHOP_A, SHOP_B, SHOP_C]);
  });
});

describe('a mirror link is not enough on its own', () => {
  /**
   * THE security property of this feature.
   *
   * `shop_mirrors` links SHOPS. It says nothing about which PEOPLE may cross
   * the link. A technician employed only at Location 1 must not read Location
   * 2's vehicles just because the owner mirrored the two.
   */
  it('excludes a mirrored shop the user does not belong to', async () => {
    tables.shop_mirrors = [{ shop_id: SHOP_A, mirror_shop_id: SHOP_B }];
    tables.shop_users = [
      { user_id: OWNER, shop_id: SHOP_A }, { user_id: OWNER, shop_id: SHOP_B },
      { user_id: TECH, shop_id: SHOP_A },   // not a member of B
    ];

    expect(await readableShopIds(OWNER, SHOP_A)).toEqual([SHOP_A, SHOP_B]);
    expect(await readableShopIds(TECH, SHOP_A)).toEqual([SHOP_A]);
  });

  it('excludes every mirrored shop for a user who belongs to none of them', async () => {
    tables.shop_mirrors = [
      { shop_id: SHOP_A, mirror_shop_id: SHOP_B },
      { shop_id: SHOP_A, mirror_shop_id: SHOP_C },
    ];
    tables.shop_users = [{ user_id: TECH, shop_id: SHOP_A }];
    expect(await readableShopIds(TECH, SHOP_A)).toEqual([SHOP_A]);
  });

  it('ignores another user\'s memberships', async () => {
    // The membership query filters on user_id. Dropping that filter would
    // make one member of Location 2 grant access to everyone at Location 1.
    tables.shop_mirrors = [{ shop_id: SHOP_A, mirror_shop_id: SHOP_B }];
    tables.shop_users = [
      { user_id: TECH, shop_id: SHOP_A },
      { user_id: OWNER, shop_id: SHOP_B },
    ];
    expect(await readableShopIds(TECH, SHOP_A)).toEqual([SHOP_A]);
  });

  it('returns nothing for a user with no id', async () => {
    tables.shop_mirrors = [{ shop_id: SHOP_A, mirror_shop_id: SHOP_B }];
    tables.shop_users = [{ user_id: OWNER, shop_id: SHOP_B }];
    expect(await readableShopIds('', SHOP_A)).toEqual([SHOP_A]);
  });
});

describe('it fails closed', () => {
  /**
   * A widened scope is a tenancy decision. It must never be the CONSEQUENCE
   * of a failure — the failure mode of a broken mirror lookup is the
   * behaviour we had before mirroring, not the behaviour we had before
   * tenancy.
   */
  it('narrows to the active shop when the mirror lookup fails', async () => {
    tables.shop_mirrors = [{ shop_id: SHOP_A, mirror_shop_id: SHOP_B }];
    tables.shop_users = [
      { user_id: OWNER, shop_id: SHOP_A }, { user_id: OWNER, shop_id: SHOP_B },
    ];
    failingTable = 'shop_mirrors';
    expect(await readableShopIds(OWNER, SHOP_A)).toEqual([SHOP_A]);
  });

  it('narrows to the active shop when the membership lookup fails', async () => {
    // The dangerous one: the links are already in hand at this point, so a
    // naive implementation would return them unfiltered.
    tables.shop_mirrors = [{ shop_id: SHOP_A, mirror_shop_id: SHOP_B }];
    tables.shop_users = [
      { user_id: OWNER, shop_id: SHOP_A }, { user_id: OWNER, shop_id: SHOP_B },
    ];
    failingTable = 'shop_users';
    expect(await readableShopIds(OWNER, SHOP_A)).toEqual([SHOP_A]);
  });
});

describe('the loader reports which shop owns the vehicle', () => {
  const VEHICLE = 'vvvvvvvv-0000-0000-0000-000000000009';

  beforeEach(() => {
    tables.vehicles = [{
      id: VEHICLE, shop_id: SHOP_B, vin: 'WDD2221631A000000', year: 2014,
      make: 'MERCEDES-BENZ', model: 'S-CLASS', trim: null, engine: null,
      transmission: null, fuel_type: null, engine_code: null,
      displacement_l: null, cylinders: null,
    }];
  });

  it('finds a mirrored vehicle and names its real owner', async () => {
    // The whole point: searching from A, the car lives in B, and the mapping
    // written afterwards has to be keyed to B.
    const loaded = await loadCanonicalVehicle([SHOP_A, SHOP_B], VEHICLE);
    expect(loaded).not.toBeNull();
    expect(loaded!.ownerShopId).toBe(SHOP_B);
    expect(loaded!.vehicle.model).toBe('S-CLASS');
  });

  it('refuses a vehicle outside the scope', async () => {
    expect(await loadCanonicalVehicle([SHOP_A], VEHICLE)).toBeNull();
  });

  /**
   * Honest about what this proves.
   *
   * Deleting the `if (!scope.length)` guard does NOT make this test fail,
   * because the fake models `.in('shop_id', [])` as matching nothing — which
   * is what PostgREST does. The fake is my assumption about the driver, so it
   * cannot test that assumption.
   *
   * What the guard defends against is precisely that assumption being wrong,
   * which no fake can exercise. Its presence is pinned by a source assertion
   * in `variantConfirmSecurity.test.ts` instead. This case documents the
   * intended answer and would catch a change that made an empty scope throw
   * or return a row.
   */
  it('refuses everything when the scope is empty', async () => {
    expect(await loadCanonicalVehicle([], VEHICLE)).toBeNull();
    expect(await loadCanonicalVehicle([''], VEHICLE)).toBeNull();
  });

  it('refuses when no vehicle id is given', async () => {
    expect(await loadCanonicalVehicle([SHOP_A, SHOP_B], '')).toBeNull();
  });
});
