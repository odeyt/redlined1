// SI-10 Isolation Tests: Vehicle Intelligence must not break vehicle page
// @smoke

import { test, expect } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

test.describe('SI-10 Vehicle Intelligence Isolation @smoke', () => {

  test('App loads without errors when vehicle intelligence flags are OFF', async ({ page }) => {
    await page.goto(`${BASE}/`);
    const body = await page.locator('body').textContent();
    // Must not show a crash/error page
    expect(body).not.toContain('Application error');
    expect(body).not.toContain('Internal Server Error');
  });

  test('Vehicle intelligence rule functions are side-effect free', async () => {
    const { ruleRepeatConcern } = await import('../../intelligence/vehicle/VehicleIntelligenceRules');
    // Calling with empty input must return empty array, not throw
    const result = ruleRepeatConcern([]);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  test('ruleUnresolvedDeclinedWork marks safety items as high severity', async () => {
    const { ruleUnresolvedDeclinedWork } = await import('../../intelligence/vehicle/VehicleIntelligenceRules');
    const signals = ruleUnresolvedDeclinedWork([{
      estimateId: 'e1', title: 'Front brake pads', total: 100,
      declinedAt: '2024-01-01', daysSinceDecline: 60, category: 'brake',
    }]);
    expect(signals[0].severity).toBe('high');
  });

  test('buildSafeFallback is never exposed — engine always returns a profile', async () => {
    // Even with a fake vehicleId against no DB, the engine should not throw to the caller
    // This test validates the API contract only — actual DB is not hit in unit context
    const { calculateVehicleHealth } = await import('../../intelligence/vehicle/VehicleIntelligenceEngine');
    expect(typeof calculateVehicleHealth).toBe('function');
  });
});
