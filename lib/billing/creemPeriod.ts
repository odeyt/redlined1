/**
 * lib/billing/creemPeriod.ts
 * Reads a subscription's billing period from a Creem webhook object.
 *
 * Verified shapes (key NAMES read from stored production events; the values were never copied):
 *   - `subscription.*` events (e.g. subscription.paid): the object IS the subscription and carries
 *     `current_period_start_date` and `current_period_end_date` as ISO-8601 strings.
 *   - `checkout.completed`: the object carries a nested `subscription` object with the same two fields.
 *
 * The handler used to read `current_period_start` / `current_period_end`, names that no stored payload
 * carries. Every period was therefore the code's own guess (now + 30 days) instead of the provider's.
 * Those old names are deliberately NOT read here: they were never observed in a real payload, so
 * accepting them would keep a guess alive. If Creem is ever seen sending them, add them then, with the
 * evidence.
 *
 * A missing or unparseable date yields null. Callers must not invent one: the columns are nullable, an
 * unknown period is stored as unknown, and an event that carries no period leaves the stored one alone.
 *
 * The period is DISPLAY data. Entitlement comes from profiles.plan (lib/planGate getPlanStatus) and
 * nothing reads the period to grant or remove access; lib/__tests__/creemWebhookRoute.test.ts pins that.
 */

export interface SubscriptionPeriod {
  start: Date | null;
  end: Date | null;
}

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** ISO string, or epoch seconds/milliseconds. Anything else, or an implausible date, is null. */
export function parseProviderDate(v: unknown): Date | null {
  let d: Date | null = null;
  if (typeof v === 'string' && v.trim() !== '') {
    const t = Date.parse(v);
    d = Number.isNaN(t) ? null : new Date(t);
  } else if (typeof v === 'number' && Number.isFinite(v)) {
    d = new Date(v < 1e12 ? v * 1000 : v);
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  return y >= MIN_YEAR && y <= MAX_YEAR ? d : null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function readSubscriptionPeriod(data: Record<string, unknown>): SubscriptionPeriod {
  const nested = isRecord(data.subscription) ? data.subscription : {};
  const start = parseProviderDate(data.current_period_start_date) ?? parseProviderDate(nested.current_period_start_date);
  const end   = parseProviderDate(data.current_period_end_date)   ?? parseProviderDate(nested.current_period_end_date);
  // A period that ends before it starts is provider data we cannot trust: store neither.
  if (start && end && end.getTime() < start.getTime()) return { start: null, end: null };
  return { start, end };
}
