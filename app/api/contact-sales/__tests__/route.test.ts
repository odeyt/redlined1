import { NextRequest } from 'next/server';

/**
 * Contact-sales stores nothing — the email is the inquiry — so it may only
 * answer 2xx when Resend has accepted the message. The page shows "Message
 * sent" on 2xx and "Failed to send" otherwise.
 */

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => mockSend(...a) };
  },
}));

import { POST } from '../route';

function request(body: unknown) {
  return new NextRequest('https://example.com/api/contact-sales', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const VALID = { name: 'Jane Smith', email: 'jane@example.com', shopName: 'Smith Auto', context: 'enterprise', message: 'Hi' };

const ENV = { ...process.env };
let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockSend.mockReset().mockResolvedValue({ data: { id: 'msg-1' }, error: null, headers: null });
  process.env = { ...ENV, RESEND_API_KEY: 'test-key', MAIL_FROM_ADDRESS: 'notifications@redlined1.com' };
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

describe('an accepted inquiry', () => {
  it('sends from the verified sender to admin@redlined1.com and returns the message id', async () => {
    const res = await POST(request(VALID));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, messageId: 'msg-1' });
    const [payload] = mockSend.mock.calls[0];
    expect(payload.from).toBe('Redlined1 <notifications@redlined1.com>');
    expect(payload.from).not.toMatch(/resend\.dev/);
    expect(payload.to).toBe('admin@redlined1.com');
    expect(payload.replyTo).toBe('jane@example.com');
    expect(payload.subject).toBe('📩 Enterprise Plan inquiry — Smith Auto');
  });

  it('escapes every visitor-supplied value in the email', async () => {
    await POST(request({
      name: '<img src=x onerror=alert(1)>',
      email: 'a"b@example.com',
      shopName: '<b>Shop</b>',
      message: '<script>steal()</script>',
    }));
    const { html } = mockSend.mock.calls[0][0];

    expect(html).not.toMatch(/<img|<script|<b>Shop/);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;steal()&lt;/script&gt;');
    expect(html).toContain('a&quot;b@example.com');
  });

  it('keeps line breaks out of the subject', async () => {
    await POST(request({ ...VALID, shopName: 'Evil\r\nBcc: x@example.com' }));
    expect(mockSend.mock.calls[0][0].subject).not.toMatch(/[\r\n]/);
  });
});

describe('when Resend does not send, the visitor is not told it did', () => {
  it('fails on an error Resend RETURNS (no throw), and logs the reason', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', statusCode: 403, message: 'The redlined1.com domain is not verified.' },
      headers: null,
    });

    const res = await POST(request(VALID));

    expect(res.status).toBe(502);
    expect((await res.json()).ok).toBeUndefined();
    const logged = errorSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(logged).toContain('contactSales.send failed');
    expect(logged).toContain('validation_error (403)');
    // The visitor's details are not written to the logs.
    expect(logged).not.toContain('jane@example.com');
    expect(logged).not.toContain('Jane Smith');
  });

  it('fails when the send throws', async () => {
    mockSend.mockRejectedValue(new Error('network down'));
    const res = await POST(request(VALID));
    expect(res.status).toBe(502);
  });

  it('fails when Resend returns no message id', async () => {
    mockSend.mockResolvedValue({ data: null, error: null, headers: null });
    const res = await POST(request(VALID));
    expect(res.status).toBe(502);
  });
});

describe('input', () => {
  it('rejects a missing name or email without sending', async () => {
    const res = await POST(request({ email: 'jane@example.com' }));
    expect(res.status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const res = await POST(request('not json'));
    expect(res.status).toBe(400);
  });
});
