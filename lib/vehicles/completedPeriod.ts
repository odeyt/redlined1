/**
 * The "Completed in" search period: a whole month, or a custom date range.
 *
 * The picker is the same shape as the Received-in one (lib/vehicles/receivedDate.ts),
 * so it reuses that filter type. Completion is a moment in time (a sign-off
 * timestamp), so the filter becomes a period of instants rather than a pair of
 * plain dates.
 *
 * Days are the shop's local calendar, the same as the rest of the reports. For a
 * range, BOTH end days are included in full: "1 Sep to 15 Sep" runs from the start
 * of 1 Sep to the end of 15 Sep. An empty bound is open-ended.
 */

import {
  buildReceivedFilter, isBackwardsRange, describeReceived, RECEIVED_CUSTOM_RANGE,
  type ReceivedFilter,
} from './receivedDate';

export type CompletedFilter = ReceivedFilter;

/** Month number meaning "custom date range" in the month picker. */
export const COMPLETED_CUSTOM_RANGE = RECEIVED_CUSTOM_RANGE;

export const buildCompletedFilter = buildReceivedFilter;
export const isBackwardsCompletedRange = isBackwardsRange;
export const describeCompleted = describeReceived;

export interface Period {
  /** Inclusive, ISO instant. */
  startIso: string;
  /** Exclusive, ISO instant. */
  endIso: string;
}

const OPEN_START = '1970-01-01T00:00:00.000Z';
const OPEN_END = '2100-01-01T00:00:00.000Z';

function localMidnight(day: string, plusDays = 0): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + plusDays);
}

/**
 * The period a filter covers, or null for no filter. A range whose "from" is
 * after its "to" covers nothing (an empty period), not an error.
 */
export function completedPeriod(f: CompletedFilter): Period | null {
  if (f.kind === 'any') return null;
  if (f.kind === 'month') {
    return {
      startIso: new Date(f.year, f.month - 1, 1).toISOString(),
      endIso: new Date(f.year, f.month, 1).toISOString(), // Date rolls December into January
    };
  }
  if (isBackwardsCompletedRange(f)) {
    const at = localMidnight(f.from).toISOString();
    return { startIso: at, endIso: at };
  }
  return {
    startIso: f.from ? localMidnight(f.from).toISOString() : OPEN_START,
    endIso: f.to ? localMidnight(f.to, 1).toISOString() : OPEN_END, // end of the "to" day
  };
}

/** Whether an instant falls in the period. No period means no restriction. */
export function inPeriod(iso: string | null | undefined, p: Period | null): boolean {
  if (!p) return true;
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) && t >= Date.parse(p.startIso) && t < Date.parse(p.endIso);
}
