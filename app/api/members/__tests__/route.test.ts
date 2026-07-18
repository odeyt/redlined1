import { NextRequest, NextResponse } from 'next/server';

const SHOP_A = '11111111-1111-4111-8111-111111111111';
const SHOP_B = '22222222-2222-4222-8222-222222222222';
const TARGET_USER = '33333333-3333-4333-8333-333333333333';
const OWNER_USER = '44444444-4444-4444-8444-444444444444';

const mockRequireShopRole = jest.fn();
const mockIsLastOwner = jest.fn();
jest.mock('@/lib/serverAuth', () => ({
  requireShopRole: (...args: unknown[]) => mockRequireShopRole(...args),
  isLastOwner: (...args: unknown[]) => mockIsLastOwner(...args),
}));

type ChainResult = { data?: unknown; error?: unknown };
function makeChain(result: ChainResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    delete: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  };
  return chain;
}

let tableResults: Record<string, ChainResult>;
const mockGetUserById = jest.fn();
const mockFrom = jest.fn((table: string) => makeChain(tableResults[table] ?? { data: null, error: null }));

jest.mock('@/lib/supabase-server', () => ({
  createServerSupabase: () => ({
    from: mockFrom,
    auth: { admin: { getUserById: (...args: unknown[]) => mockGetUserById(...args) } },
  }),
}));

import { DELETE, GET } from '../route';

function makeDeleteReq(body: unknown, token = 'tok'): NextRequest {
  return new NextRequest('http://localhost/api/members', {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function makeGetReq(shopId: string | null, token = 'tok'): NextRequest {
  const url = shopId ? `http://localhost/api/members?shopId=${shopId}` : 'http://localhost/api/members';
  return new NextRequest(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

function forbidden() {
  return { ok: false as const, response: NextResponse.json({ error: 'Not a member of this shop' }, { status: 403 }) };
}
function unauthorized() {
  return { ok: false as const, response: NextResponse.json({ error: 'Missing bearer token' }, { status: 401 }) };
}
function ownerOk() {
  return { ok: true as const, context: { userId: OWNER_USER, role: 'owner' as const } };
}

beforeEach(() => {
  mockRequireShopRole.mockReset();
  mockIsLastOwner.mockReset();
  mockGetUserById.mockReset();
  mockFrom.mockClear();
  tableResults = {
    shop_users: { data: null, error: null },
    profiles: { data: [], error: null },
  };
});

describe('DELETE /api/members', () => {
  it('returns 400 for a non-UUID userId/shopId, without checking authorization', async () => {
    const res = await DELETE(makeDeleteReq({ userId: 'not-a-uuid', shopId: SHOP_A }));
    expect(res.status).toBe(400);
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireShopRole.mockResolvedValue(unauthorized());
    const res = await DELETE(makeDeleteReq({ userId: TARGET_USER, shopId: SHOP_A }));
    expect(res.status).toBe(401);
  });

  it('rejects a non-owner with 403 and performs no lookup/deletion', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    const res = await DELETE(makeDeleteReq({ userId: TARGET_USER, shopId: SHOP_A }));
    expect(res.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('authorizes against only the explicit body shopId — owner of shop A is never authorized for shop B', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    await DELETE(makeDeleteReq({ userId: TARGET_USER, shopId: SHOP_B }));
    expect(mockRequireShopRole).toHaveBeenCalledWith(expect.anything(), SHOP_B, ['owner']);
  });

  it('returns 404 when the target user is not a member of this shop (submitted userId cannot reach outside the authorized shop)', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    tableResults.shop_users = { data: null, error: null };
    const res = await DELETE(makeDeleteReq({ userId: TARGET_USER, shopId: SHOP_A }));
    expect(res.status).toBe(404);
  });

  it('blocks removing the last owner of a shop with 409', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    tableResults.shop_users = { data: { role: 'owner' }, error: null };
    mockIsLastOwner.mockResolvedValue(true);
    const res = await DELETE(makeDeleteReq({ userId: OWNER_USER, shopId: SHOP_A }));
    expect(res.status).toBe(409);
  });

  it('allows removing a non-owner member', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    tableResults.shop_users = { data: { role: 'technician' }, error: null };
    const res = await DELETE(makeDeleteReq({ userId: TARGET_USER, shopId: SHOP_A }));
    expect(res.status).toBe(200);
    expect(mockIsLastOwner).not.toHaveBeenCalled();
  });

  it('allows removing an owner when another owner remains', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    tableResults.shop_users = { data: { role: 'owner' }, error: null };
    mockIsLastOwner.mockResolvedValue(false);
    const res = await DELETE(makeDeleteReq({ userId: OWNER_USER, shopId: SHOP_A }));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/members', () => {
  it('returns 400 for a missing/invalid shopId', async () => {
    const res = await GET(makeGetReq(null));
    expect(res.status).toBe(400);
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });

  it('returns 403 for a caller who is not a member of the shop (no roster leaked)', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    const res = await GET(makeGetReq(SHOP_A));
    expect(res.status).toBe(403);
  });

  it('returns the roster using bounded profile lookups, not an unbounded listUsers scan', async () => {
    mockRequireShopRole.mockResolvedValue({ ok: true, context: { userId: TARGET_USER, role: 'technician' } });
    tableResults.shop_users = { data: [{ user_id: OWNER_USER, role: 'owner' }, { user_id: TARGET_USER, role: 'technician' }], error: null };
    tableResults.profiles = {
      data: [{ id: OWNER_USER, email: 'owner@shop.com' }, { id: TARGET_USER, email: 'tech@shop.com' }],
      error: null,
    };
    const res = await GET(makeGetReq(SHOP_A));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toHaveLength(2);
    expect(body.members.map((m: { email: string }) => m.email)).toEqual(
      expect.arrayContaining(['owner@shop.com', 'tech@shop.com'])
    );
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('falls back to a bounded per-id getUserById only for ids missing from profiles', async () => {
    mockRequireShopRole.mockResolvedValue({ ok: true, context: { userId: TARGET_USER, role: 'technician' } });
    tableResults.shop_users = { data: [{ user_id: TARGET_USER, role: 'technician' }], error: null };
    tableResults.profiles = { data: [], error: null };
    mockGetUserById.mockResolvedValue({ data: { user: { id: TARGET_USER, email: 'fallback@shop.com' } } });
    const res = await GET(makeGetReq(SHOP_A));
    const body = await res.json();
    expect(body.members[0].email).toBe('fallback@shop.com');
    expect(mockGetUserById).toHaveBeenCalledTimes(1);
    expect(mockGetUserById).toHaveBeenCalledWith(TARGET_USER);
  });
});
