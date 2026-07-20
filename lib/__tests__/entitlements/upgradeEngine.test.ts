/**
 * Tests for lib/entitlements/upgradeEngine.ts
 * Pure functions -- no mocks needed.
 */

import { buildUpgradeRecommendation, recommendPlanForFeature } from '../../entitlements/upgradeEngine';
import type { EntitlementResult } from '../../entitlements/types';

function makeDenial(overrides: Partial<EntitlementResult> = {}): EntitlementResult {
  return {
    allowed: false,
    workspaceId: 'shop-123',
    effectivePlanKey: 'free',
    featureKey: undefined,
    metricKey: 'ai_cases',
    limit: 2,
    used: 2,
    remaining: 0,
    resetAt: '2026-08-01T00:00:00.000Z',
    reasonCode: 'PLAN_LIMIT_REACHED',
    userMessage: "You've reached the limit",
    upgradeRequired: true,
    recommendedPlanKey: 'starter',
    ...overrides,
  };
}

describe('upgradeEngine -- buildUpgradeRecommendation', () => {
  test('returns null when denial is actually allowed', () => {
    const allowed = makeDenial({ allowed: true });
    expect(buildUpgradeRecommendation(allowed)).toBeNull();
  });

  test('returns a recommendation object for a usage denial', () => {
    const denial = makeDenial();
    const rec = buildUpgradeRecommendation(denial);
    expect(rec).not.toBeNull();
    expect(rec?.currentPlanKey).toBe('free');
    expect(typeof rec?.recommendedPlanKey).toBe('string');
  });

  test('recommendation includes a non-empty benefitsUnlocked list', () => {
    const denial = makeDenial({ metricKey: 'ai_cases', used: 2, limit: 2 });
    const rec = buildUpgradeRecommendation(denial);
    expect(rec?.benefitsUnlocked.length).toBeGreaterThan(0);
  });

  test('recommendation for ai_cases includes AI-related benefit', () => {
    const denial = makeDenial({ metricKey: 'ai_cases' });
    const rec = buildUpgradeRecommendation(denial);
    const hasAiBenefit = rec?.benefitsUnlocked.some(b => /ai/i.test(b));
    expect(hasAiBenefit).toBe(true);
  });

  test('recommendation carries a reason string', () => {
    const denial = makeDenial();
    const rec = buildUpgradeRecommendation(denial);
    expect(typeof rec?.reason).toBe('string');
    expect((rec?.reason ?? '').length).toBeGreaterThan(0);
  });

  test('recommendation for feature denial carries currentPlanKey', () => {
    const denial = makeDenial({
      metricKey: undefined,
      featureKey: 'repair_intelligence',
      reasonCode: 'FEATURE_NOT_INCLUDED',
      recommendedPlanKey: 'professional',
    });
    const rec = buildUpgradeRecommendation(denial);
    expect(rec?.currentPlanKey).toBe('free');
  });

  test('upgradeRequired is true on recommendation', () => {
    const denial = makeDenial();
    const rec = buildUpgradeRecommendation(denial);
    expect(rec?.upgradeRequired).toBe(true);
  });

  test('pricingPageUrl is /subscriptions', () => {
    const denial = makeDenial();
    const rec = buildUpgradeRecommendation(denial);
    expect(rec?.pricingPageUrl).toBe('/subscriptions');
  });
});

describe('upgradeEngine -- recommendPlanForFeature', () => {
  test('returns a recommendation for a premium feature', () => {
    const rec = recommendPlanForFeature('repair_intelligence');
    expect(rec).toBeDefined();
    expect(rec.currentPlanKey).toBe('free');
    expect(rec.upgradeRequired).toBe(true);
    expect(typeof rec.reason).toBe('string');
    expect(Array.isArray(rec.benefitsUnlocked)).toBe(true);
  });

  test('recommendedPlanKey is set for repair_intelligence', () => {
    const rec = recommendPlanForFeature('repair_intelligence');
    expect(rec.recommendedPlanKey).not.toBeNull();
    expect(rec.recommendedPlanKey).not.toBe('free');
  });

  test('recommendation for ai_diagnostics has a plan key', () => {
    const rec = recommendPlanForFeature('ai_diagnostics');
    expect(rec.recommendedPlanKey).not.toBeFalsy();
  });
});
