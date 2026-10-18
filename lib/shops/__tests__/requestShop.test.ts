/**
 * The shop an API request acts for, now that D1 users belong to two shops.
 * `.limit(1)` used to pick one at random — including the archived D1 Imports.
 */
import { chooseRequestShop, resolveRequestShop } from '../requestShop';

const LOC2 = '90b72748-bf01-4456-999f-f4ba48091606';
const D1 = '38d55fae-741b-4bac-b520-f96eed65bf38';
const OTHER = 'eeeeeeee-0000-4000-8000-00000000000e';

const both = [
  { shop_id: D1, role: 'owner', archived: true },
  { shop_id: LOC2, role: 'owner', archived: false },
];

describe('chooseRequestShop', () => {
  it('lands on Location 2, never the archived D1 Imports, when nothing is named', () => {
    expect(chooseRequestShop(null, both)?.shop_id).toBe(LOC2);
    // Order of rows must not matter (D1 sorts first by id).
    expect(chooseRequestShop(null, [...both].reverse())?.shop_id).toBe(LOC2);
  });

  it('honours the named shop when the caller belongs to it', () => {
    expect(chooseRequestShop(LOC2, both)?.shop_id).toBe(LOC2);
    expect(chooseRequestShop(D1, both)?.shop_id).toBe(D1);
  });

  it('ignores a named shop the caller does not belong to', () => {
    expect(chooseRequestShop(OTHER, both)?.shop_id).toBe(LOC2);
  });

  it('applies the role filter to the named shop too', () => {
    const mixed = [{ shop_id: LOC2, role: 'technician' }, { shop_id: OTHER, role: 'owner' }];
    expect(chooseRequestShop(LOC2, mixed, ['owner', 'manager'])?.shop_id).toBe(OTHER);
    expect(chooseRequestShop(LOC2, [{ shop_id: LOC2, role: 'technician' }], ['owner'])).toBeNull();
  });

  it('still answers for someone whose only shop is archived', () => {
    expect(chooseRequestShop(null, [{ shop_id: D1, role: 'technician', archived: true }])?.shop_id).toBe(D1);
  });

  it('returns null with no memberships', () => {
    expect(chooseRequestShop(LOC2, [])).toBeNull();
  });
});

describe('resolveRequestShop', () => {
  function client(memberships: { shop_id: string; role: string }[], archivedIds: string[], shopsFail = false) {
    return {
      from(table: string) {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          in: () => q,
          then: (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) => {
            if (table === 'shop_users') return Promise.resolve({ data: memberships, error: null }).then(resolve);
            if (shopsFail) return Promise.reject(new Error('nope')).then(resolve, reject);
            return Promise.resolve({
              data: memberships.map(m => ({ id: m.shop_id, archived_at: archivedIds.includes(m.shop_id) ? 'x' : null })),
              error: null,
            }).then(resolve);
          },
        };
        return q;
      },
    };
  }

  it('picks Location 2 for a merged D1 user with no header', async () => {
    const c = client([{ shop_id: D1, role: 'technician' }, { shop_id: LOC2, role: 'technician' }], [D1]);
    expect((await resolveRequestShop(c, 'u1', null))?.shop_id).toBe(LOC2);
  });

  it('falls back to a stable order when archive state cannot be read', async () => {
    const c = client([{ shop_id: LOC2, role: 'owner' }, { shop_id: D1, role: 'owner' }], [D1], true);
    expect((await resolveRequestShop(c, 'u1', LOC2))?.shop_id).toBe(LOC2);
  });

  it('returns null for no user', async () => {
    expect(await resolveRequestShop(client([], []), '', LOC2)).toBeNull();
  });
});
