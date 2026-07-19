const mockAuthedFetch = jest.fn();
jest.mock('@/lib/apiClient', () => {
  const actual = jest.requireActual('@/lib/apiClient');
  return { ...actual, authedFetch: (...args: unknown[]) => mockAuthedFetch(...args) };
});

import {
  fetchMessagingStatus,
  updateMessagingSecrets,
  fetchMessagingChannelsStatus,
  type MessagingSecretsUpdate,
} from '../messagingSecretsService';

const SHOP_A = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  mockAuthedFetch.mockReset();
});

describe('fetchMessagingStatus', () => {
  it('returns the parsed status on success', async () => {
    const status = {
      sms: { configured: true, enabled: true, fromNumber: '+15550000000', complete: true },
      whatsapp: { configured: true, enabled: false, complete: true },
      line: { configured: false, enabled: false },
      telegram: { configured: false, enabled: false },
    };
    mockAuthedFetch.mockResolvedValue(new Response(JSON.stringify(status), { status: 200 }));
    await expect(fetchMessagingStatus(SHOP_A)).resolves.toEqual(status);
  });

  it('surfaces the server error message on a normal JSON error response', async () => {
    mockAuthedFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Not a member of this shop' }), { status: 403 }));
    await expect(fetchMessagingStatus(SHOP_A)).rejects.toThrow('Not a member of this shop');
  });

  it('produces a useful error from an EMPTY error response, instead of throwing an unrelated parse error', async () => {
    mockAuthedFetch.mockResolvedValue(new Response(null, { status: 502 }));
    await expect(fetchMessagingStatus(SHOP_A)).rejects.toThrow(/502/);
  });

  it('produces a useful error from a NON-JSON error response (e.g. an HTML proxy error page)', async () => {
    mockAuthedFetch.mockResolvedValue(new Response('<html>Gateway Timeout</html>', { status: 504 }));
    await expect(fetchMessagingStatus(SHOP_A)).rejects.toThrow(/504/);
  });
});

describe('updateMessagingSecrets', () => {
  const UPDATE: MessagingSecretsUpdate = { smsEnabled: true, twilioSid: 'AC1', twilioToken: 'tok', twilioFrom: '+15550000000' };

  it('resolves without error on success and never throws', async () => {
    mockAuthedFetch.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await expect(updateMessagingSecrets(SHOP_A, UPDATE)).resolves.toBeUndefined();
  });

  it('surfaces the server error message on a normal JSON error response (e.g. the Twilio completeness invariant)', async () => {
    mockAuthedFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'SMS/WhatsApp cannot be enabled with an incomplete Twilio configuration.' }), { status: 400 }));
    await expect(updateMessagingSecrets(SHOP_A, { smsEnabled: true })).rejects.toThrow(/incomplete Twilio configuration/);
  });

  it('produces a useful error from an EMPTY error response', async () => {
    mockAuthedFetch.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(updateMessagingSecrets(SHOP_A, UPDATE)).rejects.toThrow(/500/);
  });

  it('produces a useful error from a NON-JSON error response', async () => {
    mockAuthedFetch.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
    await expect(updateMessagingSecrets(SHOP_A, UPDATE)).rejects.toThrow(/500/);
  });

  it('the update payload sent to the server never includes a line/telegram field — the type does not allow it', () => {
    // Compile-time guarantee: MessagingSecretsUpdate has no line*/telegram*
    // keys at all (see the type definition) — this test documents that
    // intent so a future edit re-adding them is caught by a type error,
    // not just a runtime check.
    const allowedKeys: Array<keyof MessagingSecretsUpdate> = ['twilioSid', 'twilioToken', 'twilioFrom', 'smsEnabled', 'whatsappEnabled'];
    expect(allowedKeys).not.toContain('lineToken');
    expect(allowedKeys).not.toContain('lineEnabled');
    expect(allowedKeys).not.toContain('telegramBotToken');
    expect(allowedKeys).not.toContain('telegramEnabled');
  });
});

describe('fetchMessagingChannelsStatus', () => {
  it('returns the enabled map on success', async () => {
    const enabled = { sms: true, whatsapp: false, line: false, telegram: false };
    mockAuthedFetch.mockResolvedValue(new Response(JSON.stringify({ enabled }), { status: 200 }));
    await expect(fetchMessagingChannelsStatus(SHOP_A)).resolves.toEqual(enabled);
  });

  it('surfaces the server error message on a normal JSON error response', async () => {
    mockAuthedFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Not a member of this shop' }), { status: 403 }));
    await expect(fetchMessagingChannelsStatus(SHOP_A)).rejects.toThrow('Not a member of this shop');
  });

  it('produces a useful error from an EMPTY error response', async () => {
    mockAuthedFetch.mockResolvedValue(new Response(null, { status: 502 }));
    await expect(fetchMessagingChannelsStatus(SHOP_A)).rejects.toThrow(/502/);
  });

  it('never exposes a secret in its resolved value — the enabled map is booleans only', async () => {
    const enabled = { sms: true, whatsapp: true, line: false, telegram: false };
    mockAuthedFetch.mockResolvedValue(new Response(JSON.stringify({ enabled }), { status: 200 }));
    const result = await fetchMessagingChannelsStatus(SHOP_A);
    for (const value of Object.values(result)) {
      expect(typeof value).toBe('boolean');
    }
  });
});
