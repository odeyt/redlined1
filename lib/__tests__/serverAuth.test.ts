import { NextRequest } from 'next/server';

const mockGetUser = jest.fn();

// Controls what the final step of a `.from('shop_users').select(...).eq(...).eq(...)`
// chain resolves to. requireShopRole ends with `.maybeSingle()`; isLastOwner
// awaits the eq-chain directly (array result) — both are supported by making
// the chain itself thenable in addition to exposing `.maybeSingle()`.
let maybeSingleResult: unknown = { data: null, error: null };
let arrayResult: unknown = { data: [], error: null };

const mockEq2 = jest.fn(() => ({
  maybeSingle: () => Promise.resolve(maybeSingleResult),
  then: (resolve: (v: unknown) => unknown) => resolve(arrayResult),
}));
const mockEq1 = jest.fn(() => ({ eq: mockEq2 }));
const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock('@/lib/supabase-server', () => ({
  createServerSupabase: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

import { requireShopRole, isLastOwner } from '../serverAuth';

function makeReq(token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/test', { headers });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockClear();
  maybeSingleResult = { data: null, error: null };
  arrayResult = { data: [], error: null };
});

describe('requireShopRole', () => {
  it('rejects a missing shopId with 400', async () => {
    const result = await requireShopRole(makeReq('tok'), undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it('rejects a non-string shopId with 400 (type forgery)', async () => {
    const result = await requireShopRole(makeReq('tok'), { shopId: 'shop-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it('rejects a request with no bearer token with 401, before any DB lookup', async () => {
    const result = await requireShopRole(makeReq(), 'shop-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('rejects a malformed/invalid bearer token with 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } });
    const result = await requireShopRole(makeReq('not-a-real-jwt'), 'shop-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('rejects an expired token (getUser errors) with 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'token expired' } });
    const result = await requireShopRole(makeReq('expired-tok'), 'shop-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('rejects a valid user who is not a member of the requested shop with 403', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    maybeSingleResult = { data: null, error: null };
    const result = await requireShopRole(makeReq('tok'), 'shop-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      const body = await result.response.json();
      expect(body.error).toBe('Not a member of this shop');
    }
  });

  it('rejects a member whose role is not in the allowed list with 403', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    maybeSingleResult = { data: { role: 'technician' }, error: null };
    const result = await requireShopRole(makeReq('tok'), 'shop-1', ['owner']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('allows a valid owner and returns the resolved context', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    maybeSingleResult = { data: { role: 'owner' }, error: null };
    const result = await requireShopRole(makeReq('tok'), 'shop-1', ['owner']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.context).toEqual({ userId: 'user-1', role: 'owner' });
  });

  it('allows any of the default roles when no allowlist is passed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-2' } }, error: null });
    maybeSingleResult = { data: { role: 'technician' }, error: null };
    const result = await requireShopRole(makeReq('tok'), 'shop-1');
    expect(result.ok).toBe(true);
  });

  it('blocks cross-shop access: a member of shop A gets 403 when requesting shop B', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    maybeSingleResult = { data: null, error: null };
    const result = await requireShopRole(makeReq('tok'), 'shop-B');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mockFrom).toHaveBeenCalledWith('shop_users');
    expect(mockEq1).toHaveBeenCalledWith('shop_id', 'shop-B');
  });

  it('returns the same 403 body whether the shop does not exist or the user just is not a member', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    maybeSingleResult = { data: null, error: null };
    const a = await requireShopRole(makeReq('tok'), 'nonexistent-shop');
    const b = await requireShopRole(makeReq('tok'), 'shop-user-not-in');
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok && !b.ok) {
      const [bodyA, bodyB] = await Promise.all([a.response.json(), b.response.json()]);
      expect(bodyA).toEqual(bodyB);
    }
  });

  it('treats a DB error on the membership lookup as unauthorized, not a crash', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    maybeSingleResult = { data: null, error: { message: 'connection reset' } };
    const result = await requireShopRole(makeReq('tok'), 'shop-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});

describe('isLastOwner', () => {
  it('returns true when the target user is the only owner row', async () => {
    arrayResult = { data: [{ user_id: 'owner-1' }], error: null };
    const result = await isLastOwner('shop-1', 'owner-1');
    expect(result).toBe(true);
  });

  it('returns false when another owner row exists', async () => {
    arrayResult = { data: [{ user_id: 'owner-1' }, { user_id: 'owner-2' }], error: null };
    const result = await isLastOwner('shop-1', 'owner-1');
    expect(result).toBe(false);
  });

  it('returns false for a user who is not among the owner rows at all (not the concern of this check)', async () => {
    arrayResult = { data: [{ user_id: 'owner-2' }], error: null };
    const result = await isLastOwner('shop-1', 'some-other-user');
    expect(result).toBe(false);
  });

  it('fails safe (returns true, blocking the caller) when the lookup errors', async () => {
    arrayResult = { data: null, error: { message: 'connection reset' } };
    const result = await isLastOwner('shop-1', 'owner-1');
    expect(result).toBe(true);
  });
});
