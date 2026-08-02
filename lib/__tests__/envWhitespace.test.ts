/**
 * Configuration reads must tolerate surrounding whitespace.
 *
 * A value written by piping through a shell picks up a trailing newline, and a
 * value pasted from a dashboard can pick up a space. Neither is visible: the
 * Vercel UI renders the value without its whitespace, and an error message
 * built with string interpolation prints `"creem"` whether or not a newline
 * follows the token.
 *
 * That produced a checkout failure reading `Unsupported payment provider:
 * "creem". Set PAYMENT_PROVIDER=creem` — an error instructing the operator to
 * do exactly what they had already done.
 *
 * The same class of failure is worse elsewhere and silent: CREEM_TEST_MODE
 * failing its === 'true' compare sends sandbox traffic to the LIVE host, and a
 * newline on the webhook secret changes the HMAC key so every event is
 * rejected as a forgery.
 */
import { getPaymentProvider } from '../payments/payment-service';

const ORIGINAL = process.env.PAYMENT_PROVIDER;

describe('PAYMENT_PROVIDER whitespace tolerance', () => {
  afterEach(() => {
    process.env.PAYMENT_PROVIDER = ORIGINAL;
    jest.resetModules();
  });

  // The factory memoises, so each case needs a fresh module instance.
  async function resolve(raw: string) {
    jest.resetModules();
    process.env.PAYMENT_PROVIDER = raw;
    const mod = await import('../payments/payment-service');
    return mod.getPaymentProvider();
  }

  it('accepts a value with a trailing newline, as written by a piped shell command', async () => {
    await expect(resolve('creem\n')).resolves.toBeDefined();
  });

  it('accepts a value with surrounding spaces, as pasted into a dashboard', async () => {
    await expect(resolve('  creem  ')).resolves.toBeDefined();
  });

  it('accepts a trailing carriage return, as written on Windows', async () => {
    await expect(resolve('creem\r\n')).resolves.toBeDefined();
  });

  it('still rejects a genuinely unknown provider', async () => {
    await expect(resolve('paypal')).rejects.toThrow(/Unsupported payment provider/);
  });

  it('is exported and callable', () => {
    expect(typeof getPaymentProvider).toBe('function');
  });
});

describe('CREEM_TEST_MODE whitespace tolerance', () => {
  const ORIGINAL_MODE = process.env.CREEM_TEST_MODE;
  afterEach(() => {
    process.env.CREEM_TEST_MODE = ORIGINAL_MODE;
    jest.resetModules();
  });

  async function isTestMode(raw: string) {
    jest.resetModules();
    process.env.CREEM_TEST_MODE = raw;
    const mod = await import('../payments/providers/creem-provider');
    return mod.isCreemTestMode();
  }

  it('treats "true\\n" as test mode — otherwise a sandbox run hits the live host', async () => {
    await expect(isTestMode('true\n')).resolves.toBe(true);
  });

  it('still treats "false" as live', async () => {
    await expect(isTestMode('false')).resolves.toBe(false);
  });

  it('does not treat an empty value as test mode', async () => {
    await expect(isTestMode('  ')).resolves.toBe(false);
  });
});
