/**
 * The cached active shop must survive a logout by the SAME user, but never be
 * inherited by a DIFFERENT user.
 *
 * Both halves matter and they pull in opposite directions:
 *  - Clearing too eagerly (what signOut used to do) sends a multi-shop user
 *    back to shops[0] on next login. A D1 user working in "Location 2"
 *    (167 parts) landed in "D1 Imports" (8 parts) and their edits looked lost.
 *  - Not clearing at all lets the next account on a shared browser start out
 *    scoped to the previous account's shop — the original leak this guarded.
 */

// Minimal localStorage/window stub. shopStore only needs these two, so this
// avoids pulling in jest-environment-jsdom purely for one suite.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

const storage = new MemoryStorage();
(globalThis as unknown as { window: unknown }).window = { localStorage: storage };
(globalThis as unknown as { localStorage: unknown }).localStorage = storage;

const USER_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const SHOP_LOCATION_2 = '90b72748-bf01-4456-999f-f4ba48091606';

function freshStore() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../shopStore') as typeof import('../shopStore');
}

beforeEach(() => {
  storage.clear();
});

describe('assertShopOwner', () => {
  it('keeps the shop when the same user returns after signing out', () => {
    let store = freshStore();
    store.setShopId(SHOP_LOCATION_2, USER_A);

    // signOut deliberately leaves localStorage alone; a new page load re-reads it.
    store = freshStore();
    const discarded = store.assertShopOwner(USER_A);

    expect(discarded).toBe(false);
    expect(store.getShopId()).toBe(SHOP_LOCATION_2);
  });

  it('discards the shop when a different user signs in', () => {
    let store = freshStore();
    store.setShopId(SHOP_LOCATION_2, USER_A);

    store = freshStore();
    const discarded = store.assertShopOwner(USER_B);

    expect(discarded).toBe(true);
    expect(store.getShopId()).toBe('');
    expect(storage.getItem('activeShopId')).toBeNull();
  });

  it('adopts an unattributed shop id for the current user rather than dropping it', () => {
    // A shop id cached before ownership tracking existed has no owner recorded.
    // Dropping it would bounce existing users to shops[0] once on upgrade.
    storage.setItem('activeShopId', SHOP_LOCATION_2);
    const store = freshStore();

    const discarded = store.assertShopOwner(USER_A);

    expect(discarded).toBe(false);
    expect(store.getShopId()).toBe(SHOP_LOCATION_2);
    expect(storage.getItem('activeShopUserId')).toBe(USER_A);
  });

  it('is a no-op when no shop is cached', () => {
    const store = freshStore();
    expect(store.assertShopOwner(USER_A)).toBe(false);
    expect(store.getShopId()).toBe('');
  });

  it('clears mirror ids along with a foreign shop', () => {
    let store = freshStore();
    store.setShopId(SHOP_LOCATION_2, USER_A);
    store.setMirrorShopIds(['some-mirror-shop']);

    store = freshStore();
    store.setMirrorShopIds(['some-mirror-shop']);
    store.assertShopOwner(USER_B);

    expect(store.getMirrorShopIds()).toEqual([]);
  });
});

describe('getShopIds', () => {
  it('includes mirrors alongside the active shop', () => {
    const store = freshStore();
    store.setShopId(SHOP_LOCATION_2, USER_A);
    store.setMirrorShopIds(['mirror-1']);
    expect(store.getShopIds()).toEqual([SHOP_LOCATION_2, 'mirror-1']);
  });

  it('never returns an empty list, so queries stay scoped rather than unfiltered', () => {
    const store = freshStore();
    expect(store.getShopIds()).toEqual(['']);
  });
});
