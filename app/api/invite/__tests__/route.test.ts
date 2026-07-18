import { NextRequest, NextResponse } from 'next/server';

const SHOP_A = '11111111-1111-4111-8111-111111111111';
const SHOP_B = '22222222-2222-4222-8222-222222222222';
const EXISTING_USER = '33333333-3333-4333-8333-333333333333';
const NEW_USER = '44444444-4444-4444-8444-444444444444';
const OWNER_USER = '55555555-5555-4555-8555-555555555555';

const mockRequireShopRole = jest.fn();
const mockIsLastOwner = jest.fn();
jest.mock('@/lib/serverAuth', () => ({
  requireShopRole: (...args: unknown[]) => mockRequireShopRole(...args),
  isLastOwner: (...args: unknown[]) => mockIsLastOwner(...args),
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
    upsert: () => chain,
    update: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  };
  return chain;
}

let tableResults: Record<string, ChainResult>;
const mockGenerateLink = jest.fn();
const mockCreateUser = jest.fn();
const mockUpdateUserById = jest.fn();
const mockFrom = jest.fn((table: string) => makeChain(tableResults[table] ?? { data: null, error: null }));

jest.mock('@/lib/supabase-server', () => ({
  createServerSupabase: () => ({
    from: mockFrom,
    auth: {
      admin: {
        generateLink: (...args: unknown[]) => mockGenerateLink(...args),
        createUser: (...args: unknown[]) => mockCreateUser(...args),
        updateUserById: (...args: unknown[]) => mockUpdateUserById(...args),
      },
    },
  }),
}));

const mockResendSend = jest.fn().mockResolvedValue({});
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: (...args: unknown[]) => mockResendSend(...args) } })),
}));

import { POST, PATCH } from '../route';

