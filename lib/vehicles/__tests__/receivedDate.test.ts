import { todayIsoDate, receivedDateOrToday } from '../receivedDate';

describe('todayIsoDate', () => {
  it('formats the local calendar date with zero padding', () => {
    expect(todayIsoDate(new Date(2026, 9, 5))).toBe('2026-10-05');
    expect(todayIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('uses the local date, not the UTC date, just after local midnight', () => {
    // 00:30 on the 1st local time. toISOString() would give the previous day
    // anywhere east of UTC; this must not.
    expect(todayIsoDate(new Date(2026, 9, 1, 0, 30))).toBe('2026-10-01');
  });

  it('handles the last day of the year', () => {
    expect(todayIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});

describe('receivedDateOrToday', () => {
  const now = new Date(2026, 9, 5);

  it('keeps a date that was given', () => {
    expect(receivedDateOrToday('2026-09-18', now)).toBe('2026-09-18');
  });

  it('trims a full timestamp down to the date', () => {
    expect(receivedDateOrToday('2026-09-18T08:30:00Z', now)).toBe('2026-09-18');
  });

  it.each([undefined, null, '', '   '])('falls back to today for %p', value => {
    expect(receivedDateOrToday(value as string | null | undefined, now)).toBe('2026-10-05');
  });
});

import { receivedInMonth } from '../receivedDate';

describe('receivedInMonth', () => {
  it('matches the month and year of a plain date', () => {
    expect(receivedInMonth('2026-09-18', 9, 2026)).toBe(true);
    expect(receivedInMonth('2026-09-01', 9, 2026)).toBe(true);
    expect(receivedInMonth('2026-09-30', 9, 2026)).toBe(true);
  });

  it('does not match the neighbouring months or another year', () => {
    expect(receivedInMonth('2026-08-31', 9, 2026)).toBe(false);
    expect(receivedInMonth('2026-10-01', 9, 2026)).toBe(false);
    expect(receivedInMonth('2025-09-18', 9, 2026)).toBe(false);
  });

  it('reads a full timestamp by its date part', () => {
    expect(receivedInMonth('2026-09-18T08:30:00Z', 9, 2026)).toBe(true);
  });

  it('matches everything when no month is chosen', () => {
    expect(receivedInMonth('2026-09-18', 0, 2026)).toBe(true);
    expect(receivedInMonth(null, 0, 2026)).toBe(true);
  });

  it('matches no month for a missing or malformed date', () => {
    expect(receivedInMonth(null, 9, 2026)).toBe(false);
    expect(receivedInMonth('', 9, 2026)).toBe(false);
    expect(receivedInMonth('garbage', 9, 2026)).toBe(false);
  });
});
