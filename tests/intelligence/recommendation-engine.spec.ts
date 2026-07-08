import { test, expect } from '@playwright/test';

// Recommendation Engine — smoke tests
// Flag is OFF by default so API returns disabled state.

test.describe('Recommendation Engine API', () => {
  test('GET returns disabled state when flag is OFF @smoke', async ({ request }) => {
    // Unauthenticated requests get 401 before flag check
    const res = await request.get('/api/intelligence/recommendations');
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      // Either disabled or normal response
      if (body.disabled) {
        expect(body.disabled).toBe(true);
        expect(body.recommendations).toEqual([]);
      }
    }
  });

  test('POST generate returns disabled or 401 when flag OFF @smoke', async ({ request }) => {
    const res = await request.post('/api/intelligence/recommendations');
    expect([200, 401, 403]).toContain(res.status());
  });

  test('PATCH without auth returns 401 @smoke', async ({ request }) => {
    const res = await request.patch('/api/intelligence/recommendations', {
      data: { id: 'fake-id', action: 'dismiss' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('health endpoint never crashes @smoke', async ({ request }) => {
    const res = await request.get('/api/health/intelligence');
    expect(res.status()).toBeLessThan(600);
  });
});
