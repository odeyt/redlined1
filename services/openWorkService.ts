import { supabase } from '@/lib/supabase';
import { getShopIds } from '@/lib/shopStore';
import {
  toOpenJobs, withJobCardTechnicians,
  type JobCardTechRow, type OpenJob, type OpenRoRow,
} from '@/lib/vehicles/liveStatus';

/**
 * Repair orders that are still open (not Complete, Closed or Void) in the
 * caller's shops: the record of what work is actually open right now.
 *
 * Each job also carries its job card's technicians, since staff assign
 * technicians on either one. Reading them is best effort: if it fails, the jobs
 * keep the repair order's technician and nothing else changes.
 *
 * Read-only. Throws on a database error reading the repair orders so the
 * caller can say so; an empty result is a real "nothing open", never a failure
 * hidden as zero.
 */
export async function fetchOpenWork(shopIds: string[] = getShopIds()): Promise<OpenJob[]> {
  if (shopIds.length === 0) return [];
  const { data, error } = await supabase
    .from('repair_orders')
    .select('id, ro_number, job_card_id, customer_name, vehicle, technician, status, opened_date')
    .in('shop_id', shopIds)
    .not('status', 'in', '("Complete","Closed","Void")');
  if (error) throw error;
  const jobs = toOpenJobs((data ?? []) as OpenRoRow[]);
  return withJobCardTechnicians(jobs, await fetchJobCardTechnicians(jobs, shopIds));
}

/** Technicians on the job cards of these jobs, by job card id and by RO number. Never throws. */
async function fetchJobCardTechnicians(jobs: OpenJob[], shopIds: string[]): Promise<JobCardTechRow[]> {
  const ids = [...new Set(jobs.map(j => j.jobCardId).filter(Boolean))];
  const roNumbers = [...new Set(jobs.map(j => j.roNumber).filter(Boolean))];
  try {
    const [byId, byRo] = await Promise.all([
      ids.length === 0 ? null
        : supabase.from('job_cards').select('id, ro, technicians').in('shop_id', shopIds).in('id', ids),
      roNumbers.length === 0 ? null
        : supabase.from('job_cards').select('id, ro, technicians').in('shop_id', shopIds).in('ro', roNumbers),
    ]);
    return [
      ...((byId && !byId.error ? byId.data : []) ?? []),
      ...((byRo && !byRo.error ? byRo.data : []) ?? []),
    ] as JobCardTechRow[];
  } catch {
    return [];
  }
}
