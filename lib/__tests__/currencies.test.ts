import {
  formatMoney,
  currencySymbol,
  currencyName,
  isSupportedCurrency,
  ALL_CURRENCIES,
  PRIORITY_CURRENCIES,
  DEFAULT_CURRENCY,
} from '../currencies';

// Strips non-breaking / narrow-no-break spaces that Intl inserts between the
// symbol and the digits, so assertions do not depend on invisible characters.
const norm = (s: string) => s.replace(/[  \s]/g, '');

describe('formatMoney', () => {
  it('does not render a LAK amount as US dollars', () => {
    // The bug: every parts figure was hardcoded to USD, so a LAK price showed
    // as "$89,470,168.00".
    const out = formatMoney(89_470_168, 'LAK');
    expect(out).not.toContain('$');
    expect(norm(out)).toContain('89,470,168');
  });

  it('renders LAK with no decimal places', () => {
    expect(formatMoney(1500, 'LAK')).not.toMatch(/[.,]00$/);
  });

  it('renders THB distinctly from USD', () => {
    const thb = formatMoney(1234.5, 'THB');
    const usd = formatMoney(1234.5, 'USD');
    expect(thb).not.toEqual(usd);
    expect(usd).toContain('$');
  });

  it('keeps two decimals for USD', () => {
    expect(norm(formatMoney(1234.5, 'USD'))).toContain('1,234.50');
  });

  it('uses three decimals for KWD', () => {
    expect(norm(formatMoney(2, 'KWD'))).toMatch(/2\.000/);
  });

  it('defaults to USD when no code is given', () => {
    expect(formatMoney(5)).toEqual(formatMoney(5, DEFAULT_CURRENCY));
  });

  it('falls back instead of throwing on an unknown code', () => {
    // An invalid code reaching Intl.NumberFormat would throw mid-render and
    // blank the parts table.
    expect(() => formatMoney(10, 'ZZZ')).not.toThrow();
    expect(formatMoney(10, 'ZZZ')).toContain('ZZZ');
  });

  it('treats non-finite input as zero rather than printing NaN', () => {
    expect(formatMoney(NaN, 'USD')).not.toMatch(/NaN/);
  });
});

describe('currency catalogue', () => {
  it('includes the currencies this business trades in', () => {
    for (const code of ['LAK', 'THB', 'USD']) {
      expect(isSupportedCurrency(code)).toBe(true);
    }
  });

  it('lists LAK and THB ahead of the full list', () => {
    expect(PRIORITY_CURRENCIES.map(c => c.code)).toEqual(['LAK', 'THB', 'USD']);
  });

  it('has no duplicate codes', () => {
    const codes = ALL_CURRENCIES.map(c => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('uses well-formed ISO 4217 codes, matching the DB CHECK constraint', () => {
    for (const c of ALL_CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('rejects unsupported and malformed codes', () => {
    expect(isSupportedCurrency('ZZZ')).toBe(false);
    expect(isSupportedCurrency('lak')).toBe(false);
    expect(isSupportedCurrency('')).toBe(false);
    expect(isSupportedCurrency(null)).toBe(false);
  });

  it('resolves display names, falling back to the code', () => {
    expect(currencyName('LAK')).toBe('Lao Kip');
    expect(currencyName('ZZZ')).toBe('ZZZ');
  });

  it('returns a symbol for priority currencies', () => {
    for (const c of PRIORITY_CURRENCIES) {
      expect(currencySymbol(c.code).length).toBeGreaterThan(0);
    }
  });
});
