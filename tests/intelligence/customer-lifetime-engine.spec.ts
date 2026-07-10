// SI-13: Customer Lifetime Engine Tests

import { test, expect } from '@playwright/test';
import { assessRetentionRisk } from '../../intelligence/customer/CustomerRetentionRiskEngine';
import { scoreCustomerRelationship } from '../../intelligence/customer/CustomerRelationshipScoring';
import type { CustomerLifetimeContext } from '../../intelligence/customer/types';

function makeCtx(overrides: Partial<CustomerLifetimeContext> = {}): CustomerLifetimeContext {
  return {
    shopId: 'shop-1',
    customerId: 'cust-1',
    customer: { id: 'cust-1', shopId: 'shop-1', createdAt: '2022-01-01T00:00:00Z' },
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

test('retention risk returns unknown for null customer', () => {
  const ctx = makeCtx({ customer: null });
  const result = assessRetentionRisk(ctx);
  expect(result.risk).toBe('unknown');
  expect(result.confidence).toBe(0);
});

test('retention risk returns low for recent active repeat customer', () => {
  const ctx = makeCtx({
    jobHistory: Array.from({ length: 8 }, (_, i) => ({
      id: `job-${i}`,
      createdAt: new Date(Date.now() - i * 60 * 86400000).toISOString(),
      status: 'completed',
      completedAt: null,
    })),
  });
  const result = assessRetentionRisk(ctx);
  expect(result.risk).toBe('low');
  expect(result.finalScore).toBeGreaterThan(70);
});

test('retention risk returns critical for long-absent customer', () => {
  const oldDate = new Date(Date.now() - 600 * 86400000);
  const ctx = makeCtx({
    jobHistory: [
      { id: 'j1', createdAt: oldDate.toISOString(), status: 'completed', completedAt: null },
      { id: 'j2', createdAt: new Date(oldDate.getTime() - 30 * 86400000).toISOString(), status: 'completed', completedAt: null },
    ],
  });
  const result = assessRetentionRisk(ctx);
  expect(result.risk).toBe('critical');
});

test('retention risk penalises multiple unpaid invoices', () => {
  const recentDate = new Date(Date.now() - 45 * 86400000).toISOString();
  const base = makeCtx({ jobHistory: [{ id: 'j1', createdAt: recentDate, status: 'completed', completedAt: null }] });
  const withUnpaid = makeCtx({
    jobHistory: [{ id: 'j1', createdAt: recentDate, status: 'completed', completedAt: null }],
    invoiceHistory: [
      { id: 'inv1', totalAmount: 500, status: 'open', paidAt: null, createdAt: recentDate },
      { id: 'inv2', totalAmount: 300, status: 'open', paidAt: null, createdAt: recentDate },
    ],
  });
  const r1 = assessRetentionRisk(base);
  const r2 = assessRetentionRisk(withUnpaid);
  expect(r2.finalScore).toBeLessThan(r1.finalScore);
});

test('relationship scoring returns unknown for no data', () => {
  const ctx = makeCtx({ customer: null });
  const result = scoreCustomerRelationship(ctx);
  expect(result.status).toBe('unknown');
});

test('relationship scoring higher for customers with many paid invoices', () => {
  const ctx = makeCtx({
    jobHistory: Array.from({ length: 12 }, (_, i) => ({
      id: `j${i}`, createdAt: new Date(Date.now() - i * 30 * 86400000).toISOString(), status: 'completed', completedAt: null,
    })),
    invoiceHistory: Array.from({ length: 8 }, (_, i) => ({
      id: `inv${i}`, totalAmount: 300, status: 'paid', paidAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    })),
  });
  const result = scoreCustomerRelationship(ctx);
  expect(result.score).toBeGreaterThan(70);
  expect(['excellent', 'strong', 'stable'].includes(result.status)).toBe(true);
});
