import { getShopId } from '@/lib/shopStore';

/**
 * Headers every feature-flag request must carry: the active shop.
 *
 * /api/feature-flags decides who you are in a shop (owner, manager, …) by
 * looking up YOUR membership in the shop this header names. It used to be
 * sent by nobody, and no `shopId` cookie exists either, so every request was
 * evaluated for shop '' — no membership, role ''. Two consequences:
 *
 *   - Settings → Feature Flags told every owner "Owner access required";
 *   - shop-, role- and user-scoped flags never applied, only global ones.
 *
 * The header only chooses WHICH of the caller's own memberships is read; the
 * server still filters by the signed-in user, so it cannot grant a role the
 * caller does not hold.
 */
export function flagRequestHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const shopId = getShopId();
  return { ...(shopId ? { 'x-shop-id': shopId } : {}), ...extra };
}

/** Fired by setShopId when the active shop changes, so flags re-evaluate. */
export const ACTIVE_SHOP_CHANGED_EVENT = 'active-shop-changed';
