/**
 * Vehicle rules, ported out of the browser service.
 *
 * The rules here were derived from the 109 vehicles in production, not from
 * what a vehicle "should" look like. That distinction is the point: enforcing
 * a tidier model would reject records the business already holds.
 */
import { normalizeVin, vinProblem, DEFAULT_VEHICLE_STATUS, createVehicleDomain, VehicleError } from '../vehicles';
import { createDomainContext } from '../context';

describe('VIN normalisation', () => {
  it('trims and upper-cases', () => {
    expect(normalizeVin('  1hgbh41jxmn109186 ')).toBe('1HGBH41JXMN109186');
  });

  it('treats missing as empty rather than throwing', () => {
    expect(normalizeVin(undefined)).toBe('');
    expect(normalizeVin(null)).toBe('');
  });

  it('does not "correct" ambiguous characters', () => {
    // A VIN read off a scanner or a windscreen can contain 0/O or 1/I. Quietly
    // rewriting one produces a record that looks right and matches nothing.
    expect(normalizeVin('1O0I5')).toBe('1O0I5');
  });

  it('does not strip inner spaces into a false VIN', () => {
    // Better to refuse than to invent: "AB 123" is a data-entry problem a
    // person should see, not something to silently compact into "AB123".
    expect(vinProblem(normalizeVin('AB 123'))).toBeTruthy();
  });
});

describe('VIN validity, as the data actually is', () => {
  it('accepts an empty VIN', () => {
    // 15 production vehicles have none. Refusing would block the no-VIN
    // intake the product supports.
    expect(vinProblem('')).toBeNull();
  });

  it('accepts the ordinary 17-character VIN', () => {
    expect(vinProblem('1HGBH41JXMN109186')).toBeNull();
  });

  it.each([16, 22])('accepts a %s-character VIN that already exists in the estate', len => {
    // One 16 and one 22 are real rows. Fixing the length at 17 would make them
    // uneditable, which is a worse outcome than a loose rule.
    expect(vinProblem('A'.repeat(len))).toBeNull();
  });

  it('refuses characters a VIN cannot contain', () => {
    expect(vinProblem('ABC/123')).toBeTruthy();
    expect(vinProblem('ABC 123')).toBeTruthy();
  });

  it('refuses something absurdly long', () => {
    expect(vinProblem('A'.repeat(33))).toBeTruthy();
  });
});

describe('creating a vehicle', () => {
  const SHOP = '11111111-1111-4111-8111-111111111111';
  const OTHER = '99999999-9999-4999-8999-999999999999';

  const context = createDomainContext({
    organizationId: '22222222-2222-4222-8222-222222222222',
    shopId: SHOP,
    shopIds: [SHOP],
    actor: { userId: null, type: 'api', role: 'api_key' },
    capabilities: ['vehicles.read', 'vehicles.manage', 'customers.read'],
  });

  /** A db that records what it was asked, and answers a customer lookup. */
  function fakeDb(customerVisible: boolean) {
    const calls: { table: string; op: string; payload?: unknown; filters: Record<string, unknown> }[] = [];
    const builder = (table: string, op: string, payload?: unknown) => {
      const filters: Record<string, unknown> = {};
      calls.push({ table, op, payload, filters });
      const chain: Record<string, unknown> = {};
      const record = (k: string) => (a: unknown, b?: unknown) => { filters[k] = b ?? a; return chain; };
      Object.assign(chain, {
        select: () => chain, eq: record('eq'), in: record('in'), order: () => chain,
        maybeSingle: () => Promise.resolve({
          data: table === 'customers' ? (customerVisible ? { id: 'C-1' } : null) : null,
          error: null,
        }),
        single: () => Promise.resolve({
          data: { id: 'V-1', shop_id: SHOP, vin: (payload as Record<string, unknown>)?.vin, label: 'Hilux', customer_id: (payload as Record<string, unknown>)?.customer_id },
          error: null,
        }),
      });
      return chain;
    };
    return {
      calls,
      from: (table: string) => ({
        select: () => builder(table, 'select'),
        insert: (payload: unknown) => builder(table, 'insert', payload),
        update: (payload: unknown) => builder(table, 'update', payload),
      }),
      rpc: () => Promise.resolve({ data: null, error: null }),
    };
  }

  it('refuses a customer that is not visible to this tenant', async () => {
    const db = fakeDb(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vehicles = createVehicleDomain({ db: db as any, context });

    await expect(vehicles.create({ label: 'Hilux', customerId: 'C-FOREIGN' }))
      .rejects.toMatchObject({ reason: 'CUSTOMER_NOT_FOUND' });

    // The decisive part: nothing was inserted.
    expect(db.calls.filter(c => c.table === 'vehicles' && c.op === 'insert')).toHaveLength(0);
  });

  it('scopes the customer lookup to the tenant, never globally', async () => {
    const db = fakeDb(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createVehicleDomain({ db: db as any, context }).create({ label: 'Hilux', customerId: 'C-1' });

    const lookup = db.calls.find(c => c.table === 'customers');
    expect(lookup).toBeTruthy();
    // Without this .in('shop_id', shopIds) the service-role client would
    // happily confirm any customer id in the database.
    expect(lookup!.filters.in).toEqual([SHOP]);
  });

  it('writes shop_id from the context, not from input', async () => {
    const db = fakeDb(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createVehicleDomain({ db: db as any, context }).create({
      label: 'Hilux',
      // A caller trying to redirect the write. VehicleInput has no shop field,
      // so this is inert — the test states that plainly.
      ...({ shopId: OTHER, shop_id: OTHER } as object),
    });

    const insert = db.calls.find(c => c.table === 'vehicles' && c.op === 'insert');
    expect((insert!.payload as Record<string, unknown>).shop_id).toBe(SHOP);
  });

  it('stores a normalised VIN', async () => {
    const db = fakeDb(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createVehicleDomain({ db: db as any, context }).create({ label: 'Hilux', vin: ' 1hgbh41jxmn109186 ' });

    const insert = db.calls.find(c => c.table === 'vehicles' && c.op === 'insert');
    expect((insert!.payload as Record<string, unknown>).vin).toBe('1HGBH41JXMN109186');
  });

  it('allows a vehicle with no customer and no VIN', async () => {
    const db = fakeDb(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createVehicleDomain({ db: db as any, context }).create({ label: 'Unowned classic' });

    const insert = db.calls.find(c => c.table === 'vehicles' && c.op === 'insert');
    expect((insert!.payload as Record<string, unknown>).customer_id).toBeNull();
    expect((insert!.payload as Record<string, unknown>).vin).toBe('');
    // No customer lookup should have happened at all.
    expect(db.calls.filter(c => c.table === 'customers')).toHaveLength(0);
  });

  it('refuses a blank label', async () => {
    const db = fakeDb(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(createVehicleDomain({ db: db as any, context }).create({ label: '   ' }))
      .rejects.toBeInstanceOf(VehicleError);
  });

  it('refuses without the capability', async () => {
    const db = fakeDb(true);
    const readOnly = createDomainContext({
      organizationId: '2', shopId: SHOP, shopIds: [SHOP],
      actor: { userId: null, type: 'api', role: 'api_key' },
      capabilities: ['vehicles.read'],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(createVehicleDomain({ db: db as any, context: readOnly }).create({ label: 'Hilux' }))
      .rejects.toThrow();
  });

  it('starts a vehicle in the documented default status', () => {
    // The old service used 'Active' on create and 'No open jobs' on update, so
    // a vehicle silently changed status the first time anyone edited it.
    expect(DEFAULT_VEHICLE_STATUS).toBe('Active');
  });
});
