import { INTERNAL_SHOP_IDS, getPlanOrFree } from '@/lib/entitlements/planRegistry';
import { getAdminDb } from '@/lib/supabaseServer';

export type PhotoEntityType = 'vehicle' | 'entity' | 'part';

export interface PhotoLimitResult {
  count: number;
  limit: number | null;
  canUpload: boolean;
  /** True when only 1 slot remains — show a warning */
  nearLimit: boolean;
  remaining: number | null;
}

export async function getPhotoLimit(
  shopId: string,
  type: PhotoEntityType,
  entityId: string,
): Promise<PhotoLimitResult> {
  if (INTERNAL_SHOP_IDS.has(shopId)) {
    return { count: 0, limit: null, canUpload: true, nearLimit: false, remaining: null };
  }

  const supabase = getAdminDb();

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_key')
    .eq('shop_id', shopId)
    .maybeSingle();

  const plan = getPlanOrFree(sub?.plan_key);

  const limit =
    type === 'vehicle' ? plan.limits.vehiclePhotosMax
    : type === 'part'  ? plan.limits.partPhotosMax
    :                    plan.limits.entityPhotosMax;

  let count = 0;
  if (type === 'vehicle') {
    const { count: c } = await supabase
      .from('vehicle_images')
      .select('*', { count: 'exact', head: true })
      .eq('vehicle_id', entityId);
    count = c ?? 0;
  } else if (type === 'entity') {
    const { count: c } = await supabase
      .from('entity_images')
      .select('*', { count: 'exact', head: true })
      .eq('entity_id', entityId);
    count = c ?? 0;
  }
  // 'part' photos are stored as a text[] array on the parts row — count resolved at call site

  if (limit === null) {
    return { count, limit: null, canUpload: true, nearLimit: false, remaining: null };
  }

  const remaining = Math.max(0, limit - count);
  return {
    count,
    limit,
    canUpload: count < limit,
    nearLimit: remaining === 1,
    remaining,
  };
}
