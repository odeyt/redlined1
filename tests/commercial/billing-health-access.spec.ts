/**
 * tests/commercial/billing-health-access.spec.ts
 * Tests access control for the billing health admin routes.
 * Uses jest globals (typed via @types/jest).
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/supabaseServer', () => ({ getAdminDb: jest.fn() }));

function mockUserEmail(email: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require('@/lib/supabaseServer').getAdminDb as jest.Mock).mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: email ? { email } : null },
        error: null,
      }),
    },
  });
}

async function withOwnerEmail(email: string, fn: () => Promise<void>) {
  const original = process.env.PLATFORM_OWNER_EMAIL;
  process.env.PLATFORM_OWNER_EMAIL = email;
  try { await fn(); } finally { process.env.PLATFORM_OWNER_EMAIL = original ?? ''; }
}

describe('Platform owner access control', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows access when email matches PLATFORM_OWNER_EMAIL', async () => {
    await withOwnerEmail('owner@d1imports.com', async () => {
      mockUserEmail('owner@d1imports.com');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { verifyPlatformOwner } = require('@/lib/adminAuth');
      const req = new NextRequest('http://localhost/api/admin/billing-health/overview', {
        headers: { authorization: 'Bearer test-token' },
      });
      const result = await verifyPlatformOwner(req);
      expect(result.authorized).toBe(true);
    });
  });

  it('denies access for a normal shop owner email', async () => {
    await withOwnerEmail('owner@d1imports.com', async () => {
      mockUserEmail('shopowner@othershop.com');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { verifyPlatformOwner } = require('@/lib/adminAuth');
      const req = new NextRequest('http://localhost/api/admin/billing-health/overview', {
        headers: { authorization: 'Bearer test-token' },
      });
      const result = await verifyPlatformOwner(req);
      expect(result.authorized).toBe(false);
    });
  });

  it('denies access when not authenticated', async () => {
    await withOwnerEmail('owner@d1imports.com', async () => {
      mockUserEmail(null);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { verifyPlatformOwner } = require('@/lib/adminAuth');
      const req = new NextRequest('http://localhost/api/admin/billing-health/overview');
      const result = await verifyPlatformOwner(req);
      expect(result.authorized).toBe(false);
      expect(result.reason).toMatch(/authenticated/);
    });
  });

  it('denies access when PLATFORM_OWNER_EMAIL is not configured', async () => {
    await withOwnerEmail('', async () => {
      mockUserEmail('anyone@example.com');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { verifyPlatformOwner } = require('@/lib/adminAuth');
      const req = new NextRequest('http://localhost/api/admin/billing-health/overview', {
        headers: { authorization: 'Bearer token' },
      });
      const result = await verifyPlatformOwner(req);
      expect(result.authorized).toBe(false);
      expect(result.reason).toMatch(/not configured/);
    });
  });

  it('allows multiple authorized emails via comma-separated list', async () => {
    await withOwnerEmail('owner@d1imports.com,admin@d1imports.com', async () => {
      mockUserEmail('admin@d1imports.com');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { verifyPlatformOwner } = require('@/lib/adminAuth');
      const req = new NextRequest('http://localhost/api/admin/billing-health/overview', {
        headers: { authorization: 'Bearer token' },
      });
      const result = await verifyPlatformOwner(req);
      expect(result.authorized).toBe(true);
    });
  });
});

describe('Date range validation', () => {
  it('clamps range to 366 days maximum', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseDateRange } = require('@/lib/adminAuth');
    const to = new Date();
    const from = new Date(to.getTime() - 1000 * 24 * 60 * 60 * 1000);
    const req = new NextRequest(
      `http://localhost/api/test?from=${from.toISOString()}&to=${to.toISOString()}`
    );
    const range = parseDateRange(req);
    expect(range).not.toBeNull();
    const diffDays = (range!.to.getTime() - range!.from.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeLessThanOrEqual(366.1);
  });

  it('returns null for invalid date strings', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseDateRange } = require('@/lib/adminAuth');
    const req = new NextRequest('http://localhost/api/test?from=not-a-date&to=also-not');
    const range = parseDateRange(req);
    expect(range).toBeNull();
  });
});

describe('Internal shop exclusion', () => {
  it('contains both D1 shop IDs', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getInternalShopIds } = require('@/lib/adminAuth');
    const ids: Set<string> = getInternalShopIds();
    expect(ids.has('38d55fae-741b-4bac-b520-f96eed65bf38')).toBe(true);
    expect(ids.has('90b72748-bf01-4456-999f-f4ba48091606')).toBe(true);
    expect(ids.has('some-external-shop-id')).toBe(false);
  });
});