function makeReq(method: string, body: unknown, token = 'tok'): NextRequest {
  return new NextRequest('http://localhost/api/invite', {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function forbidden() {
  return { ok: false as const, response: NextResponse.json({ error: 'Insufficient role for this action' }, { status: 403 }) };
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
  mockIsRateLimited.mockReset();
  mockIsRateLimited.mockReturnValue(false);
  mockGenerateLink.mockReset();
  mockCreateUser.mockReset();
  mockUpdateUserById.mockReset();
  mockResendSend.mockClear();
  mockFrom.mockClear();
  tableResults = {
    shops: { data: { name: 'Test Shop' }, error: null },
    profiles: { data: null, error: null },
    shop_users: { data: null, error: null },
  };
  process.env.NEXT_PUBLIC_SITE_URL = 'https://redlined1.test';
});

describe('POST /api/invite', () => {
  it('returns 400 for an invalid email, without checking authorization', async () => {
    const res = await POST(makeReq('POST', { email: 'not-an-email', role: 'technician', shopId: SHOP_A }));
    expect(res.status).toBe(400);
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-UUID shopId', async () => {
    const res = await POST(makeReq('POST', { email: 'a@b.com', role: 'technician', shopId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
  });

  it('propagates 401 from requireShopRole', async () => {
    mockRequireShopRole.mockResolvedValue(unauthorized());
    const res = await POST(makeReq('POST', { email: 'a@b.com', role: 'technician', shopId: SHOP_A }));
    expect(res.status).toBe(401);
  });

  it('propagates 403 from requireShopRole for a non-owner, and never touches shop_users', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    const res = await POST(makeReq('POST', { email: 'a@b.com', role: 'technician', shopId: SHOP_A }));
    expect(res.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalledWith('shop_users');
  });

  it('authorizes against the explicit body shopId, requiring the owner role — an owner of shop A is never checked against shop B', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    await POST(makeReq('POST', { email: 'a@b.com', role: 'technician', shopId: SHOP_B }));
    expect(mockRequireShopRole).toHaveBeenCalledWith(expect.anything(), SHOP_B, ['owner']);
  });

  it('returns 429 when the shop-level invite rate limit is exceeded', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    mockIsRateLimited.mockReturnValueOnce(true);
    const res = await POST(makeReq('POST', { email: 'a@b.com', role: 'technician', shopId: SHOP_A }));
    expect(res.status).toBe(429);
    expect(mockFrom).not.toHaveBeenCalledWith('profiles');
  });

  describe('new account (no existing profile for this email)', () => {
    beforeEach(() => {
      tableResults.profiles = { data: null, error: null };
      mockGenerateLink.mockResolvedValue({
        data: { user: { id: NEW_USER }, properties: { action_link: 'https://redlined1.test/auth/v1/verify?token=abc&type=invite' } },
        error: null,
      });
    });

    it('never calls createUser or updateUserById (no server-generated password anywhere)', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      await POST(makeReq('POST', { email: 'new@b.com', role: 'technician', shopId: SHOP_A }));
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockUpdateUserById).not.toHaveBeenCalled();
    });

    it('succeeds and the response never contains a password field', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      const res = await POST(makeReq('POST', { email: 'new@b.com', role: 'technician', shopId: SHOP_A }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.accountStatus).toBe('invited');
      expect(JSON.stringify(body)).not.toMatch(/password/i);
    });

    it('sends an email containing the Supabase invite link, never a plaintext password', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      await POST(makeReq('POST', { email: 'new@b.com', role: 'technician', shopId: SHOP_A }));
      expect(mockResendSend).toHaveBeenCalledTimes(1);
      const sentHtml = (mockResendSend.mock.calls[0][0] as { html: string }).html;
      expect(sentHtml).toContain('https://redlined1.test/auth/v1/verify?token=abc&amp;type=invite');
      expect(sentHtml).not.toMatch(/temp password/i);
      expect(sentHtml).not.toMatch(/D1-[A-Za-z0-9]{8}/);
    });

    it('returns 409 without creating membership when the email is already registered despite a missed profiles lookup', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      mockGenerateLink.mockResolvedValue({ data: null, error: { message: 'A user with this email address has already been registered', code: 'email_exists' } });
      const res = await POST(makeReq('POST', { email: 'ghost@b.com', role: 'technician', shopId: SHOP_A }));
      expect(res.status).toBe(409);
      expect(mockResendSend).not.toHaveBeenCalled();
    });

    it('HTML-escapes the generated invite action link before inserting it into the email', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      mockGenerateLink.mockResolvedValue({
        data: { user: { id: NEW_USER }, properties: { action_link: 'https://redlined1.test/auth/v1/verify?token=abc&type=invite&x="><script>alert(1)</script>' } },
        error: null,
      });
      await POST(makeReq('POST', { email: 'new@b.com', role: 'technician', shopId: SHOP_A }));
      const sentHtml = (mockResendSend.mock.calls[0][0] as { html: string }).html;
      expect(sentHtml).not.toContain('<script>alert(1)</script>');
      expect(sentHtml).not.toContain('"><script>');
    });

    it('returns the invite action link in the response when the notification email fails to send, so the workflow is never left unclear', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      mockResendSend.mockRejectedValueOnce(new Error('resend outage detail xyz'));
      const res = await POST(makeReq('POST', { email: 'new@b.com', role: 'technician', shopId: SHOP_A }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.warning).toBeDefined();
      expect(body.warning).not.toMatch(/resend outage detail xyz/);
      expect(body.actionLink).toContain('https://redlined1.test/auth/v1/verify');
    });

    it('returns 502 with a sanitized message on an unrelated generateLink failure', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      mockGenerateLink.mockResolvedValue({ data: null, error: { message: 'internal supabase outage detail xyz' } });
      const res = await POST(makeReq('POST', { email: 'x@b.com', role: 'technician', shopId: SHOP_A }));
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).not.toMatch(/outage detail xyz/);
    });
  });

  describe('existing account (profile already exists for this email)', () => {
    beforeEach(() => {
      tableResults.profiles = { data: { id: EXISTING_USER }, error: null };
    });

    it('never resets the password and never calls the invite/link/create flow', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      await POST(makeReq('POST', { email: 'existing@b.com', role: 'manager', shopId: SHOP_A }));
      expect(mockGenerateLink).not.toHaveBeenCalled();
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockUpdateUserById).not.toHaveBeenCalled();
    });

    it('adds them to the shop and reports accountStatus "added_existing", with no password anywhere', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      const res = await POST(makeReq('POST', { email: 'existing@b.com', role: 'manager', shopId: SHOP_A }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.accountStatus).toBe('added_existing');
      expect(JSON.stringify(body)).not.toMatch(/password/i);
    });

    it('sends a plain "added to shop" notification with no password in the email body', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      await POST(makeReq('POST', { email: 'existing@b.com', role: 'manager', shopId: SHOP_A }));
      const sentHtml = (mockResendSend.mock.calls[0][0] as { html: string }).html;
      expect(sentHtml).not.toMatch(/temp password/i);
      expect(sentHtml).not.toMatch(/D1-[A-Za-z0-9]{8}/);
    });

    it('repeated invitations to the same address are safely idempotent (still just an upsert, no duplicate account or error)', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      const res1 = await POST(makeReq('POST', { email: 'existing@b.com', role: 'manager', shopId: SHOP_A }));
      const res2 = await POST(makeReq('POST', { email: 'existing@b.com', role: 'manager', shopId: SHOP_A }));
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });

    it('returns the login URL as a fallback action link when the notification email fails for an already-existing account', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      mockResendSend.mockRejectedValueOnce(new Error('resend outage'));
      const res = await POST(makeReq('POST', { email: 'existing@b.com', role: 'manager', shopId: SHOP_A }));
      const body = await res.json();
      expect(body.actionLink).toBe('https://redlined1.test/login');
    });
  });

  describe('site URL validation', () => {
    it('returns 500 without proceeding when NEXT_PUBLIC_SITE_URL is missing/malformed', async () => {
      mockRequireShopRole.mockResolvedValue(ownerOk());
      process.env.NEXT_PUBLIC_SITE_URL = 'not-a-valid-url';
      const res = await POST(makeReq('POST', { email: 'new@b.com', role: 'technician', shopId: SHOP_A }));
      expect(res.status).toBe(500);
      expect(mockGenerateLink).not.toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalledWith('shop_users');
    });
  });
});

