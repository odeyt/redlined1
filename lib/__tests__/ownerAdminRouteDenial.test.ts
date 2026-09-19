/**
 * Runtime authorization for every owner-admin API route. The source-inspection
 * tests in ownerAdminPortalAuth.test.ts prove the guard is written; these prove
 * it behaves: a signed-out caller and an authenticated non-owner (an ordinary
 * shop user, including one asking for another shop's data) are refused BEFORE any
 * data function runs, and the platform owner is let through.
 *
 * All identities are synthetic. Data modules are mocked, so nothing here can
 * read a database.
 */
import { NextRequest } from 'next/server';

const verify = jest.fn();

jest.mock('@/lib/adminAuth', () => {
  const { NextResponse } = jest.requireActual('next/server');
  return {
    verifyPlatformOwner: (...a: unknown[]) => verify(...a),
    forbidden: (reason: string) => NextResponse.json({ error: 'Forbidden', detail: reason }, { status: 403 }),
    parseDateRange: () => null,
  };
});

const dataFns = {
  getOwnerOverview: jest.fn(async () => ({ ok: true })),
  listAccounts: jest.fn(async () => ({ ok: true })),
  getAccountDetail: jest.fn(async () => ({ ok: true })),
  getBillingReconciliation: jest.fn(async () => ({ ok: true })),
  listSupportItems: jest.fn(async () => ({ ok: true })),
  listProfileDiagnostics: jest.fn(async () => ({ ok: true })),
  getBillingOverview: jest.fn(async () => ({ ok: true })),
  runDataQualityChecks: jest.fn(async () => ({ ok: true })),
};

jest.mock('@/lib/admin/accountsData', () => ({
  getOwnerOverview: (...a: unknown[]) => dataFns.getOwnerOverview(...(a as [])),
  listAccounts: (...a: unknown[]) => dataFns.listAccounts(...(a as [])),
  getAccountDetail: (...a: unknown[]) => dataFns.getAccountDetail(...(a as [])),
  getBillingReconciliation: (...a: unknown[]) => dataFns.getBillingReconciliation(...(a as [])),
  ACCOUNT_SORT_KEYS: [], ACCOUNT_STATUS_FILTERS: [],
}));
jest.mock('@/lib/admin/supportData', () => ({ listSupportItems: (...a: unknown[]) => dataFns.listSupportItems(...(a as [])) }));
jest.mock('@/lib/admin/profileDiagnostics', () => ({ listProfileDiagnostics: (...a: unknown[]) => dataFns.listProfileDiagnostics(...(a as [])) }));
jest.mock('@/commercial/analytics/BillingAnalyticsService', () => ({ getBillingOverview: (...a: unknown[]) => dataFns.getBillingOverview(...(a as [])) }));
jest.mock('@/commercial/analytics/BillingDataQualityService', () => ({ runDataQualityChecks: (...a: unknown[]) => dataFns.runDataQualityChecks(...(a as [])) }));
jest.mock('@/lib/apiHelpers', () => ({ sanitizeError: () => 'error' }));

import { GET as overview } from '@/app/api/admin/overview/route';
import { GET as accounts } from '@/app/api/admin/accounts/route';
import { GET as accountDetail } from '@/app/api/admin/accounts/[id]/route';
import { GET as support } from '@/app/api/admin/support/route';
import { GET as reconciliation } from '@/app/api/admin/reconciliation/route';
import { GET as profileDiagnostics } from '@/app/api/admin/profile-diagnostics/route';
import { GET as billingOverview } from '@/app/api/admin/billing-health/overview/route';

const SHOP_A = 'a0000001-0000-4000-8000-000000000000';
const SHOP_B = 'a0000002-0000-4000-8000-000000000000';
const req = (path: string) => new NextRequest(`http://localhost${path}`);
const detailCall = (id: string) => accountDetail(req(`/api/admin/accounts/${id}`), { params: Promise.resolve({ id }) });

const ROUTES: Array<[string, () => Promise<Response>]> = [
  ['overview', () => overview(req('/api/admin/overview'))],
  ['accounts', () => accounts(req('/api/admin/accounts'))],
  ['accounts/[id]', () => detailCall(SHOP_A)],
  ['support', () => support(req('/api/admin/support'))],
  ['reconciliation', () => reconciliation(req('/api/admin/reconciliation'))],
  ['profile-diagnostics', () => profileDiagnostics(req('/api/admin/profile-diagnostics'))],
  ['billing-health/overview', () => billingOverview(req('/api/admin/billing-health/overview'))],
];

const SIGNED_OUT = { authorized: false, email: null, reason: 'Not authenticated' };
const SHOP_USER = { authorized: false, email: 'mechanic@example-test.invalid', reason: 'Not authorized as platform owner' };
const OWNER = { authorized: true, email: 'owner@example-test.invalid', reason: 'OK' };

const anyDataCalled = () => Object.values(dataFns).some(f => f.mock.calls.length > 0);

beforeEach(() => {
  verify.mockReset();
  Object.values(dataFns).forEach(f => f.mockClear());
});

describe.each(ROUTES)('%s', (_name, call) => {
  it('refuses a signed-out caller and never reads data', async () => {
    verify.mockResolvedValue(SIGNED_OUT);
    const res = await call();
    expect([401, 403]).toContain(res.status);
    expect(anyDataCalled()).toBe(false);
  });

  it('refuses an authenticated shop user (403) and never reads data', async () => {
    verify.mockResolvedValue(SHOP_USER);
    const res = await call();
    expect(res.status).toBe(403);
    expect(anyDataCalled()).toBe(false);
  });

  it('does not leak data or the caller identity in a refusal', async () => {
    verify.mockResolvedValue(SHOP_USER);
    const body = JSON.stringify(await (await call()).json());
    expect(body).not.toMatch(/ok":true/);
    expect(body).not.toContain('mechanic@example-test.invalid');
  });

  it('lets the platform owner through to the data layer', async () => {
    verify.mockResolvedValue(OWNER);
    const res = await call();
    expect(res.status).toBe(200);
    expect(anyDataCalled()).toBe(true);
  });
});

describe('cross-tenant access', () => {
  it("a shop user cannot read another shop's account detail by guessing its id", async () => {
    verify.mockResolvedValue(SHOP_USER);
    for (const id of [SHOP_A, SHOP_B]) {
      const res = await detailCall(id);
      expect(res.status).toBe(403);
    }
    expect(dataFns.getAccountDetail).not.toHaveBeenCalled();
  });

  it('the shop-user identity is never used to widen access: a matching-looking email that is not the owner stays refused', async () => {
    verify.mockResolvedValue({ authorized: false, email: 'OWNER@example-test.invalid.evil', reason: 'Not authorized as platform owner' });
    const res = await accounts(req('/api/admin/accounts?search=anything&archived=archived'));
    expect(res.status).toBe(403);
    expect(dataFns.listAccounts).not.toHaveBeenCalled();
  });

  it('a malformed id is rejected for the owner without reaching the data layer', async () => {
    verify.mockResolvedValue(OWNER);
    const res = await detailCall('not-a-uuid');
    expect(res.status).toBe(400);
    expect(dataFns.getAccountDetail).not.toHaveBeenCalled();
  });
});
