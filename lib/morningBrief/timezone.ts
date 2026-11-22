/**
 * Morning-brief timezones: which 05:00 a shop means.
 *
 * Shops carry no timezone column of their own history — the shops table
 * has no location fields at all, and a shop's location lives only in
 * shop_settings (address, free text; plus the `timezone` column added by
 * supabase/migrations/2026-11-23_morning_brief_email.sql). Resolution
 * order, first hit wins:
 *
 *   1. stored    shop_settings.timezone, when it holds a valid IANA zone.
 *   2. state     the US state parsed out of shop_settings.address, mapped
 *                through STATE_TIMEZONES (each state's primary zone —
 *                split states resolve to the zone of their largest metro).
 *   3. default   America/New_York.
 *
 * Everything here is pure and Intl-based: no date library, and the DST
 * rules come from the platform's tz database, never from hand-kept
 * offsets.
 */

export const DEFAULT_TIMEZONE = 'America/New_York';
export const BRIEF_HOUR = 5;

/** Primary IANA zone per US state (+ DC). Split states use their largest
 *  metro's zone: FL→Eastern (Miami), KY→Eastern (Louisville), TN→Central
 *  (Nashville/Memphis), ID→Mountain (Boise), OR→Pacific, NE/SD/ND→Central,
 *  IN→Indianapolis. A stored timezone always overrides this heuristic. */
export const STATE_TIMEZONES: Readonly<Record<string, string>> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  DC: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  ID: 'America/Boise',
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago',
  KS: 'America/Chicago',
  KY: 'America/New_York',
  LA: 'America/Chicago',
  ME: 'America/New_York',
  MD: 'America/New_York',
  MA: 'America/New_York',
  MI: 'America/Detroit',
  MN: 'America/Chicago',
  MS: 'America/Chicago',
  MO: 'America/Chicago',
  MT: 'America/Denver',
  NE: 'America/Chicago',
  NV: 'America/Los_Angeles',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NY: 'America/New_York',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VT: 'America/New_York',
  VA: 'America/New_York',
  WA: 'America/Los_Angeles',
  WV: 'America/New_York',
  WI: 'America/Chicago',
  WY: 'America/Denver',
};

/** Full state names → code, for addresses written "Austin, Texas". */
const STATE_NAMES: Readonly<Record<string, string>> = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
  COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', 'DISTRICT OF COLUMBIA': 'DC',
  FLORIDA: 'FL', GEORGIA: 'GA', HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL',
  INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA',
  MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA', MICHIGAN: 'MI',
  MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT',
  NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR',
  PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT',
  VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI', WYOMING: 'WY',
};

export function isValidTimezone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The US state in a free-text address, as a 2-letter code — or null.
 *
 * Full names are tried first (longest match, so "West Virginia" beats
 * "Virginia"). A bare code is only trusted in the shape addresses actually
 * use — followed by a ZIP, a comma, or the end of the string — so words
 * like "IN" or "OR" in a street name never resolve to a state.
 */
export function parseStateFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const upper = address.toUpperCase();

  let best: { code: string; at: number } | null = null;
  for (const [name, code] of Object.entries(STATE_NAMES)) {
    const at = upper.search(new RegExp(`\\b${name}\\b`));
    if (at >= 0 && (!best || at < best.at)) best = { code, at };
  }
  if (best) return best.code;

  for (const code of Object.keys(STATE_TIMEZONES)) {
    if (new RegExp(`\\b${code}\\b(?=\\s+\\d{5}|\\s*,|\\s*$)`).test(upper)) return code;
  }
  return null;
}

export type TimezoneSource = 'stored' | 'state' | 'default';

export interface ResolvedTimezone {
  timezone: string;
  source: TimezoneSource;
  /** The state the zone came from, when source is 'state'. */
  state: string | null;
}

/** The resolution order, in one place: stored → state → default. */
export function resolveShopTimezone(input: {
  storedTimezone?: string | null;
  address?: string | null;
}): ResolvedTimezone {
  const stored = input.storedTimezone?.trim();
  if (stored && isValidTimezone(stored)) {
    return { timezone: stored, source: 'stored', state: null };
  }
  const state = parseStateFromAddress(input.address);
  if (state && STATE_TIMEZONES[state]) {
    return { timezone: STATE_TIMEZONES[state], source: 'state', state };
  }
  return { timezone: DEFAULT_TIMEZONE, source: 'default', state: null };
}

/** The calendar date ('YYYY-MM-DD') and hour (0–23) of `now` in `timezone`. */
export function localParts(now: Date, timezone: string): { localDate: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return {
    localDate: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number.parseInt(get('hour'), 10) % 24,
  };
}

/** The local date of the shop's next 05:00 (today's if it is still ahead). */
export function nextBriefLocalDate(now: Date, timezone: string): string {
  const { localDate, hour } = localParts(now, timezone);
  if (hour < BRIEF_HOUR) return localDate;
  const next = new Date(`${localDate}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export interface BriefDecision {
  /** True only inside the shop's local 05:00 hour, with no send on record. */
  due: boolean;
  localDate: string;
  hour: number;
  /** Set when not due because a send is already recorded for the local date. */
  alreadySent: boolean;
}

/**
 * The send decision for one shop at one instant. `alreadySent` is whether
 * morning_brief_sends already holds a blocking row (claimed/sent/uncertain)
 * for the shop's CURRENT local date — the caller looks it up, this stays
 * pure.
 */
export function shouldSendMorningBrief(input: {
  now: Date;
  timezone: string;
  alreadySentForLocalDate: boolean;
}): BriefDecision {
  const { localDate, hour } = localParts(input.now, input.timezone);
  return {
    due: hour === BRIEF_HOUR && !input.alreadySentForLocalDate,
    localDate,
    hour,
    alreadySent: input.alreadySentForLocalDate,
  };
}
