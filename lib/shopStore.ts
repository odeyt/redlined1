// Module-level singleton — initialized from localStorage so all services
// can call getShopId() without any prop drilling or React context.
let _shopId: string =
  typeof window !== 'undefined' ? (localStorage.getItem('activeShopId') ?? '') : '';

// The user id the cached activeShopId belongs to. Without this, a shop id left
// in localStorage by a previous session is silently reused by the next account
// that logs in on the same browser — which made a shop-less trial user issue
// queries scoped to another shop. See assertShopOwner().
const OWNER_KEY = 'activeShopUserId';

// Mirror shop IDs — other shops whose data should be visible in the active shop.
// Populated by useShop on mount from the shop_mirrors table.
let _mirrorShopIds: string[] = [];

export function getShopId(): string {
  return _shopId;
}

export function setShopId(id: string, ownerUserId?: string): void {
  _shopId = id;
  if (typeof window !== 'undefined') {
    localStorage.setItem('activeShopId', id);
    if (ownerUserId) localStorage.setItem(OWNER_KEY, ownerUserId);
    else if (!id) localStorage.removeItem(OWNER_KEY);
  }
}

/**
 * Clears the cached shop id when it was stored by a different user.
 * Call this as early as possible after the session is known — before any
 * data fetch — so queries can never run scoped to another account's shop.
 * Returns true if a foreign cached shop was discarded.
 */
export function assertShopOwner(userId: string): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  const cachedOwner = localStorage.getItem(OWNER_KEY);
  if (_shopId && cachedOwner !== userId) {
    _shopId = '';
    _mirrorShopIds = [];
    localStorage.removeItem('activeShopId');
    localStorage.removeItem(OWNER_KEY);
    return true;
  }
  if (_shopId && !cachedOwner) localStorage.setItem(OWNER_KEY, userId);
  return false;
}

/** Returns the active shop ID plus any mirrored shop IDs. Use for SELECT queries. */
export function getShopIds(): string[] {
  const ids = [_shopId, ..._mirrorShopIds].filter(Boolean);
  return ids.length > 0 ? ids : [_shopId];
}

export function setMirrorShopIds(ids: string[]): void {
  _mirrorShopIds = ids;
}

export function getMirrorShopIds(): string[] {
  return _mirrorShopIds;
}
