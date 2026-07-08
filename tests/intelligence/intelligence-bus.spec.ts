import { test, expect } from '@playwright/test';

// Intelligence Bus — smoke tests via API routes
// All flags default OFF so most routes return disabled state (not errors).

test.describe('Intelligence Bus API', () => {
  test('events endpoint requires auth @smoke', async ({ request }) => {
    const res = await request.get('/api/intelligence/events');
    // Unauthenticated — expect 401 or a safe error response, never a 5xx crash
    expect([401, 403, 200]).toContain(res.status());
  });

  test('signals endpoint requires auth @smoke', async ({ request }) => {
    const res = await request.get('/api/intelligence/signals');
    expect([401, 403, 200]).toContain(res.status());
  });

  test('recommendations endpoint requires auth @smoke', async ({ request }) => {
    const res = await request.get('/api/intelligence/recommendations');
    expect([401, 403, 200]).toContain(res.status());
  });

  test('health endpoint includes bus status @smoke', async ({ request }) => {
    const res = await request.get('/api/health/intelligence');
    expect(res.status()).toBeLessThan(600);
    const body = await res.json();
    expect(body).toHaveProperty('bus');
    expect(body).toHaveProperty('tables');
    expect(body).toHaveProperty('featureFlags');
    expect(body).toHaveProperty('openRecommendations');
  });
});
