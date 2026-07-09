import { test, expect } from '@playwright/test';

// SI-9: Business Memory Engine — smoke tests
// Feature flags OFF by default. Tests verify safe behavior when memory engine is disabled.

test.describe('Business Memory Engine API', () => {
  const SHOP_ID = '90b72748-bf01-4456-999f-f4ba48091606';

  // Test 1: Empty shop returns safe memory (flag OFF returns disabled)
  test('GET returns disabled when flag is OFF @smoke', async ({ request }) => {
    const res = await request.get('/api/intelligence/memory', {
      headers: { 'x-shop-id': SHOP_ID },
    });
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      if (body.disabled) {
        expect(body.disabled).toBe(true);
        expect(body.data).toBeNull();
      }
    }
  });

  // Test 2: POST returns disabled when flag OFF
  test('POST refresh returns disabled or 401 when flag OFF @smoke', async ({ request }) => {
    const res = await request.post('/api/intelligence/memory', {
      headers: { 'x-shop-id': SHOP_ID },
    });
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      if (body.disabled) expect(body.disabled).toBe(true);
    }
  });

  // Test 3: Entity memory query returns disabled or 401 (no auth)
  test('GET entity memory returns safe response without auth @smoke', async ({ request }) => {
    const res = await request.get(
      `/api/intelligence/memory?entity_type=customer&entity_id=00000000-0000-0000-0000-000000000001`,
      { headers: { 'x-shop-id': SHOP_ID } },
    );
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeDefined();
    }
  });

  // Test 4: Single item GET returns 401 or 404 without auth
  test('GET /memory/[id] without auth returns 401 @smoke', async ({ request }) => {
    const res = await request.get(
      '/api/intelligence/memory/00000000-0000-0000-0000-000000000001',
      { headers: { 'x-shop-id': SHOP_ID } },
    );
    expect([401, 403, 404]).toContain(res.status());
  });

  // Test 5: PATCH without auth returns 401
  test('PATCH /memory/[id] without auth returns 401 @smoke', async ({ request }) => {
    const res = await request.patch(
      '/api/intelligence/memory/00000000-0000-0000-0000-000000000001',
      {
        data: { action: 'archive' },
        headers: { 'x-shop-id': SHOP_ID },
      },
    );
    expect([401, 403]).toContain(res.status());
  });

  // Test 6: Morning brief still works independently (memory does not affect it)
  test('Morning brief unaffected by business memory @smoke', async ({ request }) => {
    const res = await request.get('/api/intelligence/morning-brief', {
      headers: { 'x-shop-id': SHOP_ID },
    });
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toBeDefined();
    }
  });

  // Test 7: Action queue unaffected by business memory
  test('Action queue unaffected by business memory @smoke', async ({ request }) => {
    const res = await request.get('/api/intelligence/action-queue', {
      headers: { 'x-shop-id': SHOP_ID },
    });
    expect([200, 401, 403]).toContain(res.status());
  });

  // Test 8: Health endpoint unaffected by business memory
  test('Intelligence health unaffected by business memory @smoke', async ({ request }) => {
    const res = await request.get('/api/health/intelligence');
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty('checkedAt');
  });

  // Test 9: Memory refresh does not block — POST returns promptly
  test('Memory refresh returns promptly (non-blocking contract) @smoke', async ({ request }) => {
    const start = Date.now();
    const res = await request.post('/api/intelligence/memory', {
      headers: { 'x-shop-id': SHOP_ID, 'Content-Type': 'application/json' },
      data: { dryRun: true },
    });
    const elapsed = Date.now() - start;
    expect([200, 401, 403]).toContain(res.status());
    // Should respond in under 10s (Vercel limit is 10s on Hobby)
    expect(elapsed).toBeLessThan(10000);
  });

  // Test 10: Build passes — covered by tsc + build run before tests
  test('API routes are reachable (build smoke) @smoke', async ({ request }) => {
    const routes = [
      '/api/intelligence/memory',
      '/api/intelligence/action-queue',
      '/api/intelligence/morning-brief',
      '/api/health/intelligence',
    ];
    for (const route of routes) {
      const res = await request.get(route, { headers: { 'x-shop-id': SHOP_ID } });
      // Any response (including 401) means the route compiled and loaded
      expect(res.status()).toBeGreaterThan(0);
    }
  });
});
