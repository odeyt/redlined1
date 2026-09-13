import { NextRequest } from 'next/server';

/**
 * What the shop-audit endpoint reports about the notification.
 *
 * The lead is stored before any email is attempted, so none of these outcomes
 * may change whether the submission succeeded. What they must do is say which
 * of three different things happened, because each has a different fix:
 * nothing configured, the provider refused, or it went out.
 *
 * Exercised through the real handler with the database and Resend mocked —
 * the previous version of this could only be checked by submitting a live
 * lead into production and reading the response, which is how a
 * build-timing race got mistaken for a code defect.
 */

const mockInsertResult: { data: unknown; error: unknown } = { data: { id: 'lead-1' }, error: null };
const mockFrom = jest.fn(() => ({
  insert: () => ({
    select: () => ({
      single: () => Promise.resolve(mockInsertResult),
    }),
  }),
}));
jest.mock('@/lib/supabaseServer', () => ({
  getAdminDb: () => ({ from: (...a: unknown[]) => mockFrom(...(a as [])) }),
}));

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => mockSend(...a) };
  },
}));

import { POST } from '../route';

/** Each call needs a fresh IP: the handler rate-limits five per minute per
 *  IP, and the limiter is module state that outlives a single test. */
let ipCounter = 0;
function request(body: Record<string, unknown>) {
  ipCounter++;
  return new NextRequest('https://example.com/api/shop-audit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${ipCounter}` },
    body: JSON.stringify(body),
  });
}

const VALID = { fullName: 'Jane Smith', email: 'jane@example.com' };

const ENV = { ...process.env };
beforeEach(() => {
  mockSend.mockReset().mockResolvedValue({ id: 'email-1' });
  mockFrom.mockClear();
  mockInsertResult.data = { id: 'lead-1' };
  mockInsertResult.error = null;
  process.env = { ...ENV, RESEND_API_KEY: 'test-key', SALES_NOTIFY_EMAIL: 'sales@example.com' };
});
afterEach(() => { process.env = { ...ENV }; });

describe('notification outcome', () => {
  it("reports 'sent' when the provider accepts it", async () => {
    const res = await POST(request(VALID));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toMatchObject({ ok: true, id: 'lead-1', notified: 'sent' });
    expect(json.notifyError).toBeUndefined();
  });

  it("reports 'skipped' when no recipient is configured — not a failure", async () => {
    delete process.env.SALES_NOTIFY_EMAIL;
    delete process.env.CONTACT_SALES_EMAIL;

    const res = await POST(request(VALID));
    const json = await res.json();

    expect(json).toMatchObject({ ok: true, notified: 'skipped' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("reports 'skipped' when there is no provider key", async () => {
    delete process.env.RESEND_API_KEY;

    const json = await (await POST(request(VALID))).json();

    expect(json.notified).toBe('skipped');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("reports 'failed' with the provider's reason when the send is refused", async () => {
    // The message names configuration — an unverified domain, a rejected
    // recipient — never anything the visitor typed.
    mockSend.mockRejectedValue(new Error('The redlined1.com domain is not verified'));

    const json = await (await POST(request(VALID))).json();

    expect(json).toMatchObject({
      ok: true,
      notified: 'failed',
      notifyError: 'The redlined1.com domain is not verified',
    });
  });

  it('stores the lead regardless of what the notification did', async () => {
    mockSend.mockRejectedValue(new Error('provider down'));

    const res = await POST(request(VALID));
    const json = await res.json();

    // The row is the deliverable; the email is the convenience.
    expect(res.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.id).toBe('lead-1');
    expect(mockFrom).toHaveBeenCalledWith('shop_audit_leads');
  });

  it('fails the submission when the lead itself cannot be stored', async () => {
    mockInsertResult.data = null;
    mockInsertResult.error = { message: 'permission denied' };

    const res = await POST(request(VALID));

    expect(res.status).toBe(500);
    // The caller must be told, because nothing else is holding the lead.
    expect((await res.json()).ok).toBeUndefined();
  });
});

describe('the sender address', () => {
  it('uses the configured sending domain when one is set', async () => {
    process.env.MAIL_FROM_ADDRESS = 'sales@redlined1.com';

    await POST(request(VALID));

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'RedlineD1 <sales@redlined1.com>' }),
    );
  });

  it('falls back to the sandbox sender rather than failing to send at all', async () => {
    delete process.env.MAIL_FROM_ADDRESS;

    await POST(request(VALID));

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'RedlineD1 <onboarding@resend.dev>' }),
    );
  });

  it('replies to the lead, so answering the notification reaches the shop owner', async () => {
    await POST(request(VALID));
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: 'jane@example.com' }),
    );
  });
});
