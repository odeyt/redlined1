// Module-level singleton — initialized from localStorage so all services
// can call getShopId() without any prop drilling or React context.
let _shopId: string =
  typeof window !== 'undefined' ? (localStorage.getItem('activeShopId') ?? '') : '';

export function getShopId(): string {
  return _shopId;
}

export function setShopId(id: string): void {
  _shopId = id;
  if (typeof window !== 'undefined') {
    localStorage.setItem('activeShopId', id);
  }
}
