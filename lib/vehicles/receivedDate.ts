/**
 * The date a vehicle is recorded as received when nobody entered one.
 *
 * vehicles.date_received is a plain DATE, and the Vehicle Intake report places a
 * car in a month by it. A vehicle with no date appears in no month at all, so
 * every path that creates a vehicle defaults it to today.
 *
 * Built from the local calendar date, not toISOString(): in the shop's time zone
 * (UTC+7) the UTC date is still "yesterday" until 07:00, which would file a car
 * received on the 1st under the previous month.
 */
export function todayIsoDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The received date to store: the one given, else today. Blank counts as missing. */
export function receivedDateOrToday(given: string | null | undefined, now: Date = new Date()): string {
  const trimmed = (given ?? '').trim();
  return trimmed ? trimmed.slice(0, 10) : todayIsoDate(now);
}

/**
 * Whether a vehicle's received date falls in the given month (1-12) of `year`.
 *
 * date_received is a plain DATE (YYYY-MM-DD), so the month is read from the text
 * itself. Going through new Date() would read it as UTC midnight and, in a time
 * zone behind UTC, file the 1st under the previous month. No month (0) matches
 * everything; a missing or malformed date matches no month.
 */
export function receivedInMonth(dateReceived: string | null | undefined, month: number, year: number): boolean {
  if (!month) return true;
  const m = /^(\d{4})-(\d{2})/.exec((dateReceived ?? '').trim());
  if (!m) return false;
  return Number(m[1]) === year && Number(m[2]) === month;
}

// ── Received-date filter: a month, or a custom date range ───────────────────

export type ReceivedFilter =
  | { kind: 'any' }
  | { kind: 'month'; month: number; year: number }
  /** Inclusive on both ends. An empty bound is open: "from 1 Sep" with no end means 1 Sep onwards. */
  | { kind: 'range'; from: string; to: string };

/** Month number meaning "custom date range" in the month picker. */
export const RECEIVED_CUSTOM_RANGE = -1;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day in YYYY-MM-DD form (rejects 2026-02-31). */
export function isIsoDay(s: string | null | undefined): s is string {
  if (!s || !DAY.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Builds the filter from the picker: 0 = any month, 1-12 = that month of `year`,
 * -1 = the custom range. A range with no usable date at all is no filter, and a
 * bound that is not a real date is treated as not entered.
 */
export function buildReceivedFilter(month: number, year: number, from: string, to: string): ReceivedFilter {
  if (month === RECEIVED_CUSTOM_RANGE) {
    const f = isIsoDay(from) ? from : '';
    const t = isIsoDay(to) ? to : '';
    return f || t ? { kind: 'range', from: f, to: t } : { kind: 'any' };
  }
  return month >= 1 && month <= 12 ? { kind: 'month', month, year } : { kind: 'any' };
}

/** From is after To: nothing can match, and the screen should say so. */
export function isBackwardsRange(f: ReceivedFilter): boolean {
  return f.kind === 'range' && !!f.from && !!f.to && f.from > f.to;
}

/** Whether a vehicle's received date passes the filter. A missing date passes only "any". */
export function matchesReceived(dateReceived: string | null | undefined, f: ReceivedFilter): boolean {
  if (f.kind === 'any') return true;
  if (f.kind === 'month') return receivedInMonth(dateReceived, f.month, f.year);
  const day = (dateReceived ?? '').trim().slice(0, 10);
  if (!isIsoDay(day)) return false;
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  return true;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const niceDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MON[m - 1]} ${y}`;
};

/** The filter in words, for the on-screen chip and the file name. */
export function describeReceived(f: ReceivedFilter): string {
  if (f.kind === 'month') return `${MONTH_NAMES[f.month - 1]} ${f.year}`;
  if (f.kind === 'range') {
    if (f.from && f.to) return f.from === f.to ? niceDay(f.from) : `${niceDay(f.from)} to ${niceDay(f.to)}`;
    return f.from ? `${niceDay(f.from)} onwards` : `up to ${niceDay(f.to)}`;
  }
  return 'any date';
}
