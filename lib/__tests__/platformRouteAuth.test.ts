/**
 * Operator APIs must check platform ownership, not a shop role.
 *
 * Two routes serving platform internals authorised against shop membership:
 *
 *   /api/test-results     gated on profiles.role === 'owner'
 *   /api/disaster-recovery gated on shop_users role owner/admin, then FELL BACK
 *                          to allowing any authenticated shop member
 *
 * "Owner" of a garage is not "operator of this SaaS". The consequences ran
 * both ways: customers could read deployment ids, git commits, migration
 * history and environment-variable checks, while the actual platform owner was
 * refused their own Testing Dashboard — profiles.role reads 'Technician' for
 * 10 of 11 accounts, theirs included.
 *
 * lib/adminAuth.verifyPlatformOwner already existed and is what the admin
 * routes use: PLATFORM_OWNER_EMAIL, server-side only, comma-separated,
 * accepting a bearer token or a cookie session.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const ROUTES = [
  'app/api/test-results/route.ts',
  'app/api/disaster-recovery/route.ts',
];

describe.each(ROUTES)('%s', route => {
  const src = read(route);

  it('authorises with verifyPlatformOwner', () => {
    expect(src).toMatch(/verifyPlatformOwner\(req\)/);
  });

  it('does not authorise on a shop role', () => {
    expect(src).not.toMatch(/role !== 'owner'/);
    expect(src).not.toMatch(/\.in\('role', \['owner', 'admin'\]\)/);
  });

  it('does not read profiles.role', () => {
    expect(src).not.toMatch(/from\('profiles'\)[\s\S]{0,80}select\('role'\)/);
  });

  it('refuses anonymous callers with 401 and authenticated non-owners with 403', () => {
    expect(src).toMatch(/status:\s*401/);
    expect(src).toMatch(/forbidden\(/);
  });
});

describe('disaster-recovery specifically', () => {
  const src = read('app/api/disaster-recovery/route.ts');

  it('no longer falls back to any authenticated shop member', () => {
    // The fallback is what made every customer able to read deployment internals.
    expect(src).not.toMatch(/anyShopUser/);
    expect(src).not.toMatch(/allow any authenticated shop member/);
  });
});

describe('the shared guard is the one the admin routes use', () => {
  const adminAuth = read('lib/adminAuth.ts');

  it('reads PLATFORM_OWNER_EMAIL, not a database role', () => {
    expect(adminAuth).toMatch(/process\.env\.PLATFORM_OWNER_EMAIL/);
  });

  it('supports several owners, comma-separated', () => {
    expect(adminAuth).toMatch(/split\(','\)/);
  });

  it('refuses everyone when the variable is unset, rather than defaulting open', () => {
    expect(adminAuth).toMatch(/authorized\.size === 0/);
  });
});
