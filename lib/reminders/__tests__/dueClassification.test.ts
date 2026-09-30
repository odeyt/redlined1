/**
 * "Overdue" and "due today" at the edges: midnight, the due instant itself,
 * other timezones, and the two daylight-saving changes US shops live through.
 *
 * 2026 US transitions: clocks spring forward at 02:00 on Sunday 8 March and
 * fall back at 02:00 on Sunday 1 November. Laos (Asia/Vientiane) has no DST.
 */
import {
  classifyDue, calendarDate, dueCounts, instantToWallClock, wallClockToInstant,
} from '../dueClassification';

const CHI = 'America/Chicago';
const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
const VTE = 'Asia/Vientiane';

const at = (iso: string) => new Date(iso);

describe('classifyDue — exact boundaries', () => {
  const now = at('2026-06-10T15:00:00Z'); // 10:00 in Chicago (CDT, UTC-5)

  it('due exactly now is today, not yet overdue', () => {
    expect(classifyDue(now, now, CHI)).toBe('today');
  });

  it('one millisecond past due is overdue', () => {
    expect(classifyDue(at('2026-06-10T14:59:59.999Z'), now, CHI)).toBe('overdue');
  });

  it('later the same local day is today, up to 23:59:59 local', () => {
    expect(classifyDue(at('2026-06-11T04:59:59Z'), now, CHI)).toBe('today');   // 23:59:59 CDT
  });

  it('local midnight starts tomorrow, which is upcoming', () => {
    expect(classifyDue(at('2026-06-11T05:00:00Z'), now, CHI)).toBe('upcoming'); // 00:00 CDT
  });

  it('anything earlier today that has passed is overdue, not today', () => {
    expect(classifyDue(at('2026-06-10T13:00:00Z'), now, CHI)).toBe('overdue'); // 08:00 CDT
  });

  it('accepts the ISO strings the database returns', () => {
    expect(classifyDue('2026-06-10T20:00:00+00:00', now, CHI)).toBe('today');
  });
});

describe('classifyDue — the same instant is a different day in a different place', () => {
  // 23:30 UTC on 10 June: 18:30 in Chicago (still the 10th), 06:30 on the
  // 11th in Vientiane.
  const now = at('2026-06-10T23:30:00Z');
  const due = at('2026-06-11T02:00:00Z'); // 21:00 Chicago on the 10th; 09:00 Vientiane on the 11th

  it('is today for a Chicago viewer', () => {
    expect(classifyDue(due, now, CHI)).toBe('today');
  });

  it('is today for a Vientiane viewer too, because both are the 11th there', () => {
    expect(classifyDue(due, now, VTE)).toBe('today');
  });

  it('crosses the date line correctly: a Vientiane viewer\'s tomorrow is still today in Chicago', () => {
    const later = at('2026-06-11T17:30:00Z'); // 12:30 Chicago on the 11th; 00:30 Vientiane on the 12th
    const nowChicago = at('2026-06-11T14:00:00Z'); // 09:00 Chicago, 21:00 Vientiane — both the 11th
    expect(classifyDue(later, nowChicago, CHI)).toBe('today');
    expect(classifyDue(later, nowChicago, VTE)).toBe('upcoming');
  });

  it('never compares a browser-local date against a UTC date', () => {
    // The UTC date of `due` is the 11th; a naive toISOString().slice(0,10)
    // comparison with now's UTC date (the 10th) would call it upcoming.
    expect(due.toISOString().slice(0, 10)).not.toBe(now.toISOString().slice(0, 10));
    expect(classifyDue(due, now, CHI)).toBe('today');
  });
});

