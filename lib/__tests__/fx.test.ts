/**
 * Exchange rates must fail loudly.
 *
 * InvoicesView and EstimatesView each carried their own copy of this fetch,
 * and both returned 1 when it failed. A rate of 1 between LAK and THB turns a
 * 600,000 LAK deposit into 600,000 THB — about a 25x error, applied silently
 * to a customer's balance. This module returns null instead so the caller has
 * to decide what to show, and every caller currently refuses to compute.
 */
import { getExchangeRate, convertAmount, clearFxCache } from '../fx';

const okResponse = (body: unknown) => Promise.resolve({
  ok: true, json: () => Promise.resolve(body),
} as Response);

beforeEach(() => {
  clearFxCache();
  jest.restoreAllMocks();
});

describe('a rate that cannot be determined is null, never 1', () => {
  it('returns null when the request fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await getExchangeRate('LAK', 'THB')).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);
    expect(await getExchangeRate('LAK', 'THB')).toBeNull();
  });

  it('returns null when the currency is absent from the response', async () => {
    jest.spyOn(global, 'fetch').mockReturnValue(okResponse({ lak: { usd: 0.000046 } }));
    expect(await getExchangeRate('LAK', 'THB')).toBeNull();
  });

  it('returns null for a zero or negative rate', async () => {
    jest.spyOn(global, 'fetch').mockReturnValue(okResponse({ lak: { thb: 0 } }));
    expect(await getExchangeRate('LAK', 'THB')).toBeNull();
  });

  it('convertAmount propagates the null rather than returning the input', async () => {
    // Returning the unconverted amount would be the same 25x bug wearing a
    // different hat.
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await convertAmount(600000, 'LAK', 'THB')).toBeNull();
  });
});

describe('normal conversion', () => {
  it('converts at the fetched rate', async () => {
    jest.spyOn(global, 'fetch').mockReturnValue(okResponse({ lak: { thb: 0.0016 } }));
    expect(await convertAmount(600000, 'LAK', 'THB')).toBeCloseTo(960);
  });

  it('treats the same currency as 1 without a request', async () => {
    const spy = jest.spyOn(global, 'fetch');
    expect(await getExchangeRate('THB', 'THB')).toBe(1);
    expect(await getExchangeRate('thb', 'THB')).toBe(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it('is case-insensitive about currency codes', async () => {
    jest.spyOn(global, 'fetch').mockReturnValue(okResponse({ lak: { thb: 0.0016 } }));
    expect(await getExchangeRate('lak', 'thb')).toBeCloseTo(0.0016);
  });
});

describe('it does not hammer the API', () => {
  it('caches a fetched currency for the session', async () => {
    const spy = jest.spyOn(global, 'fetch').mockReturnValue(okResponse({ lak: { thb: 0.0016, usd: 0.000046 } }));
    await getExchangeRate('LAK', 'THB');
    await getExchangeRate('LAK', 'USD');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent requests for the same currency', async () => {
    // Several fields can ask at once when a quote loads.
    const spy = jest.spyOn(global, 'fetch').mockReturnValue(okResponse({ lak: { thb: 0.0016 } }));
    await Promise.all([
      getExchangeRate('LAK', 'THB'),
      getExchangeRate('LAK', 'THB'),
      getExchangeRate('LAK', 'THB'),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure', async () => {
    const spy = jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('offline'));
    expect(await getExchangeRate('LAK', 'THB')).toBeNull();
    spy.mockReturnValue(okResponse({ lak: { thb: 0.0016 } }));
    expect(await getExchangeRate('LAK', 'THB')).toBeCloseTo(0.0016);
  });
});
