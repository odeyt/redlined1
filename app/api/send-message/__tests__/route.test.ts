import { NextRequest, NextResponse } from 'next/server';

const SHOP_A = '11111111-1111-4111-8111-111111111111';
const SHOP_B = '22222222-2222-4222-8222-222222222222';

const mockRequireShopRole = jest.fn();
jest.mock('@/lib/serverAuth', () => ({
  requireShopRole: (...args: unknown[]) => mockRequireShopRole(...args),
}));

const mockIsRateLimited = jest.fn((..._args: unknown[]) => false);
jest.mock('@/lib/apiHelpers', () => {
  const actual = jest.requireActual('@/lib/apiHelpers');
  return { ...actual, isRateLimited: (...args: unknown[]) => mockIsRateLimited(...args) };
});

type ChainResult = { data?: unknown; error?: unknown };
function makeChain(result: ChainResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  };
  return chain;
}

let tableResults: Record<string, ChainResult>;
const mockFrom = jest.fn((table: string) => makeChain(tableResults[table] ?? { data: null, error: null }));

jest.mock('@/lib/supabase-server', () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { POST } from '../route';

const VALID_DOC = {
  type: 'invoice',
  number: 'INV-0001',
  vehicle: '2020 Civic',
  total: 'USD 100.00',
  status: 'sent',
  shopName: 'Test Shop',
};

function makeReq(body: unknown, token = 'tok'): NextRequest {
  return new NextRequest('http://localhost/api/send-message', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function forbidden() {
  return { ok: false as const, response: NextResponse.json({ error: 'Insufficient role for this action' }, { status: 403 }) };
}
function unauthorized(message = 'Missing bearer token') {
  return { ok: false as const, response: NextResponse.json({ error: message }, { status: 401 }) };
}
function roleOk(role: 'owner' | 'manager' | 'advisor') {
  return { ok: true as const, context: { userId: 'u1', role } };
}

beforeEach(() => {
  mockRequireShopRole.mockReset();
  mockIsRateLimited.mockReset();
  mockIsRateLimited.mockReturnValue(false);
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ sid: 'SM123' }) });
  mockFrom.mockClear();
  tableResults = {
    job_cards: { data: { customer: 'Jane Doe', customer_phone: '+15551230000', customer_email: 'jane@example.com' }, error: null },
    customers: { data: { name: 'Jane Doe', phone: '+15551230000', email: 'jane@example.com' }, error: null },
    estimates: { data: { customer_id: 'cust-1', customer_name: 'Jane Doe' }, error: null },
    invoices: { data: { customer_id: 'cust-1', customer: 'Jane Doe' }, error: null },
    // Credentials now live in shop_messaging_secrets (server-only, no anon/
    // authenticated grants) — never shop_settings.messaging_settings.
    shop_messaging_secrets: {
      data: { twilio_sid: 'AC1', twilio_token: 'tok', twilio_from: '+15550000000', sms_enabled: true, whatsapp_enabled: true, line_token: null, line_enabled: false, telegram_bot_token: null, telegram_enabled: false },
      error: null,
    },
  };
});

