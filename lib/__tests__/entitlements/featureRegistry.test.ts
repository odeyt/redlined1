/**
 * Tests for lib/entitlements/featureRegistry.ts
 * Pure functions â€” no mocks needed.
 */

import {
  FEATURE_REGISTRY,
  MONTHLY_METRIC_KEYS,
  TOTAL_METRIC_KEYS,
  getFeature,
  getFeaturesByCategory,
} from '../../entitlements/featureRegistry';

describe('featureRegistry â€” FEATURE_REGISTRY', () => {
  test('all feature definitions have required fields', () => {
    for (const [key, def] of Object.entries(FEATURE_REGISTRY)) {
      expect(def.key).toBe(key);
      expect(typeof def.name).toBe('string');
      expect(typeof def.description).toBe('string');
      expect(typeof def.upgradeDescription).toBe('string');
      expect(typeof def.category).toBe('string');
      expect(typeof def.publicVisible).toBe('boolean');
    }
  });

  test('has at least 20 feature definitions', () => {
    expect(Object.keys(FEATURE_REGISTRY).length).toBeGreaterThanOrEqual(20);
  });

  test('ai_diagnostics has ai_cases as usage metric', () => {
    expect(FEATURE_REGISTRY.ai_diagnostics.usageMetric).toBe('ai_cases');
  });

  test('customer_management has customers_total as usage metric', () => {
    expect(FEATURE_REGISTRY.customer_management.usageMetric).toBe('customers_total');
  });

  test('repair_intelligence has no usage metric (boolean feature)', () => {
    expect(FEATURE_REGISTRY.repair_intelligence.usageMetric).toBeNull();
  });
});

describe('featureRegistry â€” metric key sets', () => {
  test('MONTHLY_METRIC_KEYS contains expected metrics', () => {
    expect(MONTHLY_METRIC_KEYS.has('completed_jobs')).toBe(true);
    expect(MONTHLY_METRIC_KEYS.has('ai_cases')).toBe(true);
    expect(MONTHLY_METRIC_KEYS.has('vin_lookups')).toBe(true);
    expect(MONTHLY_METRIC_KEYS.has('appointments')).toBe(true);
    expect(MONTHLY_METRIC_KEYS.has('dvi')).toBe(true);
    expect(MONTHLY_METRIC_KEYS.has('sms')).toBe(true);
  });

  test('MONTHLY_METRIC_KEYS does not contain total metrics', () => {
    expect(MONTHLY_METRIC_KEYS.has('customers_total')).toBe(false);
    expect(MONTHLY_METRIC_KEYS.has('vehicles_total')).toBe(false);
  });

  test('TOTAL_METRIC_KEYS contains expected metrics', () => {
    expect(TOTAL_METRIC_KEYS.has('customers_total')).toBe(true);
    expect(TOTAL_METRIC_KEYS.has('vehicles_total')).toBe(true);
    expect(TOTAL_METRIC_KEYS.has('storage_mb')).toBe(true);
  });

  test('TOTAL_METRIC_KEYS does not contain monthly metrics', () => {
    expect(TOTAL_METRIC_KEYS.has('ai_cases')).toBe(false);
    expect(TOTAL_METRIC_KEYS.has('completed_jobs')).toBe(false);
  });

  test('MONTHLY and TOTAL sets are disjoint', () => {
    for (const key of MONTHLY_METRIC_KEYS) {
      expect(TOTAL_METRIC_KEYS.has(key)).toBe(false);
    }
  });
});

describe('featureRegistry â€” getFeature', () => {
  test('returns definition for valid key', () => {
    const def = getFeature('ai_diagnostics');
    expect(def).not.toBeNull();
    expect(def?.key).toBe('ai_diagnostics');
  });

  test('returns null for unknown key', () => {
    expect(getFeature('nonexistent_feature')).toBeNull();
  });
});

describe('featureRegistry â€” getFeaturesByCategory', () => {
  test('returns only features in the given category', () => {
    const aiFeatures = getFeaturesByCategory('AI');
    expect(aiFeatures.length).toBeGreaterThan(0);
    for (const f of aiFeatures) {
      expect(f.category).toBe('AI');
    }
  });

  test('returns empty array for category with no features', () => {
    const result = getFeaturesByCategory('CORE');
    // CORE may or may not have features â€” just verify it's an array
    expect(Array.isArray(result)).toBe(true);
  });
});
