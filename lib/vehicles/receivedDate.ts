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
