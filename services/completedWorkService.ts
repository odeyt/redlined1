import { supabase } from '@/lib/supabase';
import { getShopIds } from '@/lib/shopStore';
import { mergeCompletedJobs, type CompletedJob, type RoRow, type JobRow } from '@/lib/vehicles/completedWork';

/**
 * Jobs completed between two instants, from every place completion is recorded:
 * signed-off repair orders, the closed-job archive, and open job cards already
 * marked finished. Merged so a job that exists in several of them counts once.
 *
 * Read-only. Scoped to the caller's shops (both locations unless narrowed by
 * `shopIds`). Throws on a database error so the caller can say so; an empty
 * result is a real "nothing completed", not a failure hidden as zero.
 */
export async function fetchCompletedWork(
  startIso: string,
  endIso: string,
  shopIds: string[] = getShopIds(),
): Promise<CompletedJob[]> {
  if (shopIds.length === 0) return [];

  const [ros, closed, cards] = await Promise.all([
    supabase.from('repair_orders')
      .select('id, ro_number, job_card_id, customer_name, vehicle, technician, status, closed_date')
      .in('shop_id', shopIds).in('status', ['Complete', 'Closed'])
      .gte('closed_date', startIso).lt('closed_date', endIso),
    supabase.from('closed_jobs')
      .select('id, customer, vehicle, technicians, status, closed_date')
      .in('shop_id', shopIds)
      .gte('closed_date', startIso).lt('closed_date', endIso),
    supabase.from('job_cards')
      .select('id, customer, vehicle, technicians, status, closed_date')
      .in('shop_id', shopIds)
      .gte('closed_date', startIso).lt('closed_date', endIso),
  ]);
  if (ros.error) throw ros.error;
  if (closed.error) throw closed.error;
  if (cards.error) throw cards.error;

  return mergeCompletedJobs(
    (ros.data ?? []) as RoRow[],
    (closed.data ?? []) as JobRow[],
    (cards.data ?? []) as JobRow[],
  );
}
