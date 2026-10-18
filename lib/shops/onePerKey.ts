/**
 * One row per key, preferring the active shop's copy.
 *
 * Per-vehicle intelligence rows (profiles, timeline events) are stored under
 * the shop that computed them. A merged location's vehicles keep theirs under
 * the closed shop's id until they are recomputed for the shop that stays open;
 * after that, both copies exist. Reading across the merged scope (see
 * mergedScope.ts) therefore needs exactly one row per vehicle or source record,
 * and the active shop's — the fresher one — wins.
 *
 * Order is otherwise preserved: the first surviving row for each key stays in
 * the position its first occurrence had.
 */
export function onePerKey<T extends { shop_id?: string | null }>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  activeShopId: string,
): T[] {
  const chosen = new Map<string, { row: T; at: number }>();
  rows.forEach((row, at) => {
    const key = keyOf(row);
    const held = chosen.get(key);
    if (!held) { chosen.set(key, { row, at }); return; }
    if (held.row.shop_id !== activeShopId && row.shop_id === activeShopId) {
      chosen.set(key, { row, at: held.at });
    }
  });
  return [...chosen.values()].sort((a, b) => a.at - b.at).map(c => c.row);
}
