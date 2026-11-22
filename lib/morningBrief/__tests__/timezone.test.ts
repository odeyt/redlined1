/**
 * Morning-brief timezones: the resolution order and the 05:00 decision.
 *
 * The order under test: stored timezone → state parsed from the address →
 * America/New_York. Dates are pinned to 2026-11-23 (after the US fall-back,
 * so Chicago is CST/UTC-6 and New York EST/UTC-5) to keep the arithmetic
 * honest without a DST edge in every case; one summer case pins DST itself.
 */
import {
  localParts,
  nextBriefLocalDate,
  parseStateFromAddress,
  resolveShopTimezone,
  shouldSendMorningBrief,
} from '../timezone';

describe('parseStateFromAddress', () => {
  it('reads a code followed by a ZIP', () => {
    expect(parseStateFromAddress('123 Main St, Austin, TX 78701')).toBe('TX');
  });

  it('reads a code at the end of the address', () => {
    expect(parseStateFromAddress('48 Congress Ave, Austin, TX')).toBe('TX');
  });

  it('reads a full state name', () => {
    expect(parseStateFromAddress('48 Congress Ave, Austin, Texas')).toBe('TX');
    expect(parseStateFromAddress('1 Ocean Blvd, Miami, Florida 33101')).toBe('FL');
  });

  it('prefers the longest state name (West Virginia over Virginia)', () => {
    expect(parseStateFromAddress('9 Ridge Rd, Charleston, West Virginia')).toBe('WV');
  });

  it('does not mistake words in a street name for state codes', () => {
    // "In" is not Indiana here: a bare code is only trusted before a ZIP,
    // a comma, or the end of the string.
    expect(parseStateFromAddress('100 In Bloom Rd, Springfield')).toBeNull();
  });

  it('returns null for a non-US address (the D1 Imports shape)', () => {
    expect(parseStateFromAddress('Ban Sapan Meuk, Vientiane, Laos')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseStateFromAddress(null)).toBeNull();
    expect(parseStateFromAddress('')).toBeNull();
  });
});

describe('resolveShopTimezone — stored → state → default', () => {
  it('a valid stored timezone wins over the address', () => {
    const r = resolveShopTimezone({ storedTimezone: 'Asia/Bangkok', address: 'Austin, TX 78701' });
    expect(r).toEqual({ timezone: 'Asia/Bangkok', source: 'stored', state: null });
  });

  it('an invalid stored timezone falls through to the state', () => {
    const r = resolveShopTimezone({ storedTimezone: 'Mars/Olympus', address: 'Austin, TX 78701' });
    expect(r).toEqual({ timezone: 'America/Chicago', source: 'state', state: 'TX' });
  });

  it('derives the zone from the address state', () => {
    expect(resolveShopTimezone({ address: '1 Pine St, Seattle, WA 98101' }).timezone)
      .toBe('America/Los_Angeles');
    expect(resolveShopTimezone({ address: '77 Peachtree St, Atlanta, Georgia' }).timezone)
      .toBe('America/New_York');
    expect(resolveShopTimezone({ address: '5 Saguaro Way, Phoenix, AZ 85001' }).timezone)
      .toBe('America/Phoenix');
  });

  it('defaults to America/New_York when nothing resolves', () => {
    const r = resolveShopTimezone({ address: 'Ban Sapan Meuk, Vientiane, Laos' });
    expect(r).toEqual({ timezone: 'America/New_York', source: 'default', state: null });
    expect(resolveShopTimezone({}).source).toBe('default');
  });
});

describe('localParts + shouldSendMorningBrief — the 05:00 decision', () => {
  // 2026-11-23T11:15:00Z is 05:15 in Chicago (CST) and 06:15 in New York (EST).
  const inChicagoFive = new Date('2026-11-23T11:15:00Z');

  it('computes local date and hour per zone', () => {
    expect(localParts(inChicagoFive, 'America/Chicago')).toEqual({ localDate: '2026-11-23', hour: 5 });
    expect(localParts(inChicagoFive, 'America/New_York')).toEqual({ localDate: '2026-11-23', hour: 6 });
    expect(localParts(inChicagoFive, 'Asia/Bangkok')).toEqual({ localDate: '2026-11-23', hour: 18 });
  });

  it('is due inside the local 05:00 hour when nothing was sent', () => {
    const d = shouldSendMorningBrief({ now: inChicagoFive, timezone: 'America/Chicago', alreadySentForLocalDate: false });
    expect(d).toEqual({ due: true, localDate: '2026-11-23', hour: 5, alreadySent: false });
  });

  it('is not due outside the 05:00 hour', () => {
    const d = shouldSendMorningBrief({ now: inChicagoFive, timezone: 'America/New_York', alreadySentForLocalDate: false });
    expect(d.due).toBe(false);
    expect(d.hour).toBe(6);
  });

  it('is not due at 04:59 local — the brief is never sent early either', () => {
    const before = new Date('2026-11-23T10:59:00Z'); // 04:59 CST
    const d = shouldSendMorningBrief({ now: before, timezone: 'America/Chicago', alreadySentForLocalDate: false });
    expect(d.due).toBe(false);
    expect(d.hour).toBe(4);
  });

  it('an existing send for the local date blocks a second one', () => {
    const d = shouldSendMorningBrief({ now: inChicagoFive, timezone: 'America/Chicago', alreadySentForLocalDate: true });
    expect(d.due).toBe(false);
    expect(d.alreadySent).toBe(true);
  });

  it('respects DST: the same UTC instant is 05:00 in Chicago only in winter', () => {
    // 2026-07-15T11:15:00Z is 06:15 CDT — Chicago has sprung forward.
    const summer = new Date('2026-07-15T11:15:00Z');
    expect(localParts(summer, 'America/Chicago').hour).toBe(6);
    expect(localParts(summer, 'America/Phoenix').hour).toBe(4); // Phoenix never moves
  });
});

describe('nextBriefLocalDate', () => {
  it('is today before 05:00 and tomorrow from 05:00 on', () => {
    const early = new Date('2026-11-23T09:00:00Z'); // 03:00 CST
    expect(nextBriefLocalDate(early, 'America/Chicago')).toBe('2026-11-23');
    const after = new Date('2026-11-23T11:15:00Z'); // 05:15 CST
    expect(nextBriefLocalDate(after, 'America/Chicago')).toBe('2026-11-24');
  });
});
