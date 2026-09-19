import { PLAN_ANNUAL_MONTHLY, PLAN_MONTHLY_PRICE, classifyInterval, normalizedMonthlyRevenue } from '@/commercial/analytics/pricing';

describe('classifyInterval', () => {
  it.each([
    [null, 'missing'], [undefined, 'missing'], ['', 'missing'], ['   ', 'missing'],
    ['monthly', 'monthly'], ['Monthly', 'monthly'], [' MONTHLY ', 'monthly'],
    ['annual', 'annual'], ['Annual', 'annual'], [' annual\n', 'annual'],
    ['yearly', 'unrecognised'], ['quarterly', 'unrecognised'], ['weekly', 'unrecognised'], ['12', 'unrecognised'], ['annually', 'unrecognised'],
  ] as const)('%j → %s', (raw, kind) => {
    expect(classifyInterval(raw as string | null | undefined)).toBe(kind);
  });
});

describe('normalizedMonthlyRevenue', () => {
  it('prices monthly at the monthly price and annual at annual ÷ 12', () => {
    expect(normalizedMonthlyRevenue('solo', 'monthly')).toBe(PLAN_MONTHLY_PRICE.solo);
    expect(normalizedMonthlyRevenue('solo', 'annual')).toBe(PLAN_ANNUAL_MONTHLY.solo);
    expect(PLAN_ANNUAL_MONTHLY.solo).toBeLessThan(PLAN_MONTHLY_PRICE.solo);
  });

  it('assumes monthly when nothing is recorded (the caller reports that assumption)', () => {
    expect(normalizedMonthlyRevenue('solo', null)).toBe(PLAN_MONTHLY_PRICE.solo);
    expect(normalizedMonthlyRevenue('solo', '')).toBe(PLAN_MONTHLY_PRICE.solo);
  });

  it.each(['quarterly', 'weekly', 'yearly', '12', 'monthly-ish'])(
    'never prices an unrecognised interval (%s) — in particular never as annual',
    interval => {
      expect(normalizedMonthlyRevenue('solo', interval)).toBe(0);
      expect(normalizedMonthlyRevenue('solo', interval)).not.toBe(PLAN_ANNUAL_MONTHLY.solo);
      expect(normalizedMonthlyRevenue('professional', interval)).toBe(0);
    },
  );

  it('still returns 0 for a plan with no known recurring price, whatever the interval', () => {
    for (const interval of [null, 'monthly', 'annual']) expect(normalizedMonthlyRevenue('enterprise', interval)).toBe(0);
    expect(normalizedMonthlyRevenue('no-such-plan', 'monthly')).toBe(0);
  });
});
