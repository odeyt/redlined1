/**
 * Dates for the demo seed, relative to the moment it runs.
 *
 * ## Why "today" is a window, not a date
 *
 * Two parts of the Command Center disagree about what today is:
 *
 *   - MetricsBuilder runs on the server. On Vercel that is UTC, so its "today"
 *     starts at 00:00 UTC (payments today, repair cases today, stuck jobs).
 *   - useOperationalStats runs in the browser, so its "today" starts at local
 *     midnight — for the demo shop, America/Chicago (Revenue Today).
 *
 * A record dated "today" must count as today for BOTH, or the revenue card and
 * the payments tile would disagree on camera. So every "today" timestamp is
 * placed inside the overlap: after Chicago midnight AND after UTC midnight,
 * and no later than now. That overlap is empty from 00:00 to 05:00/06:00 UTC
 * (evening in Chicago), and the seed refuses to run then rather than write
 * records half the dashboard would call yesterday.
 *
 * Pure: every function takes `now` explicitly, so tests can pin any moment.
 */

export const DEMO_TIME_ZONE = 'America/Chicago';

/** Margin inside the window, so a DST change or clock skew cannot push a record out of "today". */
const EDGE_MS = 60 * 60 * 1000;

/** Shortest usable window. Below this the seed would stack every "today" record on one instant. */
export const MIN_TODAY_WINDOW_MS = 30 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LocalDate { year: number; month: number; day: number }

/** Calendar date of `now` in `timeZone`. */
export function localDate(now: Date, timeZone = DEMO_TIME_ZONE): LocalDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Offset of `timeZone` from UTC at `at`, in minutes (Chicago: -300 or -360). */
export function utcOffsetMinutes(at: Date, timeZone = DEMO_TIME_ZONE): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === '-' ? -minutes : minutes;
}

/** The UTC instant of `hour:minute` local time, `dayOffset` days from `now`'s local date. */
export function localTime(now: Date, dayOffset: number, hour: number, minute = 0, timeZone = DEMO_TIME_ZONE): Date {
  const d = localDate(now, timeZone);
  const wallClockAsUtc = Date.UTC(d.year, d.month - 1, d.day + dayOffset, hour, minute);
  // The offset in force at that instant (approximated by the offset at the
  // wall-clock reading itself), so a date across a DST change is still right.
  const offset = utcOffsetMinutes(new Date(wallClockAsUtc), timeZone);
  return new Date(wallClockAsUtc - offset * 60 * 1000);
}

/** 'YYYY-MM-DD' of the local date `dayOffset` days from `now`. */
export function localDateString(now: Date, dayOffset = 0, timeZone = DEMO_TIME_ZONE): string {
  return localTime(now, dayOffset, 12, 0, timeZone).toISOString().slice(0, 10);
}

export interface TodayWindow {
  start: Date;
  end: Date;
  /** False when "today" in Chicago and "today" in UTC do not overlap long enough. */
  usable: boolean;
}

export function todayWindow(now: Date, timeZone = DEMO_TIME_ZONE): TodayWindow {
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const localMidnight = localTime(now, 0, 0, 0, timeZone).getTime();
  const localDay = localDateString(now, 0, timeZone);
  const utcDay = new Date(utcMidnight).toISOString().slice(0, 10);
  const start = new Date(Math.max(utcMidnight, localMidnight) + EDGE_MS);
  const end = new Date(now.getTime() - 60 * 1000);
  const usable = localDay === utcDay && end.getTime() - start.getTime() >= MIN_TODAY_WINDOW_MS;
  return { start, end, usable };
}

/**
 * The i-th of n evenly spaced instants inside today's window. Deterministic
 * for a given `now`, so a second run on the same day computes the same times.
 */
export function todaySlot(window: TodayWindow, i: number, n: number): Date {
  const span = window.end.getTime() - window.start.getTime();
  return new Date(window.start.getTime() + Math.floor((span * (i + 1)) / (n + 1)));
}

/** Days from `now`'s local date back to the 1st of its month (0 on the 1st). */
export function daysIntoMonth(now: Date, timeZone = DEMO_TIME_ZONE): number {
  return localDate(now, timeZone).day - 1;
}

/**
 * Stable identifier for one day's seed: the local date as YYMMDD. Every dated
 * record carries it, which is what makes the seed idempotent within a day and
 * lets a later day's run tell its own records from yesterday's.
 */
export function generationKey(now: Date, timeZone = DEMO_TIME_ZONE): string {
  return localDateString(now, 0, timeZone).slice(2).replace(/-/g, '');
}

export { DAY_MS };
