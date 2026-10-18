/**
 * The shops whose SOURCE records an intelligence engine reads for `shopId`.
 *
 * D1 Imports was closed and merged into Location 2 without moving a row
 * (supabase/migrations/2026-10-16_shop_merge.sql): it was archived and kept
 * mirrored in both directions. Lists, the dashboard and reports already read
 * its history (getShopIds / getReportShopIds in the browser). The intelligence
 * engines run per shop and read their source tables — invoices, job cards,
 * estimates, customers, vehicles — with `.eq('shop_id', shopId)`, so every
 * recommendation, signal and metric for Location 2 ignored D1's history.
 *
 * ## The rule
 *
 * A shop is folded in only when ALL of these hold:
 *   - `shopId` mirrors it (shop_mirrors shop_id -> mirror_shop_id),
 *   - it mirrors `shopId` back — the link is deliberate on both sides,
 *   - it is archived.
 *
 * A live second location stays separate, exactly as reports keep a per-location
 * picker for it. Only a closed location that was merged in widens the scope.
 *
 * ## What it is for, and what it is not
 *
 * Only reads of source business tables. Derived tables the engines write
 * (recommendations, signals, metrics, profiles, briefs, memory) stay keyed by
 * the active shop and are recomputed from the widened source data; reading the
 * merged shop's old derived rows as well would count its history twice.
 *
 * ## Tenancy
 *
 * The caller's own client does the lookups. On the service-role client the
 * mirror link plus the archive are the guard: a link can only be created by a
 * member of both shops (shop_mirrors insert policy) or by the platform. On a
 * user's client RLS applies to every read as usual.
 *
 * ## Fails closed
 *
 * Any error returns `[shopId]` — the behaviour before the merge, never a wider
 * one. Failures are not cached, so the next call retries.
 */

/** The query surface this needs, so tests can supply a plain stub. */
export interface ScopeDb {
  from(table: string): unknown;
}

interface Rows { data: Record<string, unknown>[] | null; error: { message?: string } | null }

const TTL_MS = 60_000;
const cache = new WeakMap<object, Map<string, { ids: string[]; at: number }>>();

/**
 * Pure rule, for tests: `shopId` first, then every shop that is mirrored in
 * both directions and archived, in a stable order.
 */
export function pickMergedShops(
  shopId: string,
  outgoing: readonly string[],
  incoming: readonly string[],
  archived: readonly string[],
): string[] {
  if (!shopId) return [];
  const back = new Set(incoming);
  const closed = new Set(archived);
  const merged = [...new Set(outgoing)]
    .filter(id => id && id !== shopId && back.has(id) && closed.has(id))
    .sort();
  return [shopId, ...merged];
}

async function rows(q: unknown): Promise<Rows> {
  return (await (q as PromiseLike<Rows>)) ?? { data: null, error: null };
}

/** `[shopId, ...merged shops]` for source-table reads. Never empty for a non-empty id. */
export async function mergedShopScope(db: ScopeDb, shopId: string): Promise<string[]> {
  if (!shopId) return [];
  const byShop = cache.get(db as object);
  const hit = byShop?.get(shopId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (name: string) => db.from(name) as any;

    const out = await rows(t('shop_mirrors').select('mirror_shop_id').eq('shop_id', shopId));
    if (out.error) throw new Error(out.error.message ?? 'shop_mirrors');
    const outgoing = (out.data ?? []).map(r => String(r.mirror_shop_id ?? '')).filter(Boolean);
    if (!outgoing.length) return remember(db, shopId, [shopId]);

    const inc = await rows(t('shop_mirrors').select('shop_id').eq('mirror_shop_id', shopId).in('shop_id', outgoing));
    if (inc.error) throw new Error(inc.error.message ?? 'shop_mirrors');
    const incoming = (inc.data ?? []).map(r => String(r.shop_id ?? '')).filter(Boolean);
    if (!incoming.length) return remember(db, shopId, [shopId]);

    const shops = await rows(t('shops').select('id, archived_at').in('id', incoming));
    if (shops.error) throw new Error(shops.error.message ?? 'shops');
    const archived = (shops.data ?? []).filter(r => r.archived_at).map(r => String(r.id ?? ''));

    return remember(db, shopId, pickMergedShops(shopId, outgoing, incoming, archived));
  } catch {
    return [shopId];
  }
}

function remember(db: ScopeDb, shopId: string, ids: string[]): string[] {
  let byShop = cache.get(db as object);
  if (!byShop) { byShop = new Map(); cache.set(db as object, byShop); }
  byShop.set(shopId, { ids, at: Date.now() });
  return ids;
}

/** Test hook: forget cached scopes. */
export function clearMergedScopeCache(db?: ScopeDb): void {
  if (db) cache.delete(db as object);
}
