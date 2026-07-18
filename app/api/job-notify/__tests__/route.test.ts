import { NextRequest, NextResponse } from 'next/server';

const SHOP_A = '11111111-1111-4111-8111-111111111111';
const SHOP_B = '22222222-2222-4222-8222-222222222222';
const JOB_1 = '33333333-3333-4333-8333-333333333333';

const mockRequireShopRole = jest.fn();
jest.mock('@/lib/serverAuth', () => ({
  requireShopRole: (...args: unknown[]) => mockRequireShopRole(...args),
}));

const mockIsRateLimited = jest.fn((..._args: unknown[]) => false);
const mockWasRecentlyPerformed = jest.fn((..._args: unknown[]) => false);
jest.mock('@/lib/apiHelpers', () => {
  const actual = jest.requireActual('@/lib/apiHelpers');
  return {
    ...actual,
    isRateLimited: (...args: unknown[]) => mockIsRateLimited(...args),
    wasRecentlyPerformed: (...args: unknown[]) => mockWasRecentlyPerformed(...args),
  };
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

let jobResult: ChainResult;
let shopResult: ChainResult;
let settingsResult: ChainResult;

const mockFrom = jest.fn((table: string) => {
  if (table === 'job_cards') return makeChain(jobResult);
  if (table === 'shops') return makeChain(shopResult);
  if (table === 'shop_settings') return makeChain(settingsResult);
  return makeChain({ data: null, error: null });
});

jest.mock('@/lib/supabase-server', () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { POST } from '../route';

function makeReq(body: unknown, token = 'tok'): NextRequest {
  return new NextRequest('http://localhost/api/job-notify', {
    method: 'POST',
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
function advisorOk() {
  return { ok: true as const, context: { userId: 'u1', role: 'advisor' as const } };
}

beforeEach(() => {
  mockRequireShopRole.mockReset();
  mockIsRateLimited.mockReset();
  mockIsRateLimited.mockReturnValue(false);
  mockWasRecentlyPerformed.mockReset();
  mockWasRecentlyPerformed.mockReturnValue(false);
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'sent-1', sid: 'sent-1' }) });
  mockFrom.mockClear();

  jobResult = {
    data: {
      id: JOB_1,
      repair_stage: 'ready',
      status_token: 'REALTOKEN123',
      customer_phone: '+15551230000',
      customer_email: 'realcustomer@example.com',
    },
    error: null,
  };
  shopResult = { data: { name: 'Test Shop' }, error: null };
  settingsResult = { data: { phone: '555-9999', email: 'shop@test.com' }, error: null };
  process.env.NEXT_PUBLIC_SITE_URL = 'https://redlined1.test';
  process.env.TWILIO_ACCOUNT_SID = 'AC_test';
  process.env.TWILIO_AUTH_TOKEN = 'test_token';
  process.env.TWILIO_PHONE_NUMBER = '+15550000000';
  process.env.RESEND_API_KEY = 'test_resend_key';
});

describe('POST /api/job-notify', () => {
  it('returns 400 for an empty jobId, without checking authorization', async () => {
    const res = await POST(makeReq({ jobId: '', shopId: SHOP_A }));
    expect(res.status).toBe(400);
    expect(mockRequireShopRole).not.toHaveBeenCalled();
  });

  it('accepts a real job_cards.id shape (job_cards.id is text, not a UUID — e.g. "JC-<timestamp>")', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    jobResult = { ...jobResult, data: { ...(jobResult.data as Record<string, unknown>), id: 'JC-1737158234567' } };
    const res = await POST(makeReq({ jobId: 'JC-1737158234567', shopId: SHOP_A }));
    expect(res.status).toBe(200);
  });

  it('rejects an unauthenticated caller with 401 and sends no notification', async () => {
    mockRequireShopRole.mockResolvedValue(unauthorized());
    const res = await POST(makeReq({ jobId: JOB_1, shopId: SHOP_A }));
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a caller from a different shop with 403, preventing use of shop B\'s SMS/email credentials', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    const res = await POST(makeReq({ jobId: JOB_1, shopId: SHOP_B }));
    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('requires shop membership scoped to the explicit body shopId, restricted to owner/manager/advisor', async () => {
    mockRequireShopRole.mockResolvedValue(forbidden());
    await POST(makeReq({ jobId: JOB_1, shopId: SHOP_B }));
    expect(mockRequireShopRole).toHaveBeenCalledWith(expect.anything(), SHOP_B, ['owner', 'manager', 'advisor']);
  });

  it('shop A cannot notify about a job belonging to shop B — same 404 as a nonexistent job', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    jobResult = { data: null, error: null }; // job_cards lookup scoped to (jobId, shopId) found nothing
    const res = await POST(makeReq({ jobId: JOB_1, shopId: SHOP_A }));
    expect(res.status).toBe(404);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('ignores an injected customerPhone/customerEmail in the body — sends to the DB-derived recipient instead', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    await POST(makeReq({
      jobId: JOB_1, shopId: SHOP_A,
      customerPhone: '+19995551234', customerEmail: 'attacker@evil.com',
    }));
    const smsCall = mockFetch.mock.calls.find((c) => String(c[0]).includes('twilio'));
    const smsBodyParams = new URLSearchParams((smsCall![1] as { body: string }).body);
    expect(smsBodyParams.get('To')).toBe('+15551230000');
    expect(smsBodyParams.get('To')).not.toBe('+19995551234');

    const emailCall = mockFetch.mock.calls.find((c) => String(c[0]).includes('resend'));
    const emailPayload = JSON.parse((emailCall![1] as { body: string }).body);
    expect(emailPayload.to).toEqual(['realcustomer@example.com']);
    expect(emailPayload.to).not.toContain('attacker@evil.com');
  });

  it('ignores a forged statusUrl in the body — the tracking link is derived server-side from the stored token', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    await POST(makeReq({ jobId: JOB_1, shopId: SHOP_A, statusUrl: 'https://phishing.example.com/steal' }));
    const emailCall = mockFetch.mock.calls.find((c) => String(c[0]).includes('resend'));
    const emailPayload = JSON.parse((emailCall![1] as { body: string }).body);
    expect(emailPayload.html).toContain('https://redlined1.test/status/REALTOKEN123');
    expect(emailPayload.html).not.toContain('phishing.example.com');
  });

  it('rejects a job whose stored repair_stage is not a valid stage', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    jobResult = { data: { ...((jobResult as { data: Record<string, unknown> }).data), repair_stage: 'not_a_real_stage' }, error: null };
    const res = await POST(makeReq({ jobId: JOB_1, shopId: SHOP_A }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 429 when the shop-level notification rate limit is exceeded', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    mockIsRateLimited.mockReturnValueOnce(true);
    const res = await POST(makeReq({ jobId: JOB_1, shopId: SHOP_A }));
    expect(res.status).toBe(429);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('deduplicates a repeated identical request instead of re-sending', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    mockWasRecentlyPerformed.mockReturnValueOnce(true);
    const res = await POST(makeReq({ jobId: JOB_1, shopId: SHOP_A }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduped).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('escapes a malicious shop name before interpolating it into the HTML email', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    shopResult = { data: { name: '<script>alert(1)</script>' }, error: null };
    await POST(makeReq({ jobId: JOB_1, shopId: SHOP_A }));
    const emailCall = mockFetch.mock.calls.find((c) => String(c[0]).includes('resend'));
    const emailPayload = JSON.parse((emailCall![1] as { body: string }).body);
    expect(emailPayload.html).not.toContain('<script>alert(1)</script>');
    expect(emailPayload.html).toContain('&lt;script&gt;');
  });

  it('succeeds for an authorized shop member and sends both SMS and email', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    const res = await POST(makeReq({ jobId: JOB_1, shopId: SHOP_A }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sms).toBeTruthy();
    expect(body.email).toBeTruthy();
  });

  it('sanitizes a Twilio provider error instead of returning its raw message', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    mockFetch.mockImplementation((url: unknown) => {
      if (String(url).includes('twilio')) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ message: 'internal twilio account xyz misconfigured' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'sent-1' }) });
    });
    const res = await POST(makeReq({ jobId: JOB_1, shopId: SHOP_A }));
    const body = await res.json();
    expect(body.smsError).toBeDefined();
    expect(body.smsError).not.toMatch(/internal twilio account xyz/);
  });

  it('does not attempt SMS/email when the job has no phone/email on file', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    jobResult = { data: { id: JOB_1, repair_stage: 'ready', status_token: null, customer_phone: null, customer_email: null }, error: null };
    const res = await POST(makeReq({ jobId: JOB_1, shopId: SHOP_A }));
    expect(res.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('honors notifySms:false to suppress SMS even though a phone is on file', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    await POST(makeReq({ jobId: JOB_1, shopId: SHOP_A, notifySms: false }));
    const smsCall = mockFetch.mock.calls.find((c) => String(c[0]).includes('twilio'));
    const emailCall = mockFetch.mock.calls.find((c) => String(c[0]).includes('resend'));
    expect(smsCall).toBeUndefined();
    expect(emailCall).toBeDefined();
  });

  it('honors notifyEmail:false to suppress email even though an address is on file', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    await POST(makeReq({ jobId: JOB_1, shopId: SHOP_A, notifyEmail: false }));
    const smsCall = mockFetch.mock.calls.find((c) => String(c[0]).includes('twilio'));
    const emailCall = mockFetch.mock.calls.find((c) => String(c[0]).includes('resend'));
    expect(smsCall).toBeDefined();
    expect(emailCall).toBeUndefined();
  });

  it('defaults both channels to on when notifySms/notifyEmail are omitted', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    await POST(makeReq({ jobId: JOB_1, shopId: SHOP_A }));
    expect(mockFetch.mock.calls.some((c) => String(c[0]).includes('twilio'))).toBe(true);
    expect(mockFetch.mock.calls.some((c) => String(c[0]).includes('resend'))).toBe(true);
  });

  it('returns 500 without sending when NEXT_PUBLIC_SITE_URL is missing/malformed', async () => {
    mockRequireShopRole.mockResolvedValue(advisorOk());
    process.env.NEXT_PUBLIC_SITE_URL = 'not-a-valid-url';
    const res = await POST(makeReq({ jobId: JOB_1, shopId: SHOP_A }));
    expect(res.status).toBe(500);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
