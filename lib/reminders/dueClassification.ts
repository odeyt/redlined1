/**
 * When is a reminder "overdue", "due today" or "upcoming"?
 *
 * Due times are stored as instants (timestamptz, UTC on the wire). A day is
 * not an instant: "today" is a calendar date in some timezone, and it starts
 * and ends at different instants in Chicago, New York and Vientiane — and on
 * a daylight-saving change it is 23 or 25 hours long.
 *
 * RedlineD1 has no stored shop timezone, so the day is the VIEWER's calendar
 * day, in the timezone their browser reports. Every comparison below goes
 * through that explicit timezone; nothing compares a browser-local date string
 * against a UTC string.
 *
 * The rules, exactly:
 *
 *   completed / cancelled   never overdue, today or upcoming — they are closed.
 *   overdue                 open, and due strictly before `now`.
 *   today                   open, not overdue, and due on the same calendar
 *                           date as `now` in `timeZone`.
 *   upcoming                open, and due on a later calendar date.
 *
 * So a reminder due at 09:00 is "today" at 08:59 and "overdue" at 09:00:01.
 * Due exactly at `now` is not yet overdue.
 */

export type DueBucket = 'overdue' | 'today' | 'upcoming';

/** The viewer's IANA timezone, with UTC as the only fallback. */
export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** Calendar date of `instant` in `timeZone`, as YYYY-MM-DD. */
export function calendarDate(instant: Date, timeZone: string): string {
  let fmt = dayFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFormatters.set(timeZone, fmt);
  }
  return fmt.format(instant);
}

export function classifyDue(dueAt: Date | string, now: Date, timeZone: string): DueBucket {
  const due = typeof dueAt === 'string' ? new Date(dueAt) : dueAt;
  if (due.getTime() < now.getTime()) return 'overdue';
  return calendarDate(due, timeZone) === calendarDate(now, timeZone) ? 'today' : 'upcoming';
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (Chicago: -300 or -360). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * The instant a wall-clock time names in `timeZone`.
 *
 * `local` is what a datetime-local input produces: 'YYYY-MM-DDTHH:MM'.
 * Returns null for anything that is not a real date and time.
 *
 * Around a daylight-saving change (the same rule as JavaScript's own Date and
 * Temporal's "compatible" mode):
 *   - a time that occurs twice (fall-back) resolves to the FIRST occurrence;
 *   - a time that never occurs (spring-forward gap) is read with the offset in
 *     force before the gap, so 02:30 on the spring-forward night lands at 03:30.
 */
export function wallClockToInstant(local: string, timeZone: string): Date | null {
  const text = local.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(naive);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;

  // The two offsets that can apply to this wall-clock time: the one in force a
  // day before and the one a day after. They differ only across a transition.
  const DAY = 86_400_000;
  const before = naive - offsetMinutes(new Date(naive - DAY), timeZone) * 60000;
  const after = naive - offsetMinutes(new Date(naive + DAY), timeZone) * 60000;
  const matches = [before, after]
    .filter(t => instantToWallClock(new Date(t), timeZone) === text)
    .sort((a, b) => a - b);
  return new Date(matches.length > 0 ? matches[0] : before);
}

/** The wall-clock time of `instant` in `timeZone`, as 'YYYY-MM-DDTHH:MM' for a datetime-local input. */
export function instantToWallClock(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Counts of open reminders per bucket. Closed reminders are ignored. */
export function dueCounts(
  reminders: readonly { dueAt: string; status: string }[],
  now: Date,
  timeZone: string,
): Record<DueBucket, number> {
  const counts: Record<DueBucket, number> = { overdue: 0, today: 0, upcoming: 0 };
  for (const r of reminders) {
    if (r.status !== 'open') continue;
    counts[classifyDue(r.dueAt, now, timeZone)] += 1;
  }
  return counts;
}
