'use client';

/**
 * Opens the record a tapped notification asked for, once its list has loaded.
 *
 * Every module that receives alerts has the same shape — a list fetched on
 * mount and a `selected` record driving a detail pane — so this is one hook
 * rather than the same effect copied into six views, where five of them would
 * drift.
 *
 * Keyed on the list, not on mount: the target has to be found in data that
 * arrives after the screen does. The focus is claimed exactly once (see
 * alertFocus), so a refetch or a re-render cannot reopen a pane somebody has
 * just closed.
 *
 * When the id is not in the list, that is worth saying. A technician tapping
 * an alert and landing on an unexplained list has learned that alerts do not
 * work; the usual cause is mundane — the record belongs to the other shop, or
 * a filter is hiding it.
 */
import { useEffect } from 'react';
import { consumeAlertFocus } from './alertFocus';

export function useAlertFocus<T>(
  entityType: string,
  items: readonly T[],
  idOf: (item: T) => string | null | undefined,
  select: (item: T) => void,
  onMissing?: (id: string) => void,
): void {
  useEffect(() => {
    if (items.length === 0) return;
    const id = consumeAlertFocus(entityType);
    if (!id) return;
    const match = items.find(item => idOf(item) === id);
    if (match) select(match);
    else onMissing?.(id);
    // Intentionally only the list: idOf/select/onMissing are inline closures
    // at every call site, so including them would re-run this on every render
    // — and consumeAlertFocus has already cleared the target by then, making
    // the extra runs no-ops that only obscure the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
}