describe('classifyDue — daylight-saving days', () => {
  it('spring-forward day (23 hours) in Chicago: late evening is still today', () => {
    const now = at('2026-03-08T07:30:00Z');   // 01:30 CST, before the jump
    const lateEvening = at('2026-03-09T04:59:00Z'); // 23:59 CDT on the 8th
    const nextMidnight = at('2026-03-09T05:00:00Z'); // 00:00 CDT on the 9th
    expect(calendarDate(now, CHI)).toBe('2026-03-08');
    expect(classifyDue(lateEvening, now, CHI)).toBe('today');
    expect(classifyDue(nextMidnight, now, CHI)).toBe('upcoming');
  });

  it('fall-back day (25 hours) in New York: the repeated hour is still today', () => {
    const now = at('2026-11-01T04:30:00Z');   // 00:30 EDT on the 1st
    const secondOneThirty = at('2026-11-01T06:30:00Z'); // 01:30 EST, the second time round
    const lateEvening = at('2026-11-02T04:59:00Z');     // 23:59 EST on the 1st
    const nextMidnight = at('2026-11-02T05:00:00Z');    // 00:00 EST on the 2nd
    expect(classifyDue(secondOneThirty, now, NY)).toBe('today');
    expect(classifyDue(lateEvening, now, NY)).toBe('today');
    expect(classifyDue(nextMidnight, now, NY)).toBe('upcoming');
  });

  it('a reminder due at 09:00 the day after spring-forward is upcoming until that local midnight', () => {
    const due = wallClockToInstant('2026-03-09T09:00', LA)!;
    expect(due.toISOString()).toBe('2026-03-09T16:00:00.000Z'); // PDT, UTC-7
    // Already on PDT since 10:00Z on the 8th, so local midnight is 07:00Z.
    expect(classifyDue(due, at('2026-03-09T06:59:00Z'), LA)).toBe('upcoming'); // 23:59 PDT on the 8th
    expect(classifyDue(due, at('2026-03-09T07:00:00Z'), LA)).toBe('today');    // 00:00 PDT on the 9th
  });
});

describe('wallClockToInstant — what a datetime-local input means', () => {
  it('reads the wall clock in the given timezone, standard and daylight time', () => {
    expect(wallClockToInstant('2026-01-15T09:00', CHI)!.toISOString()).toBe('2026-01-15T15:00:00.000Z');
    expect(wallClockToInstant('2026-07-15T09:00', CHI)!.toISOString()).toBe('2026-07-15T14:00:00.000Z');
    expect(wallClockToInstant('2026-07-15T09:00', VTE)!.toISOString()).toBe('2026-07-15T02:00:00.000Z');
  });

  it('a time skipped by spring-forward lands an hour later', () => {
    expect(wallClockToInstant('2026-03-08T02:30', CHI)!.toISOString()).toBe('2026-03-08T08:30:00.000Z'); // 03:30 CDT
  });

  it('a time repeated by fall-back takes the first occurrence', () => {
    expect(wallClockToInstant('2026-11-01T01:30', CHI)!.toISOString()).toBe('2026-11-01T06:30:00.000Z'); // 01:30 CDT
  });

  it('round-trips through instantToWallClock', () => {
    for (const tz of [CHI, NY, LA, VTE]) {
      for (const local of ['2026-03-08T01:59', '2026-03-08T03:00', '2026-11-01T00:59', '2026-11-01T02:00', '2026-12-31T23:59']) {
        expect(instantToWallClock(wallClockToInstant(local, tz)!, tz)).toBe(local);
      }
    }
  });

  it('rejects anything that is not a real date and time', () => {
    for (const bad of ['', 'tomorrow', '2026-02-30T09:00', '2026-13-01T09:00', '2026-06-10T24:00', '2026-06-10 09:00', '2026-06-10T9:00']) {
      expect(wallClockToInstant(bad, CHI)).toBeNull();
    }
  });
});

describe('dueCounts', () => {
  it('counts open reminders per bucket and ignores closed ones', () => {
    const now = at('2026-06-10T15:00:00Z');
    const counts = dueCounts([
      { dueAt: '2026-06-10T10:00:00Z', status: 'open' },      // overdue
      { dueAt: '2026-06-09T10:00:00Z', status: 'open' },      // overdue
      { dueAt: '2026-06-10T20:00:00Z', status: 'open' },      // today
      { dueAt: '2026-06-12T20:00:00Z', status: 'open' },      // upcoming
      { dueAt: '2026-06-09T10:00:00Z', status: 'completed' }, // closed — ignored
      { dueAt: '2026-06-09T10:00:00Z', status: 'cancelled' }, // closed — ignored
    ], now, CHI);
    expect(counts).toEqual({ overdue: 2, today: 1, upcoming: 1 });
  });
});
