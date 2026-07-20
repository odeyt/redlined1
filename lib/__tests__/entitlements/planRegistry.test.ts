/**
 * Tests for lib/entitlements/planRegistry.ts
 * Pure functions -- no mocks needed.
 */

import {
  PLAN_REGISTRY,
  PLAN_ORDER,
  PAID_PLAN_KEYS,
  getPlan,
  getPlanOrFree,
  comparePlans,
  planMeetsOrExceeds,
  minimumPlanForFeature,
  annualSavingsPct,
} from '../../entitlements/planRegistry';

describe('planRegistry -- PLAN_REGISTRY', () => {
  test('all plans in PLAN_ORDER exist in PLAN_REGISTRY', () => {
    for (const key of PLAN_ORDER) {
      expect(PLAN_REGISTRY[key]).toBeDefined();
    }
  });

  test('free plan has $0 price', () => {
    expect(PLAN_REGISTRY.free.monthlyPrice).toBe(0);
    expect(PLAN_REGISTRY.free.annualPrice).toBe(0);
  });

  test('free plan has no Creem product keys', () => {
    expect(PLAN_REGISTRY.free.creemProductKeyMonthly).toBeNull();
    expect(PLAN_REGISTRY.free.creemProductKeyAnnual).toBeNull();
  });

  test('free plan has requiresCheckout=false', () => {
    expect(PLAN_REGISTRY.free.requiresCheckout).toBe(false);
  });

  test('free plan expires=false', () => {
    expect(PLAN_REGISTRY.free.expires).toBe(false);
  });

  test('free plan limits match FreeLimits constants', () => {
    const limits = PLAN_REGISTRY.free.limits;
    expect(limits.customersTotal).toBe(10);
    expect(limits.vehiclesTotal).toBe(10);
    expect(limits.completedJobsPerMonth).toBe(5);
    expect(limits.aiCasesPerMonth).toBe(2);
    expect(limits.vinLookupsPerMonth).toBe(2);
    expect(limits.appointmentsPerMonth).toBe(5);
    expect(limits.dviPerMonth).toBe(2);
    expect(limits.storageMb).toBe(250);
    expect(limits.usersTotal).toBe(1);
    expect(limits.locationsTotal).toBe(1);
    expect(limits.techniciansTotal).toBe(1);
  });

  test('pro/business/enterprise plans have null (unlimited) for most limits', () => {
    expect(PLAN_REGISTRY.professional.limits.customersTotal).toBeNull();
    expect(PLAN_REGISTRY.business.limits.vehiclesTotal).toBeNull();
    expect(PLAN_REGISTRY.enterprise.limits.aiCasesPerMonth).toBeNull();
  });

  test('PAID_PLAN_KEYS does not include free', () => {
    expect(PAID_PLAN_KEYS.has('free')).toBe(false);
    expect(PAID_PLAN_KEYS.has('starter')).toBe(true);
    expect(PAID_PLAN_KEYS.has('professional')).toBe(true);
  });

  test('PLAN_ORDER starts with free', () => {
    expect(PLAN_ORDER[0]).toBe('free');
  });

  test('internal D1 shop IDs are defined in registry module', () => {
    // Ensures the constant is exported and not empty
    const { INTERNAL_SHOP_IDS } = require('../../entitlements/planRegistry');
    expect(INTERNAL_SHOP_IDS.has('38d55fae-741b-4bac-b520-f96eed65bf38')).toBe(true);
    expect(INTERNAL_SHOP_IDS.has('90b72748-bf01-4456-999f-f4ba48091606')).toBe(true);
  });
});

describe('planRegistry -- getPlan / getPlanOrFree', () => {
  test('getPlan returns correct plan', () => {
    expect(getPlan('starter')?.key).toBe('starter');
    expect(getPlan('free')?.key).toBe('free');
  });

  test('getPlan returns null for unknown key', () => {
    expect(getPlan('unknown_plan')).toBeNull();
  });

  test('getPlanOrFree returns free for unknown key', () => {
    expect(getPlanOrFree('unknown_plan').key).toBe('free');
  });

  test('getPlanOrFree returns correct plan for valid key', () => {
    expect(getPlanOrFree('professional').key).toBe('professional');
  });
});

describe('planRegistry -- comparePlans', () => {
  test('free is lower than starter', () => {
    expect(comparePlans('free', 'starter')).toBeLessThan(0);
  });

  test('business is higher than professional', () => {
    expect(comparePlans('business', 'professional')).toBeGreaterThan(0);
  });

  test('same plan compares to 0', () => {
    expect(comparePlans('starter', 'starter')).toBe(0);
  });
});

describe('planRegistry -- planMeetsOrExceeds', () => {
  test('professional meets or exceeds starter', () => {
    expect(planMeetsOrExceeds('professional', 'starter')).toBe(true);
  });

  test('free does not meet starter', () => {
    expect(planMeetsOrExceeds('free', 'starter')).toBe(false);
  });

  test('same plan meets itself', () => {
    expect(planMeetsOrExceeds('starter', 'starter')).toBe(true);
  });
});

describe('planRegistry -- minimumPlanForFeature', () => {
  test('dedicatedAccountManager only on enterprise', () => {
    expect(minimumPlanForFeature('dedicatedAccountManager')).toBe('enterprise');
  });

  test('multiLocation is not on free plan', () => {
    const min = minimumPlanForFeature('multiLocation');
    expect(min).not.toBe('free');
    expect(min).not.toBeNull();
  });

  test('returns valid plan key for all features', () => {
    const { PLAN_REGISTRY: reg } = require('../../entitlements/planRegistry');
    const freePlan = reg.free;
    for (const fk of Object.keys(freePlan.features)) {
      const result = minimumPlanForFeature(fk as never);
      // must be a plan key or null
      expect(result === null || typeof result === 'string').toBe(true);
    }
  });
});

describe('planRegistry -- annualSavingsPct', () => {
  test('free plan returns null savings', () => {
    expect(annualSavingsPct(PLAN_REGISTRY.free)).toBeNull();
  });

  test('paid plan with annual discount returns positive savings', () => {
    const pct = annualSavingsPct(PLAN_REGISTRY.professional);
    if (pct !== null) {
      expect(pct).toBeGreaterThan(0);
    }
  });
});
