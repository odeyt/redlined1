/**
 * The Job Archive list: finished jobs from BOTH places they are kept.
 *
 * Closing a job card moves it from job_cards into closed_jobs and deletes the
 * original (services/jobCardService.ts closeJob), so an archive that read only
 * job_cards never showed a single job closed that way. Finished job cards still
 * in job_cards (marked Complete / Closed / Invoiced) are included too.
 *
 * A job id lives in one table; if an interrupted close left it in both, the
 * archived copy wins, so it is listed once.
 */

export type ArchiveSource = 'open' | 'closed';

export interface ArchiveRow {
  id: string;
  closed_date?: string | null;
  [key: string]: unknown;
}

export type SourcedArchiveRow<T extends ArchiveRow> = T & { source: ArchiveSource };

/** Statuses that mean a job card still in job_cards is finished. */
export const FINISHED_JOB_STATUSES = ['Complete', 'Closed', 'Invoiced'] as const;

export function mergeArchive<T extends ArchiveRow>(openRows: T[], closedRows: T[]): SourcedArchiveRow<T>[] {
  const byId = new Map<string, SourcedArchiveRow<T>>();
  for (const r of openRows) byId.set(String(r.id), { ...r, source: 'open' });
  for (const r of closedRows) byId.set(String(r.id), { ...r, source: 'closed' });
  const time = (r: ArchiveRow) => {
    const t = Date.parse(r.closed_date ?? '');
    return Number.isFinite(t) ? t : -Infinity; // undated last
  };
  return [...byId.values()].sort((a, b) => time(b) - time(a));
}
