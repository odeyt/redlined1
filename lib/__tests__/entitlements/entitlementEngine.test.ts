/**
 * Tests for lib/entitlements/entitlementEngine.ts
 *
 * Note: BILLING_ENABLED is a module-level constant (evaluated at import time),
 * so BILLING_DISABLED behavior is what runs in the default test env.
 * Tests that require BILLING_ENABLED=true use jest.isolateModules() + re-import.
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockFrom = jest.fn();

jest.mock('@/lib/supabaseServer', () => ({
  getAdminDb: () => ({ from: mockFrom }),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import {
  getEffectivePlanKey,
  checkFeatureAccess,
  checkUsageAccess,
} from '../../entitlements/entitlementEngine';

// ─── Constants ────────────────────────────────────────────────────────────────

const INTERNAL_SHOP = '38d55fae-741b-4bac-b520-f96eed65bf38';
const INTERNAL_SHOP_2 = '90b72748-bf01-4456-999f-f4ba48091606';
const FREE_SHOP = 'aaa00000-0000-0000-0000-000000000001';

afterEach(() => jest.clearAllMocks());

// ─── Tests: BILLING_ENABLED=false (default test env) ─────────────────────────

describe('entitlementEngine -- BILLING_DISABLED (default)', () => {
  test('checkFeatureAccess allows everything when billing disabled', async () => {
    const result = await checkFeatureAccess(FREE_SHOP, 'repair_intelligence');
    expect(result.allowed).toBe(true);
    expect(result.reasonCode).toBe('BILLING_DISABLED');
  });

  test('checkUsageAccess allows everything when billing disabled', async () => {
    const result = await checkUsageAccess(FREE_SHOP, 'ai_cases', 1);
    expect(result.allowed).toBe(true);
    expect(result.reasonCode).toBe('BILLING_DISABLED');
  });

  test('result carries workspaceId', async () => {
    const result = await checkFeatureAccess(FREE_SHOP, 'ai_diagnostics');
    expect(result.workspaceId).toBe(FREE_SHOP);
  });
});

// ─── Tests: Internal D1 shop (bypasses BILLING_ENABLED check) ────────────────

describe('entitlementEngine -- INTERNAL_SHOP_IDS', () => {
  test('getEffectivePlanKey returns enterprise for internal shop 1', async () => {
    const plan = await getEffectivePlanKey(INTERNAL_SHOP);
    expect(plan).toBe('enterprise');
    // Short-circuits before DB call
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('getEffectivePlanKey returns enterprise for internal shop 2', async () => {
    const plan = await getEffectivePlanKey(INTERNAL_SHOP_2);
    expect(plan).toBe('enterprise');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('checkFeatureAccess always allows internal shop regardless of feature', async () => {
    const result = await checkFeatureAccess(INTERNAL_SHOP, 'white_label');
    expect(result.allowed).toBe(true);
    expect(result.reasonCode).toBe('INTERNAL_OVERRIDE');
    expect(result.effectivePlanKey).toBe('enterprise');
  });

  test('checkUsageAccess always allows internal shop regardless of quantity', async () => {
    const result = await checkUsageAccess(INTERNAL_SHOP, 'ai_cases', 9999);
    expect(result.allowed).toBe(true);
    expect(result.reasonCode).toBe('INTERNAL_OVERRIDE');
  });

  test('internal shop does not call DB for feature check', async () => {
    await checkFeatureAccess(INTERNAL_SHOP, 'repair_intelligence');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('internal shop does not call DB for usage check', async () => {
    await checkUsageAccess(INTERNAL_SHOP, 'completed_jobs', 100);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ─── Tests: DB error handling ─────────────────────────────────────────────────

describe('entitlementEngine -- DB error fallback', () => {
  test('getEffectivePlanKey throws EntitlementUnavailableError on DB error', async () => {
    mockFrom.mockImplementation(() => { throw new Error('DB connection error'); });
    await expect(getEffectivePlanKey(FREE_SHOP)).rejects.toThrow('Entitlement check unavailable');
  });

  test('checkFeatureAccess returns ENTITLEMENT_CHECK_UNAVAILABLE on DB error', async () => {
    mockFrom.mockImplementation(() => { throw new Error('DB connection error'); });
    // Need billing enabled for the DB path to be reached; use isolated engine
    // In the default BILLING_DISABLED env, this path is short-circuited.
    // The BILLING_ENABLED=true test suite below covers this more thoroughly.
  });
});

// ─── Tests: BILLING_ENABLED=true (isolated module re-import) ─────────────────

describe('entitlementEngine -- BILLING_ENABLED=true (isolated)', () => {
  type EngineModule = typeof import('../../entitlements/entitlementEngine');
  let engine: EngineModule;

  beforeAll(async () => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_BILLING_ENABLED = 'true';

    // Re-apply Supabase mock in isolated context
    jest.mock('@/lib/supabaseServer', () => ({
      getAdminDb: () => ({ from: mockFrom }),
    }));

    engine = await import('../../entitlements/entitlementEngine');
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = 'false';
    jest.resetModules();
  });

  /** Wire mockFrom to return a plan from the shop_users profiles join */
  function mockPlan(planKey: string) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'shop_users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { profiles: { plan: planKey } }, error: null,
                }),
              })),
              then: (cb: (v: unknown) => unknown) => cb({ count: 1, data: null, error: null }),
            })),
          })),
        };
      }
      if (table === 'usage_monthly') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      }
      return {
        select: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ count: 0, data: null, error: null }),
        })),
      };
    });
  }

  test('checkFeatureAccess denies repair_intelligence on free plan', async () => {
    mockPlan('free');
    const result = await engine.checkFeatureAccess(FREE_SHOP, 'repair_intelligence');
    expect(result.allowed).toBe(false);
    expect(result.upgradeRequired).toBe(true);
    expect(result.effectivePlanKey).toBe('free');
  });

  test('checkFeatureAccess denies multi_location on free plan', async () => {
    mockPlan('free');
    const result = await engine.checkFeatureAccess(FREE_SHOP, 'multi_location');
    expect(result.allowed).toBe(false);
  });

  test('checkUsageAccess denies ai_cases when at free limit (2/2)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'shop_users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { profiles: { plan: 'free' } }, error: null,
                }),
              })),
              then: (cb: (v: unknown) => unknown) => cb({ count: 1, data: null, error: null }),
            })),
          })),
        };
      }
      if (table === 'usage_monthly') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn().mockResolvedValue({
                data: [{ metric: 'ai_cases', count: 2 }], error: null,
              }),
            })),
          })),
        };
      }
      return {
        select: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ count: 0, data: null, error: null }),
        })),
      };
    });

    const result = await engine.checkUsageAccess(FREE_SHOP, 'ai_cases', 1);
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('PLAN_LIMIT_REACHED');
    expect(result.limit).toBe(2);
    expect(result.used).toBe(2);
    expect(result.remaining).toBe(0);
    expect(result.upgradeRequired).toBe(true);
  });

  test('checkUsageAccess allows ai_cases when below free limit (1/2)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'shop_users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { profiles: { plan: 'free' } }, error: null,
                }),
              })),
              then: (cb: (v: unknown) => unknown) => cb({ count: 1, data: null, error: null }),
            })),
          })),
        };
      }
      if (table === 'usage_monthly') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn().mockResolvedValue({
                data: [{ metric: 'ai_cases', count: 1 }], error: null,
              }),
            })),
          })),
        };
      }
      return {
        select: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue({ count: 0, data: null, error: null }),
        })),
      };
    });

    const result = await engine.checkUsageAccess(FREE_SHOP, 'ai_cases', 1);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(2);
    expect(result.used).toBe(1);
    expect(result.remaining).toBe(1);
  });

  test('checkUsageAccess allows professional ai_cases (500 limit)', async () => {
    mockPlan('professional');
    const result = await engine.checkUsageAccess(FREE_SHOP, 'ai_cases', 1);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(500);
    expect(result.reasonCode).toBe('LIMIT_AVAILABLE');
  });

  test('checkUsageAccess returns unlimited appointments for professional', async () => {
    mockPlan('professional');
    const result = await engine.checkUsageAccess(FREE_SHOP, 'appointments', 999);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBeNull();
  });

  test('checkFeatureAccess returns ENTITLEMENT_CHECK_UNAVAILABLE on DB error (fail closed)', async () => {
    mockFrom.mockImplementation(() => { throw new Error('DB down'); });
    const result = await engine.checkFeatureAccess(FREE_SHOP, 'repair_intelligence');
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('ENTITLEMENT_CHECK_UNAVAILABLE');
    expect(result.upgradeRequired).toBe(false);
    expect(result.retryable).toBe(true);
  });

  test('checkUsageAccess returns ENTITLEMENT_CHECK_UNAVAILABLE on plan DB error (fail closed)', async () => {
    mockFrom.mockImplementation(() => { throw new Error('DB down'); });
    const result = await engine.checkUsageAccess(FREE_SHOP, 'ai_cases', 1);
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('ENTITLEMENT_CHECK_UNAVAILABLE');
    expect(result.upgradeRequired).toBe(false);
    expect(result.retryable).toBe(true);
  });
});
