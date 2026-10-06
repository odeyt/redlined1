import { supabase } from '@/lib/supabase';
import { getShopIds } from '@/lib/shopStore';
import { toOpenJobs, type OpenJob, type OpenRoRow } from '@/lib/vehicles/liveStatus';

/**
 * Repair orders that are still open (not Complete, Closed or Void) in the
 * caller's shops: the record of what work is actually open right now.
 *
 * Read-only. Throws on a database error so the caller can say so; an empty
 * result is a real "nothing open", never a failure hidden as zero.
 */
export async function fetchOpenWork(shopIds: string[] = getShopIds()): Promise<OpenJob[]> {
  if (shopIds.length === 0) return [];
  const { data, error } = await supabase
    .from('repair_orders')
    .select('id, ro_number, job_card_id, customer_name, vehicle, technician, status, opened_date')
    .in('shop_id', shopIds)
    .not('status', 'in', '("Complete","Closed","Void")');
  if (error) throw error;
  return toOpenJobs((data ?? []) as OpenRoRow[]);
}
