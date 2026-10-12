/**
 * Round-up-to-10 is D1 Imports' house rule, not every shop's.
 *
 * Reported 2026-10-10 by a customer shop: estimates and invoices on the staff
 * side showed every amount rounded UP to the nearest 10, while the customer
 * portal showed the exact figure. formatMoney applied D1's rule to all shops.
 */
import { formatMoney } from '../invoiceService';
import { setShopId } from '@/lib/shopStore';

const D1_SHOP_1 = '38d55fae-741b-4bac-b520-f96eed65bf38';
const D1_SHOP_2 = '90b72748-bf01-4456-999f-f4ba48091606';
const CUSTOMER_SHOP = '11111111-2222-3333-4444-555555555555';

const norm = (s: string) => s.replace(/[  \s]/g, '');

afterEach(() => setShopId(''));

describe('formatMoney rounding', () => {
  it('shows a customer shop the exact amount, cents included', () => {
    setShopId(CUSTOMER_SHOP);
    expect(norm(formatMoney(123.45, 'USD'))).toBe('$123.45');
    expect(norm(formatMoney(121, 'USD'))).toBe('$121.00');
  });

  it('shows the exact amount when no shop is active', () => {
    expect(norm(formatMoney(123.45, 'USD'))).toBe('$123.45');
  });

  it('keeps D1 Imports rounding up to the nearest 10 at both locations', () => {
    for (const id of [D1_SHOP_1, D1_SHOP_2]) {
      setShopId(id);
      expect(norm(formatMoney(123.45, 'USD'))).toBe('$130');
      expect(norm(formatMoney(120, 'USD'))).toBe('$120');
    }
  });
});
