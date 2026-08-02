/**
 * Creem's webhook signature contract, pinned against the published spec:
 * header `creem-signature`, HMAC-SHA256 over the raw body, hex encoded.
 * https://docs.creem.io/code/webhooks
 *
 * This exists because the header name was wrong (`x-creem-signature`), which
 * is invisible in every test that signs and verifies using the same constant.
 * The failure mode is silent and expensive: Creem accepts the payment, the
 * webhook is rejected 401, and the customer's plan never activates. Nothing in
 * the app surfaces that — only a Vercel log line.
 *
 * So these tests assert the header name literally rather than via a shared
 * constant. If Creem changes it, this should fail loudly.
 */
import { createHmac } from 'crypto';
import { CreemPaymentProvider } from '../payments/providers/creem-provider';

const SECRET = 'whsec_test_secret_for_unit_test_only';
const BODY = JSON.stringify({ type: 'checkout.completed', id: 'evt_123' });

const sign = (body: string, secret = SECRET) =>
  createHmac('sha256', secret).update(body).digest('hex');

describe('Creem webhook signature verification', () => {
  const provider = new CreemPaymentProvider();
  const originalSecret = process.env.CREEM_WEBHOOK_SECRET;

  beforeAll(() => { process.env.CREEM_WEBHOOK_SECRET = SECRET; });
  afterAll(() => { process.env.CREEM_WEBHOOK_SECRET = originalSecret; });

  it('accepts the header Creem actually sends: creem-signature', async () => {
    const result = await provider.verifyWebhook(BODY, { 'creem-signature': sign(BODY) });
    expect(result.valid).toBe(true);
  });

  it('accepts it whatever case the header arrives in', async () => {
    const result = await provider.verifyWebhook(BODY, { 'Creem-Signature': sign(BODY) });
    expect(result.valid).toBe(true);
  });

  it('rejects a body that was altered after signing', async () => {
    const signature = sign(BODY);
    const tampered = JSON.stringify({ type: 'checkout.completed', id: 'evt_999' });
    const result = await provider.verifyWebhook(tampered, { 'creem-signature': signature });
    expect(result.valid).toBe(false);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const result = await provider.verifyWebhook(BODY, {
      'creem-signature': sign(BODY, 'not-the-real-secret'),
    });
    expect(result.valid).toBe(false);
  });

  it('rejects an unsigned request — this endpoint grants paid plans', async () => {
    const result = await provider.verifyWebhook(BODY, {});
    expect(result.valid).toBe(false);
  });

  it('rejects everything when no secret is configured, rather than trusting the caller', async () => {
    delete process.env.CREEM_WEBHOOK_SECRET;
    const result = await provider.verifyWebhook(BODY, { 'creem-signature': sign(BODY) });
    expect(result.valid).toBe(false);
    process.env.CREEM_WEBHOOK_SECRET = SECRET;
  });
});
