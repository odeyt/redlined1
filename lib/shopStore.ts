// Module-level singleton — initialized from localStorage so all services
// can call getShopId() without any prop drilling or React context.
let _shopId: string =
  typeof window !== 'undefined' ? (localStorage.getItem('activeShopId') ?? '') : '';

// Mirror shop IDs — other shops whose data should be visible in the active shop.
// Populated by useShop on mount from the shop_mirrors table.
let _mirrorShopIds: string[] = [];

export function getShopId(): string {
  return _shopId;
}

export function setShopId(id: string): void {
  _shopId = id;
  if (typeof window !== 'undefined') {
    localStorage.setItem('activeShopId', id);
  }
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
