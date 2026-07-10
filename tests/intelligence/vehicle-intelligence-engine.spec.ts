// SI-10 Smoke Tests: Vehicle Intelligence Engine
// @smoke

import { test, expect } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

test.describe('SI-10 Vehicle Intelligence Engine @smoke', () => {

  test('API returns disabled:true when flags are OFF', async ({ request }) => {
    const res = await request.get(`${BASE}/api/intelligence/vehicle/00000000-0000-0000-0000-000000000001`);
    // 401 (not authenticated) or 200 with disabled:true — both acceptable
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json() as { disabled?: boolean };
      expect(body.disabled).toBe(true);
    }
  });

  test('Health summary endpoint is reachable', async ({ request }) => {
    const res = await request.get(`${BASE}/api/intelligence/vehicle/health-summary`);
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json() as { disabled?: boolean; highRiskCount?: number };
      expect(body).toBeDefined();
    }
  });

  test('Timeline endpoint is reachable', async ({ request }) => {
    const res = await request.get(`${BASE}/api/intelligence/vehicle/00000000-0000-0000-0000-000000000001/timeline`);
    expect([200, 401]).toContain(res.status());
  });

  test('calculateVehicleHealth returns healthy for zero-risk context', async () => {
    // Unit-level import test — only runs in Node context
    const { calculateVehicleHealth } = await import('../../intelligence/vehicle/VehicleIntelligenceEngine');
    const ctx = {
      shopId: 'x', vehicleId: 'y',
      visitCount: 5, completedJobCount: 3, repairCaseCount: 3, comebackCount: 0,
      declinedEstimateCount: 0, unpaidInvoiceCount: 0, openEstimateCount: 0,
      concerns: [], dtcs: [], parts: [], declinedWork: [], repairLessons: [],
      latestMileage: null, totalRevenue: 0, hasCompleteHistory: true,
    };
    const { score, status } = calculateVehicleHealth(ctx);
    expect(score).toBeGreaterThanOrEqual(80);
    expect(status).toBe('healthy');
  });

  test('calculateVehicleHealth returns high_risk for worst-case context', async () => {
    const { calculateVehicleHealth } = await import('../../intelligence/vehicle/VehicleIntelligenceEngine');
    const ctx = {
      shopId: 'x', vehicleId: 'y',
      visitCount: 1, completedJobCount: 1, repairCaseCount: 0, comebackCount: 3,
      declinedEstimateCount: 1, unpaidInvoiceCount: 2, openEstimateCount: 3,
      concerns: [{ category: 'Engine', count: 3, lastSeen: '2024-01-01' }],
      dtcs: [{ code: 'P0300', description: '', count: 2, firstSeen: '2024-01-01', lastSeen: '2024-06-01', resolved: false }],
      parts: [],
      declinedWork: [{
        estimateId: 'e1', title: 'Brake pads', total: 200, declinedAt: '2024-01-01',
        daysSinceDecline: 180, category: 'brake',
      }],
      repairLessons: [],
      latestMileage: null, totalRevenue: 0, hasCompleteHistory: false,
    };
    const { score, status } = calculateVehicleHealth(ctx);
    expect(score).toBeLessThan(40);
    expect(status).toBe('high_risk');
  });
});
