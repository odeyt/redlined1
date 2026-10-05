/**
 * Which work was completed in a month, and which vehicle it belongs to.
 *
 * ## Why this exists
 *
 * "Completed in <month>" in Vehicle Management used to mean "the vehicle's own
 * status is Completed and it was stamped in that month". But the vehicle status
 * is a flag staff move by hand: signing off a repair order does NOT change it.
 * Across the whole history only ~18 vehicles ever carried Completed, so choosing
 * a busy month returned one car.
 *
 * Work is actually completed in two places that DO record a closing date:
 *   - repair orders: status Complete / Closed with closed_date (QA sign-off)
 *   - the closed-job archive: closing a job card moves it to closed_jobs with
 *     closed_date (and removes it from job_cards, so it must be read separately)
 *
 * A job card, its repair order and its archive row are the SAME job, so jobs are
 * merged on the job-card id before counting.
 *
 * ## How a job finds its vehicle
 *
 * Repair orders and job cards name the vehicle by text, not id. A job is matched
 * to a vehicle by a normalised label, plate or VIN, and ONLY when that key
 * identifies exactly one vehicle. A name shared by two vehicles is skipped rather
 * than guessed, the same guard supabase/migrations/2026-09-01_vehicles_completed_
 * at_backfill_from_repair_orders.sql used.
 */

export type CompletedSource = 'repair_order' | 'closed_job' | 'job_card';

export interface CompletedJob {
  /** Job card id when known, else the repair order id. Unique per job. */
  key: string;
  jobCardId: string;
  roNumber: string;
  customerName: string;
  /** The vehicle as the job names it (free text). */
  vehicle: string;
  technician: string;
  /** ISO timestamp the job was completed. */
  closedAt: string;
  source: CompletedSource;
}

export interface RoRow {
  id?: string | null;
  ro_number?: string | null;
  job_card_id?: string | null;
  customer_name?: string | null;
  vehicle?: string | null;
  technician?: string | null;
  status?: string | null;
  closed_date?: string | null;
}

export interface JobRow {
  id?: string | null;
  customer?: string | null;
  vehicle?: string | null;
  technicians?: string[] | null;
  status?: string | null;
  closed_date?: string | null;
}

/** Repair order statuses that mean the work is finished. */
export const isFinishedRoStatus = (s: string | null | undefined) => s === 'Complete' || s === 'Closed';

/** Job statuses that mean the work is finished. */
export const isFinishedJobStatus = (s: string | null | undefined) =>
  s === 'Complete' || s === 'Closed' || s === 'Invoiced';

/** Lower-case letters and digits only, so "Honda Accord #8979" and "honda accord 8979" agree. */
export const normKey = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const validDate = (s: string | null | undefined): s is string => !!s && Number.isFinite(Date.parse(s));

/**
 * One list of completed jobs from the three places they live. Repair orders are
 * the richest record, so a job present as a repair order and as an archive row
 * is kept once, as the repair order. Rows with no usable closing date are
 * dropped: a job with no completion date was completed in no month.
 */
export function mergeCompletedJobs(ros: RoRow[], closedJobs: JobRow[], jobCards: JobRow[]): CompletedJob[] {
  const byKey = new Map<string, CompletedJob>();

  for (const r of ros) {
    if (!isFinishedRoStatus(r.status) || !validDate(r.closed_date)) continue;
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
      closedAt: r.closed_date,
      source: 'repair_order',
    });
  }

  const addJobs = (rows: JobRow[], source: CompletedSource, requireFinishedStatus: boolean) => {
    for (const j of rows) {
      if (requireFinishedStatus && !isFinishedJobStatus(j.status)) continue;
      if (!validDate(j.closed_date)) continue;
      const key = (j.id ?? '').trim();
      if (!key || byKey.has(key)) continue;
      byKey.set(key, {
        key,
        jobCardId: key,
        roNumber: '',
        customerName: (j.customer ?? '').trim(),
        vehicle: (j.vehicle ?? '').trim(),
        technician: (j.technicians ?? []).join(', '),
        closedAt: j.closed_date,
        source,
      });
    }
  };
  // Everything in the archive was closed. Open job cards count only once marked finished.
  addJobs(closedJobs, 'closed_job', false);
  addJobs(jobCards, 'job_card', true);

  return [...byKey.values()].sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt));
}

/** Jobs completed within [startIso, endIso). */
export function completedBetween(jobs: CompletedJob[], startIso: string, endIso: string): CompletedJob[] {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  return jobs.filter(j => {
    const t = Date.parse(j.closedAt);
    return t >= start && t < end;
  });
}

export interface VehicleIdentity {
  id: string;
  label?: string | null;
  plate?: string | null;
  vin?: string | null;
}

/**
 * Every text a job might use for this vehicle: its label, plate or VIN, and the
 * "label #plate" shape the intake screens produce.
 */
export function vehicleKeys(v: VehicleIdentity): string[] {
  const label = normKey(v.label);
  const plate = normKey(v.plate);
  const vin = normKey(v.vin);
  return [...new Set([label, plate, vin, label && plate ? label + plate : '', label && plate ? plate + label : ''])]
    .filter(k => k.length >= 3);
}

/**
 * Completed jobs per vehicle id. A job attaches to a vehicle only when its
 * vehicle text equals a key that belongs to exactly ONE vehicle.
 */
export function jobsByVehicle(vehicles: VehicleIdentity[], jobs: CompletedJob[]): Map<string, CompletedJob[]> {
  const owners = new Map<string, Set<string>>();
  for (const v of vehicles) {
    for (const k of vehicleKeys(v)) {
      if (!owners.has(k)) owners.set(k, new Set());
      owners.get(k)!.add(v.id);
    }
  }

  const out = new Map<string, CompletedJob[]>();
  for (const job of jobs) {
    const k = normKey(job.vehicle);
    const ids = owners.get(k);
    if (!ids || ids.size !== 1) continue; // unknown or ambiguous: skip, never guess
    const id = [...ids][0];
    if (!out.has(id)) out.set(id, []);
    out.get(id)!.push(job);
  }
  return out;
}

/** The most recent completion in a list, or null. */
export function latestCompletion(jobs: CompletedJob[] | undefined): CompletedJob | null {
  if (!jobs || jobs.length === 0) return null;
  return jobs.reduce((best, j) => (Date.parse(j.closedAt) > Date.parse(best.closedAt) ? j : best));
}
