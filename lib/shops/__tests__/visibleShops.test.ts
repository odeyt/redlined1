/**
 * The shop picker's archive rule, EXECUTED.
 *
 * The interesting case is not "hide archived shops" — it is the one where
 * hiding them would lock somebody out of the application entirely, on a
 * reload loop, with nothing on screen explaining it.
 */
import { visibleShops, activeShopWasArchived } from '../visibleShops';

const active = (id: string, name = id) => ({ id, name, archived_at: null });
const archived = (id: string, name = id) => ({ id, name, archived_at: '2026-09-01T00:00:00Z' });

describe('archived shops leave the picker', () => {
  it('hides one archived shop among several', () => {
    const list = [active('a'), archived('b'), active('c')];
    expect(visibleShops(list).map(s => s.id)).toEqual(['a', 'c']);
  });

  it('leaves an all-active list alone', () => {
    const list = [active('a'), active('b')];
    expect(visibleShops(list).map(s => s.id)).toEqual(['a', 'b']);
  });

  it('treats a missing archived_at as active', () => {
    // Rows written before the column existed have no value at all.
    const list = [{ id: 'a', name: 'A' }, archived('b')];
    expect(visibleShops(list).map(s => s.id)).toEqual(['a']);
  });
});

describe('archiving cannot lock a user out', () => {
  /**
   * THE rule this module exists for.
   *
   * `useShop` reads an empty shop list as "this account has no shop": it falls
   * through to provisioning, and an active shop that is missing from the list
   * sends the user to list[0] and reloads the page. So filtering an
   * archived-only account down to nothing turns an operator's tidying action
   * into a lockout on a reload loop.
   */
  it('still returns the shop when the user has only one and it is archived', () => {
    const list = [archived('solo')];
    expect(visibleShops(list).map(s => s.id)).toEqual(['solo']);
  });

  it('still returns everything when every shop the user has is archived', () => {
    const list = [archived('a'), archived('b')];
    expect(visibleShops(list).map(s => s.id)).toEqual(['a', 'b']);
  });

  it('never returns an empty list from a non-empty one', () => {
    // Stated as the invariant rather than as three examples of it.
    for (const list of [
      [archived('a')],
      [archived('a'), archived('b')],
      [active('a')],
      [active('a'), archived('b')],
    ]) {
      expect(visibleShops(list).length).toBeGreaterThan(0);
    }
  });

  it('returns an empty list only when there was nothing to begin with', () => {
    expect(visibleShops([])).toEqual([]);
    expect(visibleShops(null)).toEqual([]);
    expect(visibleShops(undefined)).toEqual([]);
  });
});

describe('moving a user off a shop archived under them', () => {
  it('reports true when they have somewhere else to go', () => {
    const list = [archived('a'), active('b')];
    expect(activeShopWasArchived('a', list)).toBe(true);
  });

  it('reports false when the archived shop is the only one', () => {
    // Moving them off it would be the lockout, by another route.
    expect(activeShopWasArchived('solo', [archived('solo')])).toBe(false);
  });

  it('reports false when every alternative is also archived', () => {
    expect(activeShopWasArchived('a', [archived('a'), archived('b')])).toBe(false);
  });

  it('reports false for a shop that is not archived', () => {
    expect(activeShopWasArchived('a', [active('a'), active('b')])).toBe(false);
  });

  it('survives an unknown or empty current shop', () => {
    expect(activeShopWasArchived('', [active('a')])).toBe(false);
    expect(activeShopWasArchived('missing', [active('a')])).toBe(false);
    expect(activeShopWasArchived('a', null)).toBe(false);
  });
});