describe('PATCH /api/invite', () => {
  it('returns 400 for an invalid role', async () => {
    const res = await PATCH(makeReq('PATCH', { userId: EXISTING_USER, shopId: SHOP_A, role: 'superadmin' }));
    expect(res.status).toBe(400);
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });

  it('rejects a non-owner with 403', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    const res = await PATCH(makeReq('PATCH', { userId: EXISTING_USER, shopId: SHOP_A, role: 'manager' }));
    expect(res.status).toBe(403);
  });

  it('authorizes against only the explicit shopId in the body', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    await PATCH(makeReq('PATCH', { userId: EXISTING_USER, shopId: SHOP_B, role: 'manager' }));
    expect(mockRequireShopRole).toHaveBeenCalledWith(expect.anything(), SHOP_B, ['owner']);
  });

  it('returns 404 when the target user is not a member of this shop', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    tableResults.shop_users = { data: null, error: null };
    const res = await PATCH(makeReq('PATCH', { userId: EXISTING_USER, shopId: SHOP_A, role: 'manager' }));
    expect(res.status).toBe(404);
  });

  it('blocks demoting the last owner of a shop with 409', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    tableResults.shop_users = { data: { role: 'owner' }, error: null };
    mockIsLastOwner.mockResolvedValue(true);
    const res = await PATCH(makeReq('PATCH', { userId: OWNER_USER, shopId: SHOP_A, role: 'manager' }));
    expect(res.status).toBe(409);
  });

  it('allows demoting an owner when another owner remains', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    tableResults.shop_users = { data: { role: 'owner' }, error: null };
    mockIsLastOwner.mockResolvedValue(false);
    const res = await PATCH(makeReq('PATCH', { userId: OWNER_USER, shopId: SHOP_A, role: 'manager' }));
    expect(res.status).toBe(200);
  });

  it('allows a normal role change for a non-owner target without consulting isLastOwner at all', async () => {
    mockRequireShopRole.mockResolvedValue(ownerOk());
    tableResults.shop_users = { data: { role: 'technician' }, error: null };
    const res = await PATCH(makeReq('PATCH', { userId: EXISTING_USER, shopId: SHOP_A, role: 'manager' }));
    expect(res.status).toBe(200);
    expect(mockIsLastOwner).not.toHaveBeenCalled();
  });
});
