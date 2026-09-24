import { NextRequest } from 'next/server';

/**
 * The new-trial owner alert, through the real handler with Supabase admin and
 * Resend mocked.
 *
 * What these pin: exactly one alert per new account to admin@redlined1.com
 * from the verified domain; a refusal Resend RETURNS (rather than throws) is
 * a failure, not a send; and repeated calls cannot produce a second email.
 */

const USER_ID = '6f1c2b3a-4d5e-4f60-8a9b-0c1d2e3f4a5b';
const mockUser = {
  id: USER_ID,
  email: 'new.owner@example.com',
  created_at: new Date().toISOString(),
  user_metadata: { full_name: 'Pat <b>Owner</b>', shop_name: 'Example Auto' },
};
const mockGetUser = jest.fn();
jest.mock('@/lib/supabaseServer', () => ({
  getAdminDb: () => ({ auth: { admin: { getUserById: (id: string) => mockGetUser(id) } } }),
}));

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => mockSend(...a) };
  },
}));

import { POST } from '../route';

let ipCounter = 0;
function request(body: Record<string, unknown>) {
  ipCounter++;
  return new NextRequest('https://example.com/api/signup-notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${ipCounter}` },
    body: JSON.stringify(body),
  });
}
const VALID = { userId: USER_ID, email: 'New.Owner@example.com' };

const ENV = { ...process.env };
let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockUser.created_at = new Date().toISOString();
  mockGetUser.mockReset().mockImplementation(async (id: string) =>
    id === USER_ID ? { data: { user: mockUser }, error: null } : { data: { user: null }, error: { message: 'not found' } });
  mockSend.mockReset().mockResolvedValue({ data: { id: 'msg-1' }, error: null, headers: null });
  process.env = { ...ENV, RESEND_API_KEY: 'test-key' };
  delete process.env.MAIL_FROM_ADDRESS;
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

describe('a new trial signup', () => {
  it('sends one alert to admin@redlined1.com from the verified domain', async () => {
    const res = await POST(request(VALID));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, notified: 'sent', messageId: 'msg-1' });
    expect(mockSend).toHaveBeenCalledTimes(1);

    const [payload, options] = mockSend.mock.calls[0];
    expect(payload.to).toBe('admin@redlined1.com');
    expect(payload.from).toBe('Redlined1 <noreply@redlined1.com>');
    expect(payload.from).not.toMatch(/resend\.dev/);
    expect(payload.replyTo).toBe('new.owner@example.com');
    expect(options).toEqual({ idempotencyKey: `signup-alert/${USER_ID}` });
  });

  it('builds the email from the account, escaped — not from the request', async () => {
    await POST(request({ ...VALID, name: '<script>x</script>', shopName: 'Injected' }));
    const [payload] = mockSend.mock.calls[0];

    expect(payload.html).toContain('Pat &lt;b&gt;Owner&lt;/b&gt;');
    expect(payload.html).toContain('Example Auto');
    expect(payload.html).not.toContain('<script>');
    expect(payload.html).not.toContain('Injected');
  });

  it('uses MAIL_FROM_ADDRESS when production sets one', async () => {
    process.env.MAIL_FROM_ADDRESS = 'alerts@redlined1.com';
    await POST(request(VALID));
    expect(mockSend.mock.calls[0][0].from).toBe('Redlined1 <alerts@redlined1.com>');
  });
});

describe('when Resend does not send', () => {
  it("reports 'failed' for an error Resend RETURNS, and logs it", async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', statusCode: 403, message: 'The redlined1.com domain is not verified.' },
      headers: null,
    });

    const res = await POST(request(VALID));
    const json = await res.json();

    // Signup is unaffected: still 200, and the failure is explicit.
    expect(res.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      notified: 'failed',
      reason: 'validation_error (403): The redlined1.com domain is not verified.',
    });
    const logged = errorSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(logged).toContain('signupAlert.failed');
    expect(logged).toContain(USER_ID);
    // The customer's email is not written to the logs.
    expect(logged).not.toContain('new.owner@example.com');
  });

  it("reports 'failed' when the send throws", async () => {
    mockSend.mockRejectedValue(new Error('network down'));
    const json = await (await POST(request(VALID))).json();
    expect(json).toMatchObject({ notified: 'failed', reason: 'network down' });
  });

  it("reports 'failed' when Resend returns no message id", async () => {
    mockSend.mockResolvedValue({ data: null, error: null, headers: null });
    const json = await (await POST(request(VALID))).json();
    expect(json).toMatchObject({ notified: 'failed', reason: 'Resend returned no message id' });
  });
});

describe('duplicate processing', () => {
  it('a repeated call replays the same idempotent send, so only one email exists', async () => {
    // Resend's contract: the same idempotency key with the same payload
    // returns the ORIGINAL email instead of sending another.
    const sent = new Map<string, { id: string; payload: string }>();
    let next = 0;
    mockSend.mockImplementation(async (payload: unknown, opts: { idempotencyKey: string }) => {
      const body = JSON.stringify(payload);
      const prior = sent.get(opts.idempotencyKey);
      if (prior) {
        return prior.payload === body
          ? { data: { id: prior.id }, error: null, headers: null }
          : { data: null, error: { name: 'invalid_idempotent_request', statusCode: 409, message: 'payload differs' }, headers: null };
      }
      const id = `msg-${++next}`;
      sent.set(opts.idempotencyKey, { id, payload: body });
      return { data: { id }, error: null, headers: null };
    });

    const first = await (await POST(request(VALID))).json();
    const second = await (await POST(request(VALID))).json();

    expect(first).toMatchObject({ notified: 'sent', messageId: 'msg-1' });
    // Same message id: the retry resolved to the original email.
    expect(second).toMatchObject({ notified: 'sent', messageId: 'msg-1' });
    expect(sent.size).toBe(1);
    // Deterministic payload — nothing time-of-call in it — which is what
    // makes the replay match.
    expect(mockSend.mock.calls[0][0]).toEqual(mockSend.mock.calls[1][0]);
  });

  it("treats Resend's in-flight replay error as a duplicate, not a failure", async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'concurrent_idempotent_requests', statusCode: 409, message: 'in progress' },
      headers: null,
    });
    const json = await (await POST(request(VALID))).json();
    expect(json).toEqual({ ok: true, notified: 'duplicate' });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('never alerts for an account older than the freshness window', async () => {
    mockUser.created_at = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const json = await (await POST(request(VALID))).json();
    expect(json).toMatchObject({ notified: 'skipped' });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('the request is not trusted', () => {
  it('rejects an unknown account without sending', async () => {
    const res = await POST(request({ userId: '00000000-0000-4000-8000-000000000000', email: 'x@example.com' }));
    expect(res.status).toBe(404);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('rejects an email that does not match the account', async () => {
    const res = await POST(request({ ...VALID, email: 'someone.else@example.com' }));
    expect(res.status).toBe(404);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('rejects a malformed body', async () => {
    const res = await POST(request({ name: 'only a name' }));
    expect(res.status).toBe(400);
  });
});
