/**
 * Which of the caller's shops an API request acts for.
 *
 * Several intelligence routes picked it with
 *   shop_users ... .eq('user_id', uid).limit(1).maybeSingle()
 * — whichever membership row Postgres returned first. Harmless while most
 * people belonged to one shop. Since D1 Imports was merged into Location 2
 * every D1 user belongs to both, and that query could land on the archived
 * D1 Imports at random: a technician's vehicle timeline or an owner's customer
 * summary computed for a closed shop.
 *
 * The rule, in order:
 *   1. The shop the client names (`x-shop-id`), if the caller is a member of
 *      it with an allowed role. The header only chooses among the caller's own
 *      memberships; it cannot grant one.
 *   2. Otherwise the caller's first membership in a shop that is NOT archived,
 *      in a stable order (by shop id) so repeated calls agree.
 *   3. Otherwise an archived one — archiving must never lock anyone out
 *      (lib/shops/visibleShops.ts makes the same promise in the picker).
 */

export interface Membership {
  shop_id: string;
  role: string;
  archived?: boolean;
}

/** Pure rule, for tests. Returns null when the caller has no eligible membership. */
export function chooseRequestShop(
  requested: string | null | undefined,
  memberships: readonly Membership[],
  allowedRoles?: readonly string[],
): Membership | null {
  const eligible = memberships
    .filter(m => m?.shop_id && (!allowedRoles || allowedRoles.includes(m.role)))
    .slice()
    .sort((a, b) => a.shop_id.localeCompare(b.shop_id));
  if (!eligible.length) return null;
  if (requested) {
    const named = eligible.find(m => m.shop_id === requested);
    if (named) return named;
  }
  return eligible.find(m => !m.archived) ?? eligible[0];
}

interface Rows { data: Record<string, unknown>[] | null; error: unknown }

/**
 * Resolves the request's shop for `userId` through the caller's own client
 * (RLS applies). `requested` is usually `req.headers.get('x-shop-id')`.
 */
export async function resolveRequestShop(
  client: { from(table: string): unknown },
  userId: string,
  requested: string | null | undefined,
  allowedRoles?: readonly string[],
): Promise<Membership | null> {
  if (!userId) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (name: string) => client.from(name) as any;

  const su = (await t('shop_users').select('shop_id, role').eq('user_id', userId)) as Rows;
  const rows = (su.data ?? []).map(r => ({ shop_id: String(r.shop_id ?? ''), role: String(r.role ?? '') }));
  if (!rows.length) return null;

  // Archive state only orders the fallback; if it cannot be read, every shop
  // counts as active and the stable order still applies.
  let archived = new Set<string>();
  try {
    const sh = (await t('shops').select('id, archived_at').in('id', rows.map(r => r.shop_id))) as Rows;
    archived = new Set((sh.data ?? []).filter(r => r.archived_at).map(r => String(r.id ?? '')));
  } catch { /* ordering hint only */ }

  return chooseRequestShop(
    requested,
    rows.map(r => ({ ...r, archived: archived.has(r.shop_id) })),
    allowedRoles,
  );
}
