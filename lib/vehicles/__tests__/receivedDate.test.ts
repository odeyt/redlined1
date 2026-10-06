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

import { buildReceivedFilter, matchesReceived, isBackwardsRange, describeReceived, isIsoDay, RECEIVED_CUSTOM_RANGE } from '../receivedDate';

describe('isIsoDay', () => {
  it('accepts real days and rejects impossible ones', () => {
    expect(isIsoDay('2026-09-15')).toBe(true);
    expect(isIsoDay('2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(isIsoDay('2026-02-31')).toBe(false);
    expect(isIsoDay('2026-13-01')).toBe(false);
    expect(isIsoDay('15/09/2026')).toBe(false);
    expect(isIsoDay('')).toBe(false);
    expect(isIsoDay(null)).toBe(false);
  });
});

describe('buildReceivedFilter', () => {
  it('builds a month filter, and any for month 0', () => {
    expect(buildReceivedFilter(9, 2026, '', '')).toEqual({ kind: 'month', month: 9, year: 2026 });
    expect(buildReceivedFilter(0, 2026, '2026-09-01', '2026-09-15')).toEqual({ kind: 'any' });
  });

  it('builds a range filter from the custom option', () => {
    expect(buildReceivedFilter(RECEIVED_CUSTOM_RANGE, 2026, '2026-09-01', '2026-09-15'))
      .toEqual({ kind: 'range', from: '2026-09-01', to: '2026-09-15' });
  });

  it('is no filter when the custom range has no usable date', () => {
    expect(buildReceivedFilter(RECEIVED_CUSTOM_RANGE, 2026, '', '')).toEqual({ kind: 'any' });
    expect(buildReceivedFilter(RECEIVED_CUSTOM_RANGE, 2026, '2026-02-31', 'nonsense')).toEqual({ kind: 'any' });
  });

  it('keeps one bound when the other is not entered', () => {
    expect(buildReceivedFilter(RECEIVED_CUSTOM_RANGE, 2026, '2026-09-10', '')).toEqual({ kind: 'range', from: '2026-09-10', to: '' });
  });
});

describe('matchesReceived', () => {
  const range = { kind: 'range', from: '2026-09-10', to: '2026-09-20' } as const;

  it('includes both end days of a range', () => {
    expect(matchesReceived('2026-09-10', range)).toBe(true);
    expect(matchesReceived('2026-09-20', range)).toBe(true);
    expect(matchesReceived('2026-09-15', range)).toBe(true);
  });

  it('excludes the days either side', () => {
    expect(matchesReceived('2026-09-09', range)).toBe(false);
    expect(matchesReceived('2026-09-21', range)).toBe(false);
  });

  it('reads a timestamp by its date', () => {
    expect(matchesReceived('2026-09-20T23:59:00Z', range)).toBe(true);
  });

  it('treats a missing bound as open-ended', () => {
    expect(matchesReceived('2030-01-01', { kind: 'range', from: '2026-09-10', to: '' })).toBe(true);
    expect(matchesReceived('2020-01-01', { kind: 'range', from: '2026-09-10', to: '' })).toBe(false);
    expect(matchesReceived('2020-01-01', { kind: 'range', from: '', to: '2026-09-10' })).toBe(true);
    expect(matchesReceived('2026-09-11', { kind: 'range', from: '', to: '2026-09-10' })).toBe(false);
  });

  it('never matches a missing or malformed date, but "any" matches everything', () => {
    expect(matchesReceived(null, range)).toBe(false);
    expect(matchesReceived('garbage', range)).toBe(false);
    expect(matchesReceived(null, { kind: 'any' })).toBe(true);
  });

  it('still handles a month filter', () => {
    expect(matchesReceived('2026-09-30', { kind: 'month', month: 9, year: 2026 })).toBe(true);
    expect(matchesReceived('2026-10-01', { kind: 'month', month: 9, year: 2026 })).toBe(false);
  });
});

describe('isBackwardsRange', () => {
  it('flags From after To, and such a range matches nothing', () => {
    const backwards = { kind: 'range', from: '2026-09-20', to: '2026-09-10' } as const;
    expect(isBackwardsRange(backwards)).toBe(true);
    expect(matchesReceived('2026-09-15', backwards)).toBe(false);
  });

  it('does not flag a forwards, single-day or open range', () => {
    expect(isBackwardsRange({ kind: 'range', from: '2026-09-10', to: '2026-09-20' })).toBe(false);
    expect(isBackwardsRange({ kind: 'range', from: '2026-09-10', to: '2026-09-10' })).toBe(false);
    expect(isBackwardsRange({ kind: 'range', from: '2026-09-10', to: '' })).toBe(false);
    expect(isBackwardsRange({ kind: 'any' })).toBe(false);
  });
});

describe('describeReceived', () => {
  it('describes each shape in words', () => {
    expect(describeReceived({ kind: 'month', month: 9, year: 2026 })).toBe('September 2026');
    expect(describeReceived({ kind: 'range', from: '2026-09-01', to: '2026-09-15' })).toBe('1 Sep 2026 to 15 Sep 2026');
    expect(describeReceived({ kind: 'range', from: '2026-09-05', to: '2026-09-05' })).toBe('5 Sep 2026');
    expect(describeReceived({ kind: 'range', from: '2026-09-10', to: '' })).toBe('10 Sep 2026 onwards');
    expect(describeReceived({ kind: 'range', from: '', to: '2026-09-10' })).toBe('up to 10 Sep 2026');
    expect(describeReceived({ kind: 'any' })).toBe('any date');
  });
});
