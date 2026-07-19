import { NextRequest, NextResponse } from 'next/server';

const SHOP_A = '11111111-1111-4111-8111-111111111111';
const SHOP_B = '22222222-2222-4222-8222-222222222222';
const OWNER_USER = '44444444-4444-4444-8444-444444444444';

const mockRequireShopRole = jest.fn();
jest.mock('@/lib/serverAuth', () => ({
  requireShopRole: (...args: unknown[]) => mockRequireShopRole(...args),
}));

type ChainResult = { data?: unknown; error?: unknown };

let secretsRowResult: ChainResult;
let upsertResult: ChainResult;
let capturedUpsertRow: Record<string, unknown> | null;
const mockFrom = jest.fn((table: string) => {
  if (table !== 'shop_messaging_secrets') throw new Error(`Unexpected table: ${table}`);
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve(secretsRowResult),
      }),
    }),
    upsert: (row: Record<string, unknown>) => {
      capturedUpsertRow = row;
      return Promise.resolve(upsertResult);
    },
  };
});

jest.mock('@/lib/supabase-server', () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import { GET, PUT } from '../route';

function makeGetReq(shopId: string | null, token = 'tok'): NextRequest {
  const url = shopId ? `http://localhost/api/shop-messaging-secrets?shopId=${shopId}` : 'http://localhost/api/shop-messaging-secrets';
  return new NextRequest(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}
function makePutReq(body: unknown, token = 'tok'): NextRequest {
  return new NextRequest('http://localhost/api/shop-messaging-secrets', {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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
  mockFrom.mockClear();
  secretsRowResult = { data: null, error: null };
  upsertResult = { data: null, error: null };
  capturedUpsertRow = null;
});

describe('GET /api/shop-messaging-secrets', () => {
  it('returns 400 for a missing/invalid shopId, without checking authorization', async () => {
    const res = await GET(makeGetReq(null));
    expect(res.status).toBe(400);
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireShopRole.mockResolvedValue(unauthorized());
    const res = await GET(makeGetReq(SHOP_A));
    expect(res.status).toBe(401);
  });

  it('rejects a manager/advisor/technician with 403 — only owner may read status', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    const res = await GET(makeGetReq(SHOP_A));
    expect(res.status).toBe(403);
    expect(mockRequireShopRole).toHaveBeenCalledWith(expect.anything(), SHOP_A, ['owner']);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('authorizes against only the explicit query shopId — owner of shop A is never authorized for shop B', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    await GET(makeGetReq(SHOP_B));
    expect(mockRequireShopRole).toHaveBeenCalledWith(expect.anything(), SHOP_B, ['owner']);
  });

  it('never returns a secret value, even when every channel is configured', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    secretsRowResult = {
      data: {
        twilio_sid: 'ACxxxxSECRETxxxx',
        twilio_token: 'super-secret-auth-token',
        twilio_from: '+15551234567',
        sms_enabled: true,
        whatsapp_enabled: true,
        line_token: 'line-notify-secret-token',
        line_enabled: true,
        telegram_bot_token: '123456:secret-bot-token',
        telegram_enabled: true,
      },
      error: null,
    };
    const res = await GET(makeGetReq(SHOP_A));
    expect(res.status).toBe(200);
    const body = await res.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('SECRET');
    expect(serialized).not.toContain('super-secret-auth-token');
    expect(serialized).not.toContain('line-notify-secret-token');
    expect(serialized).not.toContain('secret-bot-token');
    expect(body).toEqual({
      sms: { configured: true, enabled: true, fromNumber: '+15551234567' },
      whatsapp: { configured: true, enabled: true },
      line: { configured: true, enabled: true },
      telegram: { configured: true, enabled: true },
    });
  });

  it('reports unconfigured/disabled channels with no row present', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    secretsRowResult = { data: null, error: null };
    const res = await GET(makeGetReq(SHOP_A));
    const body = await res.json();
    expect(body).toEqual({
      sms: { configured: false, enabled: false, fromNumber: null },
      whatsapp: { configured: false, enabled: false },
      line: { configured: false, enabled: false },
      telegram: { configured: false, enabled: false },
    });
  });

  it('returns a sanitized 500 on a database error, not raw error detail', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    secretsRowResult = { data: null, error: { message: 'relation "shop_messaging_secrets" column x does not exist' } };
    const res = await GET(makeGetReq(SHOP_A));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('relation');
    expect(body.error).not.toContain('column');
  });
});

describe('PUT /api/shop-messaging-secrets', () => {
  it('returns 400 for a malformed body, without checking authorization', async () => {
    const res = await PUT(makePutReq({ shopId: SHOP_A, to: 'evil@example.com' }));
    expect(res.status).toBe(400);
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });

  it('rejects unknown fields (strict schema) — e.g. an injected "to" destination', async () => {
    const res = await PUT(makePutReq({ shopId: SHOP_A, smsEnabled: true, to: '+15559998888' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireShopRole.mockResolvedValue(unauthorized());
    const res = await PUT(makePutReq({ shopId: SHOP_A, smsEnabled: true }));
    expect(res.status).toBe(401);
  });

  it('rejects a manager/advisor/technician with 403 — only owner may write credentials', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    const res = await PUT(makePutReq({ shopId: SHOP_A, smsEnabled: true }));
    expect(res.status).toBe(403);
    expect(mockRequireShopRole).toHaveBeenCalledWith(expect.anything(), SHOP_A, ['owner']);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('authorizes against only the explicit body shopId — owner of shop A is never authorized for shop B', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    await PUT(makePutReq({ shopId: SHOP_B, smsEnabled: true }));
    expect(mockRequireShopRole).toHaveBeenCalledWith(expect.anything(), SHOP_B, ['owner']);
  });

  it('never echoes a submitted secret value back in the response', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    const res = await PUT(makePutReq({
      shopId: SHOP_A,
      twilioSid: 'ACsubmittedSID',
      twilioToken: 'submitted-token-value',
      lineToken: 'submitted-line-token',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const serialized = JSON.stringify(body);
    expect(body).toEqual({ success: true });
    expect(serialized).not.toContain('submitted-token-value');
    expect(serialized).not.toContain('submitted-line-token');
  });

  it('omitted fields leave existing values unchanged (partial update), only touches provided keys', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    await PUT(makePutReq({ shopId: SHOP_A, smsEnabled: true }));
    expect(capturedUpsertRow).not.toBeNull();
    expect(capturedUpsertRow).not.toHaveProperty('twilio_sid');
    expect(capturedUpsertRow).not.toHaveProperty('twilio_token');
    expect(capturedUpsertRow).not.toHaveProperty('line_token');
    expect(capturedUpsertRow).toMatchObject({ shop_id: SHOP_A, sms_enabled: true });
  });

  it('an empty string clears a credential (sets column to null)', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    await PUT(makePutReq({ shopId: SHOP_A, twilioToken: '' }));
    expect(capturedUpsertRow).toMatchObject({ shop_id: SHOP_A, twilio_token: null });
  });

  it('returns a sanitized 500 on a database error, not raw error detail', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    upsertResult = { data: null, error: { message: 'duplicate key value violates unique constraint "shop_messaging_secrets_pkey"' } };
    const res = await PUT(makePutReq({ shopId: SHOP_A, smsEnabled: true }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('constraint');
    expect(body.error).not.toContain('duplicate key');
  });
});
