/**
 * lib/billing/checkoutEligibility.ts
 *
 * Which shop a checkout will bill, and whether this buyer is allowed to buy for it. Pure, so the rule is unit
 * tested on its own and app/api/billing/checkout/route.ts stays a thin orchestrator.
 *
 * The allowlist is imported from lib/billing/creemEvent.ts rather than restated, because the webhook enforces
 * the same rule after the money moves. If the two could drift, a buyer could pass checkout and then have the
 * payment held as `buyer_not_eligible` — charged, with nothing activated. One constant, one rule.
 *
 * The eligibility test mirrors resolveBuyerShop() in the webhook's shop_id branch exactly: EVERY membership row
 * for the pair must be eligible, so a stray technician row next to an owner row is refused in both places.
 */
import { BILLING_ELIGIBLE_ROLES } from './creemEvent';

export interface MembershipRow {
  shop_id: string | null;
  role: string | null;
}

export type BillingShopSelection =
  /** Bill this shop. `role` is the eligible role the choice rests on, for the log line. */
  | { kind: 'shop'; shopId: string; role: string }
  /** No membership anywhere. The caller provisions a shop, which makes the buyer its owner. */
  | { kind: 'no_membership' }
  /** Has memberships, but no shop whose every row is eligible. `roles` is what they actually hold. */
  | { kind: 'not_eligible'; roles: string[] };

/**
 * Pick the shop to bill, then judge the buyer's role in THAT shop.
 *
 * Rows are grouped by shop because eligibility is per shop: a technician in one shop who owns another may buy
 * for the one they own. A shop qualifies only if every row the buyer holds for it is eligible. Among qualifying
 * shops an `owner` row wins, otherwise the first in the order given — callers order the query so that repeated
 * requests from the same buyer resolve to the same shop.
 */
export function selectBillingShop(rows: readonly MembershipRow[]): BillingShopSelection {
  const byShop = new Map<string, string[]>();
  for (const row of rows) {
    const shopId = (row.shop_id ?? '').trim();
    if (!shopId) continue;
    const roles = byShop.get(shopId) ?? [];
    roles.push(String(row.role ?? '').trim());
    byShop.set(shopId, roles);
  }

  if (byShop.size === 0) return { kind: 'no_membership' };

  const eligible = [...byShop.entries()].filter(
    ([, roles]) => roles.length > 0 && roles.every(role => BILLING_ELIGIBLE_ROLES.has(role)),
  );

  if (eligible.length === 0) {
    // Sorted and de-duplicated so the refusal message is stable and names each role once.
    const roles = [...new Set([...byShop.values()].flat())].filter(Boolean).sort();
    return { kind: 'not_eligible', roles };
  }

  const owned = eligible.find(([, roles]) => roles.includes('owner'));
  const [shopId, roles] = owned ?? eligible[0];
  return { kind: 'shop', shopId, role: roles.includes('owner') ? 'owner' : roles[0] };
}
