import { NextRequest } from 'next/server';

/**
 * Who may manage feature flags, and in which shop.
 *
 * The routes read the caller's role from THEIR OWN membership in the shop the
 * `x-shop-id` header names. The Settings screen never sent that header, so
 * every owner was evaluated in shop '' and refused. These pin the rule from
 * both sides: an owner of the named shop is recognised; a manager is not; and
 * the header cannot borrow someone else's role, because the lookup is always
 * filtered by the signed-in user.
 */

const USER = { id: 'user-owner' };
// role by `${user_id}:${shop_id}`
const memberships: Record<string, string> = {
  'user-owner:shop-1': 'owner',
  'user-owner:shop-2': 'manager',
};
const lookups: { userId: string; shopId: string }[] = [];

jest.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined }),
}));
jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: USER } }) },
    from: () => {
      const f: Record<string, string> = {};
      const chain = {
        select: () => chain,
        eq: (col: string, val: string) => { f[col] = val; return chain; },
        maybeSingle: async () => {
          lookups.push({ userId: f.user_id, shopId: f.shop_id });
          const role = memberships[`${f.user_id}:${f.shop_id}`];
          return { data: role ? { role } : null, error: null };
        },
      };
      return chain;
    },
  }),
}));

const mockInvalidate = jest.fn();
jest.mock('@/lib/featureFlags/featureFlagService', () => ({
  getFlags: async () => ({ intent_intake: true }),
  getAllFlagRows: async () => [{ id: 'f1', flag_key: 'intent_intake', enabled: true, scope: 'global' }],
  invalidateCache: (...a: unknown[]) => mockInvalidate(...a),
  getCurrentEnvironment: () => 'production',
}));
const mockUpsert = jest.fn(async () => ({ error: null }));
jest.mock('@/lib/supabaseServer', () => ({
  getAdminDb: () => ({ from: () => ({ upsert: mockUpsert }) }),
}));

import { GET } from '../route';
import { PATCH } from '../[key]/route';

function get(shopId?: string) {
  return new NextRequest('https://example.com/api/feature-flags', {
    headers: shopId ? { 'x-shop-id': shopId } : {},
  });
}
function patch(shopId?: string) {
  return new NextRequest('https://example.com/api/feature-flags/intent_intake', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(shopId ? { 'x-shop-id': shopId } : {}) },
    body: JSON.stringify({ enabled: false, scope: 'global' }),
  });
}
const params = { params: Promise.resolve({ key: 'intent_intake' }) };

beforeEach(() => {
  lookups.length = 0;
  mockInvalidate.mockClear();
  mockUpsert.mockClear();
});

describe('GET /api/feature-flags', () => {
  it('gives an owner of the named shop the rows the Settings screen lists', async () => {
    const json = await (await GET(get('shop-1'))).json();
    expect(json.rows).toHaveLength(1);
    expect(json.flags).toEqual({ intent_intake: true });
    expect(lookups).toEqual([{ userId: 'user-owner', shopId: 'shop-1' }]);
  });

  it('gives a manager the evaluated flags but no rows', async () => {
    const json = await (await GET(get('shop-2'))).json();
    expect(json.rows).toBeUndefined();
    expect(json.flags).toEqual({ intent_intake: true });
  });

  it('without a shop, finds no role — the old behaviour, and why the header is required', async () => {
    const json = await (await GET(get())).json();
    expect(json.rows).toBeUndefined();
    expect(lookups).toEqual([{ userId: 'user-owner', shopId: '' }]);
  });

  it('only ever reads the signed-in user\'s own membership', async () => {
    await GET(get('shop-someone-else-owns'));
    expect(lookups.every(l => l.userId === 'user-owner')).toBe(true);
  });
});

describe('PATCH /api/feature-flags/[key]', () => {
  it('lets an owner of the named shop toggle, and clears every shop\'s cache', async () => {
    const res = await PATCH(patch('shop-1'), params);
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    // No argument = all shops: a global flag applies to both locations.
    expect(mockInvalidate).toHaveBeenCalledWith();
  });

  it('refuses a manager', async () => {
    const res = await PATCH(patch('shop-2'), params);
    expect(res.status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('refuses a request that names no shop', async () => {
    const res = await PATCH(patch(), params);
    expect(res.status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
