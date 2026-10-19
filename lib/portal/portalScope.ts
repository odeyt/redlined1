/**
 * The shops whose documents a customer's portal link shows.
 *
 * The portal showed only documents in the customer's own shop. D1 Imports was
 * closed and merged into Location 2 without moving a row
 * (supabase/migrations/2026-10-16_shop_merge.sql): the old shop is archived and
 * mirrored to the active one in both directions. A returning D1 customer's
 * record stayed in the archived shop, but everything staff create for them now
 * — invoices, estimates, repair orders, a newly added vehicle — is in the
 * active shop. Their link showed none of it.
 *
 * ## The rule
 *
 * Start from the customer's own shop C. Another shop S is added only when:
 *   - C and S mirror each other in BOTH directions (shop_mirrors), and
 *   - exactly one of them is archived — i.e. one was merged into the other.
 *
 * So:
 *   - a customer of the closed shop also sees the active shop it was merged
 *     into (the case above);
 *   - a customer of the active shop also sees the closed shop merged into it
 *     (harmless: their own records only, by customer id);
 *   - two LIVE locations that merely mirror each other stay separate, as
 *     reports and the intelligence scope keep them (lib/shops/mergedScope.ts);
 *   - two archived shops never widen each other;
 *   - no other shop is ever reachable.
 *
 * Every portal query is still filtered by the customer's id as well, so a
 * wider shop list never shows another customer's records.
 *
 * ## Fails closed
 *
 * Any lookup error returns `[customerShopId]` — exactly the behaviour before
 * this change, never a wider one.
 */

export interface ScopeDb {
  from(table: string): unknown;
}

interface Rows { data: Record<string, unknown>[] | null; error: { message?: string } | null }

/** Pure rule, for tests: customer's shop first, then merge partners, stable order. */
export function pickPortalShops(
  customerShopId: string,
  outgoing: readonly string[],
  incoming: readonly string[],
  archived: readonly string[],
): string[] {
  if (!customerShopId) return [];
  const back = new Set(incoming);
  const closed = new Set(archived);
  const selfClosed = closed.has(customerShopId);
  const partners = [...new Set(outgoing)]
    .filter(id => id && id !== customerShopId && back.has(id) && closed.has(id) !== selfClosed)
    .sort();
  return [customerShopId, ...partners];
}

async function rows(q: unknown): Promise<Rows> {
  return (await (q as PromiseLike<Rows>)) ?? { data: null, error: null };
}

/** `[customerShopId, ...merge partners]`. Never empty for a non-empty id. */
export async function portalShopScope(db: ScopeDb, customerShopId: string): Promise<string[]> {
  if (!customerShopId) return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (name: string) => db.from(name) as any;

    const out = await rows(t('shop_mirrors').select('mirror_shop_id').eq('shop_id', customerShopId));
    if (out.error) throw new Error(out.error.message ?? 'shop_mirrors');
    const outgoing = (out.data ?? []).map(r => String(r.mirror_shop_id ?? '')).filter(Boolean);
    if (!outgoing.length) return [customerShopId];

    const inc = await rows(t('shop_mirrors').select('shop_id').eq('mirror_shop_id', customerShopId).in('shop_id', outgoing));
    if (inc.error) throw new Error(inc.error.message ?? 'shop_mirrors');
    const incoming = (inc.data ?? []).map(r => String(r.shop_id ?? '')).filter(Boolean);
    if (!incoming.length) return [customerShopId];

    const shops = await rows(t('shops').select('id, archived_at').in('id', [customerShopId, ...incoming]));
    if (shops.error) throw new Error(shops.error.message ?? 'shops');
    const archived = (shops.data ?? []).filter(r => r.archived_at).map(r => String(r.id ?? ''));

    return pickPortalShops(customerShopId, outgoing, incoming, archived);
  } catch {
    return [customerShopId];
  }
}
