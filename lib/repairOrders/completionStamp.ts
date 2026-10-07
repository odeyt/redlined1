/**
 * The completion date stamped on a repair order, kept honest.
 *
 * Reports place a completed job in the month of its repair order's closed_date
 * (lib/vehicles/completedWork.ts). Two paths used to get that date wrong:
 *
 *   - Reopening a completed repair order (status dropdown, or a failed QA
 *     re-check) changed the status but left closed_date behind. The order was
 *     open again but still carried a completion date.
 *   - Signing it off again then reused that old date (`ro.closedDate || now`), so
 *     work finished in October was reported under the September it was first
 *     finished in.
 *
 * The rule: an open repair order has no completion date; completing one stamps
 * the moment it is completed; an action on an order that is ALREADY complete
 * (raising its invoice later) keeps the date it was completed.
 */

const FINISHED = new Set(['Complete', 'Closed']);

export const isFinishedRoStatus = (s: string | null | undefined) => FINISHED.has(s ?? '');

/**
 * The closed date to write when an order is being completed now: today's moment,
 * unless the order is already finished and has a date, which is kept.
 */
export function completionDate(
  currentStatus: string | null | undefined,
  currentClosedDate: string | null | undefined,
  now: Date = new Date(),
): string {
  if (isFinishedRoStatus(currentStatus) && currentClosedDate) return currentClosedDate;
  return now.toISOString();
}

/**
 * The closedDate field to send with a status change, if any. Moving to an open
 * status clears a stale completion date ('' is written as NULL by
 * updateRepairOrder); anything else leaves it alone (undefined = not sent).
 */
export function closedDateForStatusChange(
  newStatus: string,
  currentClosedDate: string | null | undefined,
): '' | undefined {
  if (!isFinishedRoStatus(newStatus) && currentClosedDate) return '';
  return undefined;
}
