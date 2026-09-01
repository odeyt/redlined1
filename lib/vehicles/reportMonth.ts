/**
 * Which month a vehicle counts towards in a completion report.
 *
 * Extracted from VehiclesView so it can be RUN. The rule shipped wrong once —
 * a month selection let every open job through whatever its date, so choosing
 * August returned cars received in March — and the test defending it matched
 * the source text rather than the behaviour, which is why nothing caught it.
 */

/** Just the fields the month rule reads. */
export interface ReportableVehicle {
  status: string;
  completedAt?: string | null;
  dateReceived?: string | null;
}

/**
 * Substring match, because the column holds free text and has carried
 * 'Completed' and 'Complete' at different times.
 */
export function isCompletedStatus(status: string | null | undefined): boolean {
  return /complet/i.test(status ?? '');
}

/**
 * The date a vehicle reports under, or null if it reports under none.
 *
 * `completedAt` is the truth. `dateReceived` is a fallback for the 18 vehicles
 * finished before the completion column existed, and it is the WRONG date — a
 * car received in June and finished in July reports under June. The UI counts
 * those separately and says so rather than presenting the two as equivalent.
 *
 * Null for anything not completed: an open job was not completed in any month,
 * so it belongs in no month's report.
 */
export function reportDate(v: ReportableVehicle): string | null {
  if (!isCompletedStatus(v.status)) return null;
  return v.completedAt ?? v.dateReceived ?? null;
}

/**
 * Whether this vehicle belongs in the report for `month` (1-12) of `year`.
 *
 * Month AND year: month alone merges July 2025 into July 2026.
 */
export function matchesReportMonth(
  v: ReportableVehicle,
  month: number,
  year: number,
): boolean {
  if (!month) return true;
  const raw = reportDate(v);
  if (!raw) return false;
  const d = new Date(raw);
  // An unparseable date must drop out, not throw and take the page with it.
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}
