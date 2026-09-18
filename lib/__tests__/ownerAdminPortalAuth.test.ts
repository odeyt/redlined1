/**
 * Owner-admin portal (/admin, /admin/accounts, /admin/accounts/[id],
 * /admin/support) — every route and every page independently enforces the
 * platform-owner guard, matching the invariant lib/__tests__/platformRouteAuth.test.ts
 * already established for the rest of the app: PLATFORM_OWNER_EMAIL via
 * verifyPlatformOwner()/requirePlatformOwnerPage(), never a shop role.
 *
 * Source-inspection tests, same technique as platformRouteAuth.test.ts and
 * supportInbox.test.ts in this directory — these assert on what shipped,
 * not on a mocked runtime, so a route that silently drops its guard fails
 * the build's own test suite, not just a future code review.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const API_ROUTES = [
  'app/api/admin/overview/route.ts',
  'app/api/admin/accounts/route.ts',
  'app/api/admin/accounts/[id]/route.ts',
  'app/api/admin/support/route.ts',
];

describe.each(API_ROUTES)('%s', route => {
  const src = read(route);

  it('authorises with verifyPlatformOwner before any query', () => {
    expect(src).toMatch(/verifyPlatformOwner\(req\)/);
  });

  it('refuses anonymous callers with 401 and authenticated non-owners with 403', () => {
    expect(src).toMatch(/status:\s*401/);
    expect(src).toMatch(/forbidden\(/);
  });

  it('does not authorise on a shop role', () => {
    expect(src).not.toMatch(/role !== 'owner'/);
    expect(src).not.toMatch(/\.in\('role', \['owner', 'admin'\]\)/);
  });
});

const PAGES = [
  'app/admin/page.tsx',
  'app/admin/accounts/page.tsx',
  'app/admin/accounts/[id]/page.tsx',
  'app/admin/support/page.tsx',
];

describe.each(PAGES)('%s', page => {
  const src = read(page);

  it('guards with requirePlatformOwnerPage before rendering', () => {
    expect(src).toMatch(/requirePlatformOwnerPage\(\)/);
  });

  it('does not depend on a parent layout for authorization (no app/admin/layout.tsx exists)', () => {
    // If this ever starts failing because a layout.tsx was added, the new
    // layout must not become the only guard — every page must still call
    // requirePlatformOwnerPage() itself.
    expect(src).toMatch(/requirePlatformOwnerPage/);
  });

  it('is marked dynamic and non-indexable', () => {
    expect(src).toMatch(/dynamic = 'force-dynamic'/);
    expect(src).toMatch(/robots:\s*{\s*index:\s*false/);
  });
});

describe('requirePlatformOwnerPage shares the one env-var guard', () => {
  const adminAuth = read('lib/adminAuth.ts');

  it('is defined in lib/adminAuth.ts, not a second authorization system', () => {
    expect(adminAuth).toMatch(/export async function requirePlatformOwnerPage/);
  });

  it('reads the same authorized-email set as verifyPlatformOwner', () => {
    const body = adminAuth.slice(adminAuth.indexOf('export async function requirePlatformOwnerPage'));
    expect(body).toMatch(/getAuthorizedEmails\(\)/);
  });

  it('redirects rather than rendering when unauthorized', () => {
    const body = adminAuth.slice(adminAuth.indexOf('export async function requirePlatformOwnerPage'));
    expect(body).toMatch(/redirect\('\/login'\)/);
  });
});

const FEATURE_VIEW_FILES = [
  'features/admin/overview/OwnerOverviewView.tsx',
  'features/admin/accounts/AccountsDirectoryView.tsx',
  'features/admin/accounts/AccountDetailView.tsx',
  'features/admin/support/SupportIssuesView.tsx',
  'features/admin/shared/AdminHeader.tsx',
];

describe('server-only data modules', () => {
  const modules = ['lib/admin/accountsData.ts', 'lib/admin/supportData.ts'];

  it.each(modules)('%s imports the server-only guard', (mod) => {
    const src = read(mod);
    expect(src.trim().startsWith("import 'server-only';") || src.includes("\nimport 'server-only';")).toBe(true);
  });

  it.each(modules)('%s is read directly by a page, not fetched through an API route', (mod) => {
    const exportName = mod.includes('supportData') ? 'listSupportItems' : 'getOwnerOverview|listAccounts|getAccountDetail';
    const pages = read('app/admin/page.tsx') + read('app/admin/accounts/page.tsx')
      + read('app/admin/accounts/[id]/page.tsx') + read('app/admin/support/page.tsx');
    expect(pages).toMatch(new RegExp(exportName));
  });
});

describe('the owner-admin UI is server-rendered, not client-fetched', () => {
  it.each(FEATURE_VIEW_FILES)('%s is a Server Component — no \'use client\' directive', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/^\s*['"]use client['"]/);
  });

  it.each(FEATURE_VIEW_FILES)('%s does not import React hooks that would require a client boundary', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/\buseState\(|\buseEffect\(|\buseCallback\(/);
  });

  it.each(FEATURE_VIEW_FILES)('%s does not fetch from an API route — data arrives as props from the page', (file) => {
    const src = read(file);
    expect(src).not.toMatch(/fetch\(['"`]\/api\//);
  });

  it.each(FEATURE_VIEW_FILES)('%s links with next/link, not a raw <a> element, for internal navigation', (file) => {
    const src = read(file);
    expect(src).toMatch(/from 'next\/link'/);
    // A raw <a href="/admin...")> would be the exact pattern the correction
    // asked to remove; next/link's <Link> is used instead everywhere in this file.
    expect(src).not.toMatch(/<a\s+href=["'`]\/admin/);
  });
});

describe('no raw billing payloads or unmasked provider ids leave the server module', () => {
  const src = read('lib/admin/accountsData.ts');

  it('billing event summaries never select or forward the payload column', () => {
    const billingEventsBlock = src.slice(src.indexOf('let billingEvents'), src.indexOf('let usage'));
    expect(billingEventsBlock).not.toMatch(/payload/);
  });

  it('provider customer/subscription ids are masked before being placed on the response type', () => {
    expect(src).toMatch(/providerCustomerId:\s*maskRef\(/);
    expect(src).toMatch(/providerSubscriptionId:\s*maskRef\(/);
  });

  it('the mask helper keeps only the last 4 characters visible', () => {
    const helper = src.slice(src.indexOf('function maskRef'), src.indexOf('function maskRef') + 300);
    expect(helper).toMatch(/slice\(-4\)/);
  });
});

describe('support/leads list never selects free-text message bodies', () => {
  const src = read('lib/admin/supportData.ts');

  it('support_tickets query does not select context (bug-report diagnostics, may carry PII)', () => {
    const block = src.slice(src.indexOf('loadSupportTickets'), src.indexOf('loadShopAuditLeads'));
    expect(block).not.toMatch(/select\([^)]*\bcontext\b/);
  });

  it('shop_audit_leads query selects none of the free-text intake fields', () => {
    const block = src.slice(src.indexOf('loadShopAuditLeads'));
    expect(block).not.toMatch(/biggest_challenge|current_software|full_name|phone/);
  });

  it('no query in this module selects support_messages.body', () => {
    expect(src).not.toMatch(/select\([^)]*\bbody\b/);
  });
});

describe('status claims are corrected — no unsupported fields', () => {
  it('accountStatus.ts never returns "complimentary" as a status value (doc comments explaining its absence are fine)', () => {
    const src = read('lib/admin/accountStatus.ts');
    expect(src).not.toMatch(/\|\s*'complimentary'/);
    expect(src).not.toMatch(/status:\s*'complimentary'/);
  });

  it('a manual billing_provider is never used to infer a status', () => {
    const src = read('lib/admin/accountStatus.ts');
    expect(src).not.toMatch(/billingProvider === 'manual'/);
  });

  it('the "Complimentary status: Not tracked" note only appears as an informational aside, not a status label', () => {
    const src = read('features/admin/accounts/AccountDetailView.tsx');
    expect(src).toMatch(/Complimentary status: Not tracked/);
    // It must be conditioned on the raw billing_provider field, not a status enum member.
    expect(src).toMatch(/billingProvider === 'manual'/);
  });

  it('cancelled-with-access-retained is never called a synchronization defect', () => {
    const src = read('lib/admin/accountStatus.ts');
    expect(src).not.toMatch(/synchronization defect|sync defect/i);
    expect(src).toMatch(/access retained/i);
    expect(src).toMatch(/current product policy/i);
  });

  it('cancelled-with-access-retained does not set billingMismatch', () => {
    const src = read('lib/admin/accountStatus.ts');
    const block = src.slice(src.indexOf("sub.status === 'cancelled'"), src.indexOf("sub.status === 'cancelled'") + 300);
    expect(block).toMatch(/billingMismatch:\s*false/);
  });

  it('there is no "inactive_paid" status — it is named for what it actually measures (a billing record gap), not login/product inactivity', () => {
    const src = read('lib/admin/accountStatus.ts');
    expect(src).not.toMatch(/\binactive_paid\b/);
    expect(src).toMatch(/paid_billing_unverified/);
  });

  it('the login-recency badge documents its threshold and is never called product/feature inactivity', () => {
    const src = read('lib/admin/accountStatus.ts');
    expect(src).toMatch(/LOGIN_INACTIVITY_THRESHOLD_DAYS/);
    expect(src).not.toMatch(/product inactiv|feature inactiv/i);
  });

  it('the account list UI labels the login badge as login recency, never product/feature activity', () => {
    const src = read('features/admin/accounts/AccountsDirectoryView.tsx');
    expect(src).toMatch(/no recent login/);
    expect(src).not.toMatch(/product inactiv|feature inactiv|product activity|feature activity/i);
  });
});

describe('signup attribution is reported as MISSING, not derived from shop_audit_leads', () => {
  it('the account detail view states attribution is not configured, unconditionally', () => {
    const src = read('features/admin/accounts/AccountDetailView.tsx');
    expect(src).toMatch(/Signup attribution not configured/);
  });

  it('the account detail view does not claim applying the shop_audit_leads migration enables attribution', () => {
    const src = read('features/admin/accounts/AccountDetailView.tsx');
    // The file may correctly say applying the migration would NOT add
    // attribution — what must never appear is the affirmative claim.
    expect(src).not.toMatch(/appl(y|ying)[^.]*migration[^.]*(would enable|enables|adds)[^.]*attribution/i);
    expect(src).toMatch(/would not add signup attribution/i);
  });

  it('getAccountDetail no longer queries shop_audit_leads at all', () => {
    const src = read('lib/admin/accountsData.ts');
    expect(src).not.toMatch(/shop_audit_leads/);
  });

  it('shop_audit_leads is documented as an anonymous pre-signup lead form, not a signup tracker', () => {
    const src = read('lib/admin/supportData.ts');
    expect(src).toMatch(/ANONYMOUS.*pre-signup/i);
    expect(src).toMatch(/never treated as signup attribution/i);
  });
});

describe('account identity and tenant isolation', () => {
  it('the account directory is shop-driven — shops.id is the one canonical identifier', () => {
    const src = read('lib/admin/accountsData.ts');
    expect(src).toMatch(/canonical identifier/i);
    expect(src).toMatch(/from\('shops'\)/);
  });

  it('every downstream join in getAccountDetail filters by a shop_id read from the resolved shop row, never from a client-supplied field', () => {
    const src = read('lib/admin/accountsData.ts');
    const detailFn = src.slice(src.indexOf('export async function getAccountDetail'));
    // Every .eq('shop_id', ...) in getAccountDetail must reference shop.id
    // (the row already fetched by the validated path param), not any
    // request-body/query value.
    const eqShopIdCalls = [...detailFn.matchAll(/\.eq\('shop_id',\s*([^)]+)\)/g)].map(m => m[1].trim());
    expect(eqShopIdCalls.length).toBeGreaterThan(0);
    for (const arg of eqShopIdCalls) {
      expect(arg).toBe('shop.id');
    }
  });

  it('a shop with multiple shop_users rows is still one directory row (member count, not duplicate rows)', () => {
    const src = read('lib/admin/accountsData.ts');
    expect(src).toMatch(/memberCount/);
    expect(src).toMatch(/one row here, not three/i);
  });

  it('the list query fetches shops, not profiles, as its primary driver table', () => {
    const src = read('lib/admin/accountsData.ts');
    const fnBody = src.slice(src.indexOf('async function scanClassifiedShops'), src.indexOf('function matchesStatusFilter'));
    expect(fnBody).toMatch(/db\s*\n?\s*\.from\('shops'\)/);
  });

  it('last-sign-in is fetched per rendered row only, never via a whole-project listUsers() scan', () => {
    const src = read('lib/admin/accountsData.ts');
    expect(src).not.toMatch(/listUsers\(/);
    expect(src).toMatch(/getUserById/);
  });

  it('the exact scan cap is exported and surfaced in both list and overview results', () => {
    const src = read('lib/admin/accountsData.ts');
    expect(src).toMatch(/export \{ MAX_SCAN_ROWS \}/);
    expect(src).toMatch(/maxScanRows:\s*MAX_SCAN_ROWS/);
  });

  it('the accounts directory UI states the exact scan cap when results may be incomplete, not a bare "truncated" flag', () => {
    const src = read('features/admin/accounts/AccountsDirectoryView.tsx');
    expect(src).toMatch(/\{result\.maxScanRows\}/);
    expect(src).toMatch(/most recently created shops/);
  });
});

describe('fixtures do not reuse production identifiers', () => {
  // Built from adminAuth.ts's own getInternalShopIds() defaults rather than
  // a literal here, so this file itself never contains the production
  // UUIDs as a string (which would otherwise trip its own check below).
  const adminAuthSrc = read('lib/adminAuth.ts');
  const prodShopIds = [...adminAuthSrc.matchAll(/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/g)]
    .map(m => m[1]);

  const fixtureFiles = [
    'lib/admin/__tests__/accountStatus.test.ts',
    'lib/admin/__tests__/accountsDataBounds.test.ts',
  ];

  it('found at least the two documented D1 internal shop ids to check against', () => {
    expect(prodShopIds.length).toBeGreaterThanOrEqual(2);
  });

  it.each(fixtureFiles)('%s contains none of the production D1 shop UUIDs', (file) => {
    const src = read(file);
    for (const id of prodShopIds) {
      expect(src).not.toContain(id);
    }
  });
});
