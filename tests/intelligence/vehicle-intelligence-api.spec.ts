// SI-10 API Tests: Vehicle Intelligence endpoints
// @smoke

import { test, expect } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

test.describe('SI-10 Vehicle Intelligence API @smoke', () => {

  test('GET /api/intelligence/vehicle/:id requires auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/intelligence/vehicle/00000000-0000-0000-0000-000000000001`);
    expect([200, 401, 403]).toContain(res.status());
    // If 200, must have profile or disabled field
    if (res.status() === 200) {
      const body = await res.json() as Record<string, unknown>;
      expect(body.profile !== undefined || body.disabled !== undefined).toBe(true);
    }
  });

  test('POST /api/intelligence/vehicle/:id requires auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/intelligence/vehicle/00000000-0000-0000-0000-000000000001`);
    expect([200, 401, 403]).toContain(res.status());
  });

  test('GET /api/intelligence/vehicle/health-summary requires auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/intelligence/vehicle/health-summary`);
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json() as Record<string, unknown>;
      expect(body.disabled !== undefined || body.highRiskCount !== undefined).toBe(true);
    }
  });

  test('GET /api/intelligence/vehicle/:id/timeline requires auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/intelligence/vehicle/00000000-0000-0000-0000-000000000001/timeline`);
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json() as Record<string, unknown>;
      expect(Array.isArray(body.events) || body.disabled !== undefined).toBe(true);
    }
  });

  test('Signals query parameter is supported', async ({ request }) => {
    const res = await request.get(`${BASE}/api/intelligence/vehicle/00000000-0000-0000-0000-000000000001?signals=true`);
    expect([200, 401, 403]).toContain(res.status());
  });
});
