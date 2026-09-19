/**
 * /admin/billing-health and /admin/sapelee must use the one shared,
 * fail-closed platform-owner guard (requirePlatformOwnerPage) — not an inline
 * copy with a hardcoded fallback owner email. All emails below are synthetic.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const mockGetUser = jest.fn();

jest.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }));
jest.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
}));
jest.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: mockGetUser } }) }));
jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: () => ({}) }));
jest.mock('@/features/admin/billing-health/BillingHealthDashboard', () => ({ BillingHealthDashboard: () => null }));
jest.mock('@/features/admin/sapelee/SapeleeOutboxDashboard', () => ({ SapeleeOutboxDashboard: () => null }));

const PAGES = [
  { file: 'app/admin/billing-health/page.tsx', load: () => import('../../app/admin/billing-health/page') },
  { file: 'app/admin/sapelee/page.tsx', load: () => import('../../app/admin/sapelee/page') },
];

const originalEnv = process.env.PLATFORM_OWNER_EMAIL;
afterEach(() => {
  if (originalEnv === undefined) delete process.env.PLATFORM_OWNER_EMAIL;
  else process.env.PLATFORM_OWNER_EMAIL = originalEnv;
  mockGetUser.mockReset();
});

const signedInAs = (email: string | null) =>
  mockGetUser.mockResolvedValue({ data: { user: email ? { email } : null } });

describe.each(PAGES)('$file — source', ({ file }) => {
  const src = read(file);

  it('uses the shared guard from lib/adminAuth', () => {
    expect(src).toMatch(/import\s*{[^}]*requirePlatformOwnerPage[^}]*}\s*from\s*'@\/lib\/adminAuth'/);
    expect(src).toMatch(/await requirePlatformOwnerPage\(\)/);
  });

  it('contains no hardcoded fallback owner email, and no email literal at all', () => {
    expect(src).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
    expect(src).not.toMatch(/PLATFORM_OWNER_EMAIL\s*(\?\?|\|\|)/);
  });

  it('does not run its own copy of the session/owner check', () => {
    expect(src).not.toMatch(/createServerClient/);
    expect(src).not.toMatch(/process\.env\.PLATFORM_OWNER_EMAIL/);
    expect(src).not.toMatch(/ownerEmails/);
  });

  it('stays dynamic and non-indexable', () => {
    expect(src).toMatch(/dynamic = 'force-dynamic'/);
    expect(src).toMatch(/robots:\s*{\s*index:\s*false/);
  });
});

describe.each(PAGES)('$file — behaviour', ({ load }) => {
  it('fails closed when PLATFORM_OWNER_EMAIL is not configured, even for a signed-in user', async () => {
    delete process.env.PLATFORM_OWNER_EMAIL;
    signedInAs('someone@example.test');
    const { default: Page } = await load();
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('fails closed when PLATFORM_OWNER_EMAIL is empty or only separators', async () => {
    process.env.PLATFORM_OWNER_EMAIL = ' , ';
    signedInAs('someone@example.test');
    const { default: Page } = await load();
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('redirects a signed-out visitor to /login, like every other admin page', async () => {
    process.env.PLATFORM_OWNER_EMAIL = 'owner@example.test';
    signedInAs(null);
    const { default: Page } = await load();
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('denies a signed-in user who is not the platform owner', async () => {
    process.env.PLATFORM_OWNER_EMAIL = 'owner@example.test';
    signedInAs('shop-user@example.test');
    const { default: Page } = await load();
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('denies when the session lookup itself fails', async () => {
    process.env.PLATFORM_OWNER_EMAIL = 'owner@example.test';
    mockGetUser.mockRejectedValue(new Error('auth unavailable'));
    const { default: Page } = await load();
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('renders for the configured owner, case-insensitively, and for any entry in a comma-separated list', async () => {
    process.env.PLATFORM_OWNER_EMAIL = 'first@example.test, Owner@Example.Test';
    signedInAs('OWNER@example.test');
    const { default: Page } = await load();
    await expect(Page()).resolves.toBeTruthy();
  });
});

describe('the matching API routes authorise independently of the pages', () => {
  const routes = [
    'app/api/admin/billing-health/overview/route.ts',
    'app/api/admin/billing-health/subscriptions/route.ts',
    'app/api/admin/billing-health/trials/route.ts',
    'app/api/admin/billing-health/revenue/route.ts',
    'app/api/admin/billing-health/renewals/route.ts',
    'app/api/admin/billing-health/churn/route.ts',
    'app/api/admin/billing-health/acquisition/route.ts',
    'app/api/admin/billing-health/webhooks/route.ts',
    'app/api/admin/sapelee/outbox/route.ts',
  ];
  it.each(routes)('%s calls verifyPlatformOwner and refuses non-owners', (route) => {
    const src = read(route);
    expect(src).toMatch(/verifyPlatformOwner\(/);
    expect(src).toMatch(/forbidden\(|status:\s*40[13]/);
  });
});
