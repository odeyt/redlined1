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
