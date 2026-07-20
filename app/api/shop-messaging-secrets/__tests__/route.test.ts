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

const COMPLETE_ROW = {
  twilio_sid: 'ACxxxxxxxxxxxxxxxx',
  twilio_token: 'auth-token-value',
  twilio_from: '+15550000000',
  sms_enabled: true,
  whatsapp_enabled: true,
};

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
    secretsRowResult = { data: COMPLETE_ROW, error: null };
    const res = await GET(makeGetReq(SHOP_A));
    expect(res.status).toBe(200);
    const body = await res.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('ACxxxxxxxxxxxxxxxx');
    expect(serialized).not.toContain('auth-token-value');
    expect(body).toEqual({
      sms: { configured: true, enabled: true, fromNumber: '+15550000000', complete: true },
      whatsapp: { configured: true, enabled: true, complete: true },
      line: { configured: false, enabled: false },
      telegram: { configured: false, enabled: false },
    });
  });

  it('reports unconfigured/disabled channels with no row present', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    secretsRowResult = { data: null, error: null };
    const res = await GET(makeGetReq(SHOP_A));
    const body = await res.json();
    expect(body).toEqual({
      sms: { configured: false, enabled: false, fromNumber: null, complete: false },
      whatsapp: { configured: false, enabled: false, complete: false },
      line: { configured: false, enabled: false },
      telegram: { configured: false, enabled: false },
    });
  });

  it('reports complete: false when only some Twilio fields are present', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    secretsRowResult = { data: { twilio_sid: 'AC1', twilio_token: 'tok', twilio_from: null, sms_enabled: false, whatsapp_enabled: false }, error: null };
    const res = await GET(makeGetReq(SHOP_A));
    const body = await res.json();
    expect(body.sms.configured).toBe(true); // token present
    expect(body.sms.complete).toBe(false); // from missing
  });

  it('always reports LINE and Telegram as unconfigured/disabled, even if the reserved columns somehow held data', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    secretsRowResult = {
      data: {
        ...COMPLETE_ROW,
        // These columns are reserved for a future migration and are no
        // longer written by this API, but simulate stale/manually-inserted
        // data to prove the response never surfaces it as active.
        line_token: 'stale-line-token', line_enabled: true,
        telegram_bot_token: 'stale-bot-token', telegram_enabled: true,
      },
      error: null,
    };
    const res = await GET(makeGetReq(SHOP_A));
    const body = await res.json();
    expect(body.line).toEqual({ configured: false, enabled: false });
    expect(body.telegram).toEqual({ configured: false, enabled: false });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('stale-line-token');
    expect(serialized).not.toContain('stale-bot-token');
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

  describe('LINE/Telegram fields are rejected outright — the schema does not accept them', () => {
    it.each([
      ['lineToken', 'some-line-token'],
      ['lineEnabled', true],
      ['telegramBotToken', 'some-bot-token'],
      ['telegramEnabled', true],
    ])('rejects a request containing %s with 400, before any authorization or DB call', async (field, value) => {
      const res = await PUT(makePutReq({ shopId: SHOP_A, [field]: value }));
      expect(res.status).toBe(400);
      expect(mockRequireShopRole).not.toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('rejects a request combining a valid Twilio field with a LINE field', async () => {
      const res = await PUT(makePutReq({ shopId: SHOP_A, twilioSid: 'AC1', lineEnabled: true }));
      expect(res.status).toBe(400);
      expect(mockFrom).not.toHaveBeenCalled();
    });
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
    secretsRowResult = { data: null, error: null };
    const res = await PUT(makePutReq({
      shopId: SHOP_A,
      twilioSid: 'ACsubmittedSID',
      twilioToken: 'submitted-token-value',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const serialized = JSON.stringify(body);
    expect(body).toEqual({ success: true });
    expect(serialized).not.toContain('submitted-token-value');
  });

  describe('Twilio completeness invariant', () => {
    it('cannot enable SMS without any Twilio credentials configured', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      secretsRowResult = { data: null, error: null };
      const res = await PUT(makePutReq({ shopId: SHOP_A, smsEnabled: true }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/incomplete Twilio configuration/i);
      expect(capturedUpsertRow).toBeNull(); // never reached the upsert
    });

    it('cannot enable WhatsApp without complete credentials (partial: sid+token but no from)', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      secretsRowResult = { data: { twilio_sid: 'AC1', twilio_token: 'tok', twilio_from: null, sms_enabled: false, whatsapp_enabled: false }, error: null };
      const res = await PUT(makePutReq({ shopId: SHOP_A, whatsappEnabled: true }));
      expect(res.status).toBe(400);
      expect(capturedUpsertRow).toBeNull();
    });

    it('cannot enable SMS in the SAME request as submitting incomplete credentials', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      secretsRowResult = { data: null, error: null };
      const res = await PUT(makePutReq({ shopId: SHOP_A, smsEnabled: true, twilioSid: 'AC1', twilioToken: 'tok' /* no from */ }));
      expect(res.status).toBe(400);
      expect(capturedUpsertRow).toBeNull();
    });

    it('cannot clear a required field (twilioToken) while SMS remains enabled from the existing stored state', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      secretsRowResult = { data: COMPLETE_ROW, error: null };
      // smsEnabled not sent at all — it remains true from the existing row.
      const res = await PUT(makePutReq({ shopId: SHOP_A, twilioToken: '' }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/incomplete Twilio configuration/i);
      expect(capturedUpsertRow).toBeNull();
    });

    it('cannot clear a required field (twilioFrom) while WhatsApp remains enabled', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      secretsRowResult = { data: COMPLETE_ROW, error: null };
      const res = await PUT(makePutReq({ shopId: SHOP_A, twilioFrom: '' }));
      expect(res.status).toBe(400);
      expect(capturedUpsertRow).toBeNull();
    });

    it('allows clearing a field while simultaneously disabling the channel', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      secretsRowResult = { data: COMPLETE_ROW, error: null };
      const res = await PUT(makePutReq({ shopId: SHOP_A, twilioToken: '', smsEnabled: false, whatsappEnabled: false }));
      expect(res.status).toBe(200);
      expect(capturedUpsertRow).toMatchObject({ shop_id: SHOP_A, twilio_token: null, sms_enabled: false, whatsapp_enabled: false });
    });

    it('can store credentials while channels remain disabled', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      secretsRowResult = { data: null, error: null };
      const res = await PUT(makePutReq({ shopId: SHOP_A, twilioSid: 'AC1', twilioToken: 'tok', twilioFrom: '+15550000000' }));
      expect(res.status).toBe(200);
      expect(capturedUpsertRow).toMatchObject({ shop_id: SHOP_A, twilio_sid: 'AC1', twilio_token: 'tok', twilio_from: '+15550000000' });
      expect(capturedUpsertRow).not.toHaveProperty('sms_enabled');
      expect(capturedUpsertRow).not.toHaveProperty('whatsapp_enabled');
    });

    it('can enable SMS after credentials already exist and are complete', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      secretsRowResult = { data: { twilio_sid: 'AC1', twilio_token: 'tok', twilio_from: '+15550000000', sms_enabled: false, whatsapp_enabled: false }, error: null };
      const res = await PUT(makePutReq({ shopId: SHOP_A, smsEnabled: true }));
      expect(res.status).toBe(200);
      expect(capturedUpsertRow).toMatchObject({ shop_id: SHOP_A, sms_enabled: true });
    });

    it('can enable SMS in the same request that completes the configuration', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      secretsRowResult = { data: null, error: null };
      const res = await PUT(makePutReq({ shopId: SHOP_A, smsEnabled: true, twilioSid: 'AC1', twilioToken: 'tok', twilioFrom: '+15550000000' }));
      expect(res.status).toBe(200);
      expect(capturedUpsertRow).toMatchObject({ shop_id: SHOP_A, sms_enabled: true, twilio_sid: 'AC1', twilio_token: 'tok', twilio_from: '+15550000000' });
    });
  });

  it('omitted fields leave existing values unchanged (partial update), only touches provided keys', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    secretsRowResult = { data: COMPLETE_ROW, error: null };
    await PUT(makePutReq({ shopId: SHOP_A, smsEnabled: true }));
    expect(capturedUpsertRow).not.toBeNull();
    expect(capturedUpsertRow).not.toHaveProperty('twilio_sid');
    expect(capturedUpsertRow).not.toHaveProperty('twilio_token');
    expect(capturedUpsertRow).toMatchObject({ shop_id: SHOP_A, sms_enabled: true });
  });

  it('the fetch-existing-row lookup error is sanitized, not raw error detail', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    secretsRowResult = { data: null, error: { message: 'internal db host xyz unreachable' } };
    const res = await PUT(makePutReq({ shopId: SHOP_A, smsEnabled: true }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toMatch(/internal db host xyz/);
  });

  it('returns a sanitized 500 on an upsert database error, not raw error detail', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    secretsRowResult = { data: null, error: null };
    upsertResult = { data: null, error: { message: 'duplicate key value violates unique constraint "shop_messaging_secrets_pkey"' } };
    const res = await PUT(makePutReq({ shopId: SHOP_A, twilioSid: 'AC1', twilioToken: 'tok', twilioFrom: '+15550000000' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('constraint');
    expect(body.error).not.toContain('duplicate key');
  });
});
