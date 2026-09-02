/**
 * Which of a user's shops belong in the picker.
 *
 * One rule, and it is the whole reason this is a function rather than a
 * `.filter()` at the call site:
 *
 *   ARCHIVING SOMEONE'S ONLY SHOP MUST NOT LOCK THEM OUT.
 *
 * `useShop` treats an empty shop list as "this account has no shop": it falls
 * through to provisioning, and a user whose active shop is missing from the
 * list is moved to `list[0]` and the page is reloaded. So a naive
 * `filter(s => !s.archived_at)` turns archiving a solo operator's shop into
 * locking them out of the app, on a reload loop, with nothing on screen saying
 * why.
 *
 * Archiving is an operator's tidying action. It must never be able to take
 * away someone's access, so when the filter would empty the list, the
 * unfiltered list wins.
 */

export interface ArchivableShop {
  id: string;
  name: string;
  archived_at?: string | null;
}

/**
 * The shops to show, given everything the user belongs to.
 *
 * Returns the SAME array when nothing is archived — the common case — so no
 * caller re-renders for an unchanged list.
 */
export function visibleShops<T extends ArchivableShop>(all: readonly T[] | null | undefined): T[] {
  const list = all ?? [];
  const active = list.filter(s => !s?.archived_at);

  // The rule. An archived-only account still gets in.
  if (active.length === 0) return [...list];

  return active.length === list.length ? [...list] : active;
}

/**
 * Whether a shop the user is currently working in has been archived out from
 * under them.
 *
 * Callers use this to move someone off an archived shop rather than leaving
 * them on one that no longer appears in their own picker.
 */
export function activeShopWasArchived(
  currentShopId: string,
  all: readonly ArchivableShop[] | null | undefined,
): boolean {
  if (!currentShopId) return false;
  const current = (all ?? []).find(s => s?.id === currentShopId);
  if (!current?.archived_at) return false;
  // Only if there is somewhere else to go. Moving them off their only shop
  // would be the lockout this module exists to prevent.
  return (all ?? []).some(s => s?.id !== currentShopId && !s?.archived_at);
}
