/**
 * What a vehicle's live status chip should say, from its open repair orders.
 *
 * ## Why
 *
 * A vehicle's own status is a flag staff move by hand. Opening and closing
 * repair orders does not update it, so the chips drifted: the board could show
 * 35 vehicles In Progress, 6 Pending Approval and 15 Pending Parts while the
 * shop had a few dozen open jobs in total. The repair orders are the record of
 * what is actually open, so the in-shop chips follow them.
 *
 * ## The rule
 *
 *   - Archived stays Archived (a deliberate flag, not a work state).
 *   - A vehicle with an open repair order is under the most pressing one:
 *     Pending Approval, then Pending Parts, then In Progress (an Open repair
 *     order counts as In Progress: the car is here and work is open).
 *     A flag of Returned Job is kept, because it says why the car is back.
 *   - With NO open repair order, the three in-shop flags (In Progress, Pending
 *     Approval, Pending Parts) are stale: they claim open work that is not
 *     there, so the vehicle shows No open jobs.
 *   - Every other flag (Completed, Active, Pending, No open jobs) has no
 *     repair-order meaning and is kept as set.
 *
 * Repair orders name the vehicle by text, so linking uses the same unique-match
 * rule as completed work (lib/vehicles/completedWork.ts). An open repair order
 * that links to no single vehicle cannot move a chip; the screen lists those.
 */

import { groupByVehicle, type VehicleIdentity } from './completedWork';

export interface OpenJob {
  /** Job card id when known, else the repair order id. Unique per job. */
  key: string;
  jobCardId: string;
  roNumber: string;
  customerName: string;
  /** The vehicle as the repair order names it (free text). */
  vehicle: string;
  technician: string;
  /** The repair order's own status: Open, In Progress, Pending Parts or Pending Approval. */
  status: string;
  openedAt: string | null;
}

export interface OpenRoRow {
  id?: string | null;
  ro_number?: string | null;
  job_card_id?: string | null;
  customer_name?: string | null;
  vehicle?: string | null;
  technician?: string | null;
  status?: string | null;
  opened_date?: string | null;
}

/** Repair order statuses that mean the work is finished or cancelled. */
const NOT_OPEN = new Set(['Complete', 'Closed', 'Void']);

export const isOpenRoStatus = (s: string | null | undefined) => !!s && !NOT_OPEN.has(s);

/** The flags that assert there is open work on the vehicle. */
export const IN_SHOP_FLAGS: ReadonlySet<string> = new Set(['In Progress', 'Pending Approval', 'Pending Parts']);

/** Open repair orders only, one per job (a job card id wins over the repair order id). */
export function toOpenJobs(rows: OpenRoRow[]): OpenJob[] {
  const byKey = new Map<string, OpenJob>();
  for (const r of rows) {
    if (!isOpenRoStatus(r.status)) continue;
    const jobCardId = (r.job_card_id ?? '').trim();
    const key = jobCardId || `ro:${r.id ?? r.ro_number ?? ''}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      key,
      jobCardId,
      roNumber: r.ro_number ?? '',
      customerName: (r.customer_name ?? '').trim(),
      vehicle: (r.vehicle ?? '').trim(),
      technician: (r.technician ?? '').trim(),
      status: r.status as string,
      openedAt: r.opened_date ?? null,
    });
  }
  return [...byKey.values()];
}

/** The chip a single open repair order puts a vehicle under. */
export function chipForOpenRo(roStatus: string): 'Pending Approval' | 'Pending Parts' | 'In Progress' {
  if (roStatus === 'Pending Approval') return 'Pending Approval';
  if (roStatus === 'Pending Parts') return 'Pending Parts';
  return 'In Progress'; // Open and In Progress
}

const PRESSING: Record<string, number> = { 'Pending Approval': 3, 'Pending Parts': 2, 'In Progress': 1 };

/**
 * The status to show and count for a vehicle in the live view.
 * `openJobs` are the open repair orders linked to this one vehicle (or none).
 */
export function liveStatus(flag: string | null | undefined, openJobs: OpenJob[] | undefined): string {
  const own = (flag ?? '').trim();
  if (own === 'Archived') return 'Archived';

  if (openJobs && openJobs.length > 0) {
    if (own === 'Returned Job') return 'Returned Job';
    return openJobs
      .map(j => chipForOpenRo(j.status))
      .reduce((best, c) => (PRESSING[c] > PRESSING[best] ? c : best));
  }

  if (IN_SHOP_FLAGS.has(own)) return 'No open jobs'; // the flag claims work that is not open
  return own || 'No open jobs';
}

/** Open repair orders per vehicle id, using the unique-match rule. */
export function openJobsByVehicle(vehicles: VehicleIdentity[], jobs: OpenJob[]): Map<string, OpenJob[]> {
  return groupByVehicle(vehicles, jobs);
}