describe('POST /api/send-message — recipient resolution', () => {
  it('returns 400 for a missing/invalid body, without checking authorization', async () => {
    const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A }));
    expect(res.status).toBe(400);
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });

  describe('authorization', () => {
    it('rejects a missing bearer token with 401', async () => {
      mockRequireShopRole.mockResolvedValue(unauthorized('Missing bearer token'));
      const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
      expect(res.status).toBe(401);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects an expired/invalid token with 401', async () => {
      mockRequireShopRole.mockResolvedValue(unauthorized('Invalid or expired token'));
      const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toMatch(/expired/i);
    });

    it('rejects an unauthorized technician with 403 and sends nothing', async () => {
      mockRequireShopRole.mockResolvedValue(forbidden());
      const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
      expect(res.status).toBe(403);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('requires shop membership scoped to the explicit body shopId, restricted to owner/manager/advisor', async () => {
      mockRequireShopRole.mockResolvedValue(forbidden());
      await POST(makeReq({ channel: 'sms', shopId: SHOP_B, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
      expect(mockRequireShopRole).toHaveBeenCalledWith(expect.anything(), SHOP_B, ['owner', 'manager', 'advisor']);
    });

    it.each(['owner', 'manager', 'advisor'] as const)('allows an authorized %s to send', async (role) => {
      mockRequireShopRole.mockResolvedValue(roleOk(role));
      const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
      expect(res.status).toBe(200);
    });
  });

  describe('LINE/Telegram — unconditionally disabled', () => {
    it.each(['line', 'telegram'] as const)('rejects channel=%s with 400 before any DB lookup', async (channel) => {
      mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
      const res = await POST(makeReq({ channel, shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/not available yet/i);
      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('cross-shop / missing resource', () => {
    it('returns 404 for a resourceId that belongs to a different shop (job)', async () => {
      mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
      tableResults.job_cards = { data: null, error: null }; // scoped query found nothing for this shopId
      const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-999', doc: VALID_DOC }));
      expect(res.status).toBe(404);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns the same 404 for a nonexistent resourceId as for a cross-shop one (no enumeration signal)', async () => {
      mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
      tableResults.customers = { data: null, error: null };
      const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'customer', resourceId: 'C-nonexistent', doc: VALID_DOC }));
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Resource not found');
    });
  });

  describe('DB lookup errors are distinguished from not-found (never silently treated as 404)', () => {
    it('returns 500 with a sanitized message when the recipient lookup itself errors', async () => {
      mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
      tableResults.job_cards = { data: null, error: { message: 'connection reset by peer: internal db host xyz' } };
      const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).not.toMatch(/internal db host xyz/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns 500 (not 404) when the customer-hop lookup for an estimate/invoice errors', async () => {
      mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
      tableResults.estimates = { data: { customer_id: 'cust-1', customer_name: 'Jane' }, error: null };
      tableResults.customers = { data: null, error: { message: 'db timeout' } };
      const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'estimate', resourceId: 'EST-1', doc: VALID_DOC }));
      expect(res.status).toBe(500);
    });

    it('returns 500 with a sanitized message when the messaging-settings lookup errors', async () => {
      mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
      tableResults.shop_messaging_secrets = { data: null, error: { message: 'internal db host xyz unreachable' } };
      const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).not.toMatch(/internal db host xyz/);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('missing trusted recipient', () => {
    it('returns 400 when an estimate has no linked customer_id (never falls back to a caller value)', async () => {
      mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
      tableResults.estimates = { data: { customer_id: null, customer_name: 'Walk-in' }, error: null };
      const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'estimate', resourceId: 'EST-1', doc: VALID_DOC }));
      expect(res.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns 400 when the resolved customer has no phone on file', async () => {
      mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
      tableResults.job_cards = { data: { customer: 'Jane Doe', customer_phone: null, customer_email: 'jane@example.com' }, error: null };
      const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/no phone number on file/i);
    });
  });

  describe('arbitrary destination injection — SendMessageSchema is .strict(), so these are REJECTED, not silently stripped', () => {
    it('rejects a request containing a "to" field with 400, and sends nothing', async () => {
      mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
      const res = await POST(makeReq({
        channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC,
        to: '+19995551234', // not in the schema — must be REJECTED (strict), never read
      }));
      expect(res.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('rejects other injected contact-looking fields (customerPhone, email) with 400', async () => {
      mockRequireShopRole.mockResolvedValue(roleOk('owner'));
      const res = await POST(makeReq({
        channel: 'whatsapp', shopId: SHOP_A, resourceType: 'invoice', resourceId: 'INV-0001', doc: VALID_DOC,
        customerPhone: '+19995551234', email: 'attacker@evil.com',
      }));
      expect(res.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('with no injected fields, resolves and sends to the DB-resolved phone (positive control for the above)', async () => {
      mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
      await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockFetch.mock.calls[0] as [string, { body: string }];
      const smsParams = new URLSearchParams(init.body);
      expect(smsParams.get('To')).toBe('+15551230000');
    });
  });

  it('rejects when the channel is not enabled in shop_messaging_secrets', async () => {
    mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
    tableResults.shop_messaging_secrets = { data: { twilio_sid: 'AC1', twilio_token: 'tok', twilio_from: '+15550000000', sms_enabled: false, whatsapp_enabled: false, line_token: null, line_enabled: false, telegram_bot_token: null, telegram_enabled: false }, error: null };
    const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('treats a missing shop_messaging_secrets row as "no channel enabled" (never throws, never falls back)', async () => {
    mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
    tableResults.shop_messaging_secrets = { data: null, error: null };
    const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 429 when the shop-level rate limit is exceeded', async () => {
    mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
    mockIsRateLimited.mockReturnValueOnce(true);
    const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
    expect(res.status).toBe(429);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sanitizes a provider error instead of returning its raw message', async () => {
    mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
    mockFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({ message: 'internal twilio account xyz misconfigured' }) });
    const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).not.toMatch(/internal twilio account xyz/);
  });

  it('never includes the Twilio SID/token in any response, even on success', async () => {
    mockRequireShopRole.mockResolvedValue(roleOk('advisor'));
    const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'job', resourceId: 'JC-1', doc: VALID_DOC }));
    const body = await res.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('AC1');
    expect(serialized).not.toContain('tok');
  });

  it('succeeds for a resource resolved via a customer record directly', async () => {
    mockRequireShopRole.mockResolvedValue(roleOk('manager'));
    const res = await POST(makeReq({ channel: 'sms', shopId: SHOP_A, resourceType: 'customer', resourceId: 'C-1', doc: VALID_DOC }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
