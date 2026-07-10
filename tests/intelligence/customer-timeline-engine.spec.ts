// SI-13: Customer Timeline Engine Tests

import { buildCustomerTimeline } from '../../intelligence/customer/CustomerTimelineEngine';
import type { CustomerLifetimeContext } from '../../intelligence/customer/types';

function makeCtx(overrides: Partial<CustomerLifetimeContext> = {}): CustomerLifetimeContext {
  return {
    shopId: 'shop-1',
    customerId: 'cust-1',
    customer: { id: 'cust-1', shopId: 'shop-1', createdAt: '2020-01-01T00:00:00Z' },
    vehicles: [],
    jobHistory: [],
    estimateHistory: [],
    invoiceHistory: [],
    declinedWork: [],
    appointmentHistory: [],
    businessMemorySummary: null,
    vehicleIntelligenceSummary: null,
    serviceAdvisorHistory: [],
    dataQualityWarnings: [],
    builtAt: new Date().toISOString(),
    ...overrides,
  };
}

test('returns empty for empty context', () => {
  expect(buildCustomerTimeline(makeCtx())).toHaveLength(0);
});

test('sorts items newest first', () => {
  const ctx = makeCtx({
    jobHistory: [
      { id: 'j1', createdAt: '2023-01-01T00:00:00Z', status: 'completed', completedAt: null },
      { id: 'j2', createdAt: '2024-06-01T00:00:00Z', status: 'completed', completedAt: null },
    ],
  });
  const items = buildCustomerTimeline(ctx);
  expect(new Date(items[0].eventDate).getTime()).toBeGreaterThan(new Date(items[1].eventDate).getTime());
});

test('includes all event types', () => {
  const ctx = makeCtx({
    jobHistory: [{ id: 'j1', createdAt: '2024-01-01T00:00:00Z', status: 'completed', completedAt: null }],
    estimateHistory: [{ id: 'e1', totalAmount: 500, currency: 'USD', status: 'approved', approvedAt: '2024-02-01T00:00:00Z', declinedAt: null, createdAt: '2024-02-01T00:00:00Z' }],
    invoiceHistory: [{ id: 'inv1', totalAmount: 500, status: 'paid', paidAt: '2024-03-01T00:00:00Z', createdAt: '2024-03-01T00:00:00Z' }],
    declinedWork: [{ id: 'd1', description: 'Brake pads', estimatedValue: 200, declinedAt: '2024-04-01T00:00:00Z', reason: null }],
  });
  const types = new Set(buildCustomerTimeline(ctx).map(i => i.eventType));
  expect(types.has('job_card')).toBe(true);
  expect(types.has('estimate')).toBe(true);
  expect(types.has('invoice')).toBe(true);
  expect(types.has('declined_work')).toBe(true);
});

test('caps at 100 items', () => {
  const ctx = makeCtx({
    jobHistory: Array.from({ length: 60 }, (_, i) => ({
      id: `j${i}`, createdAt: new Date(Date.now() - i * 86400000).toISOString(), status: 'completed', completedAt: null,
    })),
    invoiceHistory: Array.from({ length: 60 }, (_, i) => ({
      id: `inv${i}`, totalAmount: 300, status: 'paid', paidAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    })),
  });
  expect(buildCustomerTimeline(ctx).length).toBeLessThanOrEqual(100);
});

test('uses approvedAt date for approved estimate', () => {
  const ctx = makeCtx({
    estimateHistory: [{
      id: 'e1', totalAmount: 500, currency: 'USD', status: 'approved',
      approvedAt: '2024-06-01T00:00:00Z', declinedAt: null, createdAt: '2024-05-01T00:00:00Z',
    }],
  });
  const items = buildCustomerTimeline(ctx);
  expect(items[0].title).toBe('Estimate approved');
  expect(items[0].eventDate).toBe('2024-06-01T00:00:00Z');
});
