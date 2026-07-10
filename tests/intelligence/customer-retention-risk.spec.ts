// SI-13: Customer Retention Risk Detailed Tests

import { assessRetentionRisk } from '../../intelligence/customer/CustomerRetentionRiskEngine';
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

test('fleet customers get a retention bonus', () => {
  const base = makeCtx({ jobHistory: [{ id: 'j1', createdAt: new Date(Date.now() - 100 * 86400000).toISOString(), status: 'completed', completedAt: null }] });
  const fleet = makeCtx({
    customer: { id: 'cust-1', shopId: 'shop-1', createdAt: '2020-01-01T00:00:00Z', isFleet: true },
    jobHistory: [{ id: 'j1', createdAt: new Date(Date.now() - 100 * 86400000).toISOString(), status: 'completed', completedAt: null }],
  });
  const r1 = assessRetentionRisk(base);
  const r2 = assessRetentionRisk(fleet);
  expect(r2.finalScore).toBeGreaterThan(r1.finalScore);
});

test('multi-vehicle customers score higher', () => {
  const base = makeCtx({
    jobHistory: [{ id: 'j1', createdAt: new Date(Date.now() - 50 * 86400000).toISOString(), status: 'completed', completedAt: null }],
    vehicles: [{ id: 'v1', make: 'Toyota', model: 'Vios', year: 2020, isActive: true }],
  });
  const multi = makeCtx({
    jobHistory: [{ id: 'j1', createdAt: new Date(Date.now() - 50 * 86400000).toISOString(), status: 'completed', completedAt: null }],
    vehicles: [
      { id: 'v1', make: 'Toyota', model: 'Vios', year: 2020, isActive: true },
      { id: 'v2', make: 'Honda', model: 'City', year: 2018, isActive: true },
    ],
  });
  expect(assessRetentionRisk(multi).finalScore).toBeGreaterThanOrEqual(assessRetentionRisk(base).finalScore);
});

test('single-visit lower than repeat customer', () => {
  const recent = new Date(Date.now() - 45 * 86400000).toISOString();
  const single = makeCtx({ jobHistory: [{ id: 'j1', createdAt: recent, status: 'completed', completedAt: null }] });
  const repeat = makeCtx({
    jobHistory: Array.from({ length: 5 }, (_, i) => ({
      id: `j${i}`, createdAt: new Date(Date.now() - i * 60 * 86400000).toISOString(), status: 'completed', completedAt: null,
    })),
  });
  expect(assessRetentionRisk(repeat).finalScore).toBeGreaterThan(assessRetentionRisk(single).finalScore);
});

test('score is clamped to 0-100', () => {
  const ctx = makeCtx({
    jobHistory: Array.from({ length: 20 }, (_, i) => ({
      id: `j${i}`, createdAt: new Date(Date.now() - i * 10 * 86400000).toISOString(), status: 'completed', completedAt: null,
    })),
    customer: { id: 'c', shopId: 's', createdAt: '2015-01-01T00:00:00Z', isFleet: true, isCommercial: true },
    vehicles: [
      { id: 'v1', make: 'Toyota', model: 'Hilux', year: 2020, isActive: true },
      { id: 'v2', make: 'Ford', model: 'Ranger', year: 2022, isActive: true },
    ],
  });
  const result = assessRetentionRisk(ctx);
  expect(result.finalScore).toBeGreaterThanOrEqual(0);
  expect(result.finalScore).toBeLessThanOrEqual(100);
});
