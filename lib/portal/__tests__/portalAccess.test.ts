/**
 * What the customer portal opens to signed-out visitors, and what it does not.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isWellFormedPortalToken } from '../portalToken';
import { isCustomerPortalPath } from '../../../proxy';

// proxy.ts imports @supabase/ssr; only the path predicate is under test.
jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn() }));

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('proxy: customer portal paths', () => {
  it('opens the portal page and the exact estimate-action route', () => {
    expect(isCustomerPortalPath('/portal/' + 'a'.repeat(64))).toBe(true);
    expect(isCustomerPortalPath('/portal/anything')).toBe(true); // shows the portal's own not-found
    expect(isCustomerPortalPath('/portal/abc/')).toBe(true);
    expect(isCustomerPortalPath('/api/portal/estimate-action')).toBe(true);
  });

  it('keeps sibling and look-alike paths gated', () => {
    for (const p of [
      '/portal', '/portal/', '/portal/abc/extra', '/portals/abc', '/portalx/abc',
      '/api/portal', '/api/portal/', '/api/portal/estimate-action/x', '/api/portal/other',
      '/api/portal/estimate-actionx', '/api/customers/portal-link',
      '/status/abc', '/inspection/abc', '/api/inspection-approve', '/api/job-status',
      '/', '/customers', '/settings',
    ]) {
      expect([p, isCustomerPortalPath(p)]).toEqual([p, false]);
    }
  });

  it('answers portal paths before any session handling, with no-store headers', () => {
    const src = read('proxy.ts');
    const fn = src.slice(src.indexOf('export async function proxy'));
    expect(fn.indexOf('isCustomerPortalPath(')).toBeLessThan(fn.indexOf('createServerClient('));
    expect(src).toMatch(/'Cache-Control', 'private, no-store'/);
    expect(src).toMatch(/'Referrer-Policy', 'no-referrer'/);
    // The general prefix list did not grow to include portal or share routes.
    const list = src.slice(src.indexOf('const PUBLIC_PATHS'), src.indexOf('];', src.indexOf('const PUBLIC_PATHS')));
    expect(list).not.toMatch(/'\/portal|'\/api\/portal|'\/status|'\/inspection/);
  });
});

describe('portal token shape', () => {
  it('accepts only the 64 lowercase hex characters the migration issues', () => {
    expect(isWellFormedPortalToken('0123456789abcdef'.repeat(4))).toBe(true);
    for (const bad of ['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), null, undefined, 42, {}]) {
      expect(isWellFormedPortalToken(bad)).toBe(false);
    }
  });
});

describe('portal page scoping', () => {
  // The queries live in the loader (run for real in loadPortal.test.ts);
  // the page owns caching and indexing.
  const page = read('app/portal/[token]/page.tsx');
  const loader = read('lib/portal/loadPortal.ts');

  it('resolves the token through the token table, not a customers column', () => {
    expect(loader).toMatch(/resolvePortalCustomer\(sb, token\)/);
    expect(loader + page).not.toMatch(/portal_token/);
  });

  it('filters every customer document by customer AND shop', () => {
    for (const table of ['vehicles', 'invoices', 'estimates', 'inspections', 'repair_orders']) {
      const re = new RegExp(`from\\('${table}'\\)[^\\n]*\\.eq\\('customer_id', customerId\\)\\.eq\\('shop_id', shopId\\)`);
      expect([table, re.test(loader)]).toEqual([table, true]);
    }
    expect(loader).toMatch(/from\('payments'\)[^\n]*\.in\('invoice_number', invoiceNumbers\)\.eq\('shop_id', shopId\)/);
  });

  it('is never cached or indexed, and never selects a VIN', () => {
    expect(page).toMatch(/export const dynamic = 'force-dynamic'/);
    expect(page).toMatch(/robots: \{ index: false/);
    expect(loader + page).not.toMatch(/\bvin\b/);
  });
});

describe('staff portal link', () => {
  it('is fetched per customer from a role-checked route, not read from list data', () => {
    const route = read('app/api/customers/portal-link/route.ts');
    const view = read('features/customers/CustomersView.tsx');
    expect(route).toMatch(/requireShopRole\(req, body\.shopId, LINK_ROLES\)/);
    expect(route).toMatch(/requireShopRole\(req, customer\.shop_id, LINK_ROLES\)/);
    expect(view).toMatch(/authedFetch\('\/api\/customers\/portal-link'/);
    expect(view).not.toMatch(/selected\.portalToken/);
  });
});
