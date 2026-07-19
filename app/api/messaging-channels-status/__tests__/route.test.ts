import { NextRequest, NextResponse } from 'next/server';

const SHOP_A = '11111111-1111-4111-8111-111111111111';
const SHOP_B = '22222222-2222-4222-8222-222222222222';

const mockRequireShopRole = jest.fn();
jest.mock('@/lib/serverAuth', () => ({
  requireShopRole: (...args: unknown[]) => mockRequireShopRole(...args),
}));

type ChainResult = { data?: unknown; error?: unknown };
let secretsRowResult: ChainResult;
const mockFrom = jest.fn((table: string) => {
  if (table !== 'shop_messaging_secrets') throw new Error(`Unexpected table: ${table}`);
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve(secretsRowResult),
      }),
    }),
  };
});

jest.mock('@/lib/supabase-server', () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import { GET } from '../route';

function makeReq(shopId: string | null, token = 'tok'): NextRequest {
  const url = shopId ? `http://localhost/api/messaging-channels-status?shopId=${shopId}` : 'http://localhost/api/messaging-channels-status';
  return new NextRequest(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

function forbidden() {
  return { ok: false as const, response: NextResponse.json({ error: 'Not a member of this shop' }, { status: 403 }) };
}
function unauthorized() {
  return { ok: false as const, response: NextResponse.json({ error: 'Missing bearer token' }, { status: 401 }) };
}
function roleOk(role: 'owner' | 'manager' | 'advisor') {
  return { ok: true as const, context: { userId: 'u1', role } };
}

beforeEach(() => {
  mockRequireShopRole.mockReset();
  mockFrom.mockClear();
  secretsRowResult = { data: null, error: null };
});

describe('GET /api/messaging-channels-status', () => {
  it('returns 400 for a missing/invalid shopId, without checking authorization', async () => {
    const res = await GET(makeReq(null));
    expect(res.status).toBe(400);
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireShopRole.mockResolvedValue(unauthorized());
    const res = await GET(makeReq(SHOP_A));
    expect(res.status).toBe(401);
  });

  it('rejects a technician with 403 — only owner/manager/advisor may check channel status', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    const res = await GET(makeReq(SHOP_A));
    expect(res.status).toBe(403);
    expect(mockRequireShopRole).toHaveBeenCalledWith(expect.anything(), SHOP_A, ['owner', 'manager', 'advisor']);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('authorizes against only the explicit query shopId — a caller authorized for shop A is never authorized for shop B', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    await GET(makeReq(SHOP_B));
    expect(mockRequireShopRole).toHaveBeenCalledWith(expect.anything(), SHOP_B, ['owner', 'manager', 'advisor']);
  });

  it.each(['owner', 'manager', 'advisor'] as const)('allows an authorized %s to check status', async (role) => {
    mockRequireShopRole.mockResolvedValue(roleOk(role));
    secretsRowResult = { data: { sms_enabled: true, whatsapp_enabled: false }, error: null };
    const res = await GET(makeReq(SHOP_A));
    expect(res.status).toBe(200);
  });

  it('returns enabled flags only — no configured, fromNumber, sid, token, or bot id in the response, ever', async () => {
    mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
    secretsRowResult = { data: { sms_enabled: true, whatsapp_enabled: true }, error: null };
    const res = await GET(makeReq(SHOP_A));
    const body = await res.json();
    expect(body).toEqual({ enabled: { sms: true, whatsapp: true, line: false, telegram: false } });
    expect(body).not.toHaveProperty('configured');
    expect(body.enabled).not.toHaveProperty('configured');
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/sid|token|bot|from/i);
  });

  it('LINE and Telegram are always reported as disabled, regardless of any stored flag', async () => {
    mockRequireShopRole.mockResolvedValue(roleOk('owner'));
    // Even if line/telegram were somehow enabled at the storage layer, the
    // status endpoint must not report them enabled — sending is refused
    // unconditionally by send-message.
    secretsRowResult = { data: { sms_enabled: false, whatsapp_enabled: false, line_enabled: true, telegram_enabled: true }, error: null };
    const res = await GET(makeReq(SHOP_A));
    const body = await res.json();
    expect(body.enabled.line).toBe(false);
    expect(body.enabled.telegram).toBe(false);
  });

  it('treats a missing row as all-disabled, not an error', async () => {
    mockRequireShopRole.mockResolvedValue(roleOk('manager'));
    secretsRowResult = { data: null, error: null };
    const res = await GET(makeReq(SHOP_A));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toEqual({ sms: false, whatsapp: false, line: false, telegram: false });
  });

  it('returns a sanitized 500 on a database error, not raw error detail', async () => {
    mockRequireShopRole.mockResolvedValue(roleOk('owner'));
    secretsRowResult = { data: null, error: { message: 'relation "shop_messaging_secrets" column x does not exist' } };
    const res = await GET(makeReq(SHOP_A));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('relation');
    expect(body.error).not.toContain('column');
  });
});
