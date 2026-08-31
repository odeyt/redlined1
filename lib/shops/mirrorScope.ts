import 'server-only';

/**
 * Which shops a request may READ on behalf of, derived server-side.
 *
 * ## The mismatch this exists to close
 *
 * `lib/shopStore.ts` has had two accessors for a long time: `getShopId()` for
 * the active shop and `getShopIds()` for the active shop plus its mirrors.
 * Both live in the BROWSER — a module singleton `useShop` fills on mount — so
 * an API route cannot call either.
 *
 * The result was a split the app never reconciled. The vehicle picker lists
 * vehicles with `getShopIds()`, so on a mirrored two-location account it
 * offers cars from both branches. Every parts endpoint then scoped its vehicle
 * read to the single `shopId` in the request body. So the picker offered a
 * vehicle the parts path structurally could not match, and the technician got
 * "No matching parts found" for a car sitting in the other branch.
 *
 * The fix is not to narrow the picker. `services/vehicleService.ts` already
 * treats mirrored vehicles as fully readable AND writable — `.in('shop_id',
 * getShopIds())` guards its update, delete and reassign paths, and only
 * `insert` pins to the active shop. Mirroring is a shipped, deliberate
 * feature. The parts path was simply never taught about it.
 *
 * So the scope is derived HERE, on the server, from the same table the
 * browser reads.
 *
 * ## Why membership is re-checked, and why that is not paranoia
 *
 * `shop_mirrors` is a SHOP-level link: shop A mirrors shop B. It says nothing
 * about which PEOPLE may cross it.
 *
 * The RLS policy added in `2026-07-31_shop_mirrors_read_access.sql` is
 * explicit that the link alone is not enough — it requires the caller to be a
 * member of both sides, with the comment "without the second condition a user
 * could discover, and then read through, a link pointing at a tenant they are
 * not a member of".
 *
 * Everything in this file runs as `service_role`, which bypasses RLS entirely.
 * So that policy protects the browser's read and has nothing whatsoever to say
 * about this one. The both-sides rule is re-implemented here because here it
 * is the only thing enforcing it.
 *
 * Concretely: a service advisor who belongs to Location 1 but NOT Location 2
 * gets `[location1]` even though the shops mirror each other. They see exactly
 * what the picker would have shown them, because the picker's read went
 * through the policy that says the same thing.
 *
 * ## Fails closed
 *
 * Any error returns the active shop alone. A widened scope is a tenancy
 * decision and must never be the consequence of a failed query — the failure
 * mode of "the mirror lookup broke" is the behaviour we had before mirroring,
 * not the behaviour we had before tenancy.
 */
import { getAdminDb } from '@/lib/supabaseServer';
import { logger } from '@/lib/logger';

/**
 * The shop ids `userId` may read through while working in `activeShopId`.
 *
 * The active shop is ALWAYS first and always present, so callers can treat
 * `[0]` as the active shop and the whole array as the read scope.
 *
 * The caller must already have verified that the user is a member of
 * `activeShopId`. This function widens an authorised scope; it does not
 * establish one, and passing a shop the user does not belong to returns that
 * shop unchanged rather than refusing.
 */
export async function readableShopIds(
  userId: string,
  activeShopId: string,
): Promise<string[]> {
  if (!userId || !activeShopId) return activeShopId ? [activeShopId] : [];

  try {
    const db = getAdminDb();

    // Directional, exactly as the browser reads it: the rows for D1 Imports
    // and Location 2 are configured in both directions independently, and a
    // one-way link is a real configuration this must not silently symmetrise.
    const { data: links, error: linkErr } = await db
      .from('shop_mirrors')
      .select('mirror_shop_id')
      .eq('shop_id', activeShopId);

    if (linkErr) throw new Error(linkErr.message);

    const linked = (links ?? [])
      .map(r => String((r as { mirror_shop_id?: unknown }).mirror_shop_id ?? ''))
      .filter(id => id && id !== activeShopId);

    if (!linked.length) return [activeShopId];

    // The both-sides check. Filtering the LINKED ids by the user's own
    // memberships, rather than trusting the link, is the whole point.
    const { data: memberships, error: memberErr } = await db
      .from('shop_users')
      .select('shop_id')
      .eq('user_id', userId)
      .in('shop_id', linked);

    if (memberErr) throw new Error(memberErr.message);

    const permitted = new Set(
      (memberships ?? []).map(r => String((r as { shop_id?: unknown }).shop_id ?? '')),
    );

    // Deterministic order so a cache key or a log line built from this scope
    // is stable across requests.
    const mirrors = linked.filter(id => permitted.has(id)).sort();

    if (mirrors.length < linked.length) {
      // Worth seeing: it means a mirror link exists that this user cannot
      // cross. Expected for a single-location technician, surprising for an
      // owner, and it is the difference between "mirroring is off" and
      // "mirroring is on but not for you".
      logger.info('shop_mirror_scope_narrowed_by_membership', {
        shopId: activeShopId,
        linked: linked.length,
        permitted: mirrors.length,
      });
    }

    return [activeShopId, ...mirrors];
  } catch (err) {
    logger.warn('shop_mirror_scope_failed', {
      shopId: activeShopId,
      reason: err instanceof Error ? err.message.slice(0, 80) : 'unknown',
    });
    return [activeShopId];
  }
}
