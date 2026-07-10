// SI-13: Customer Segmentation Engine Tests

import { test, expect } from '@playwright/test';
import { classifyCustomerSegments, getPrimarySegment } from '../../intelligence/customer/CustomerSegmentationEngine';
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

test('returns limited_data for customer with no history', () => {
  const ctx = makeCtx();
  const candidates = classifyCustomerSegments(ctx, 'shop-1', 'cust-1');
  expect(getPrimarySegment(candidates)).toBe('limited_data');
});

test('classifies VIP for long-term high-revenue customer', () => {
  const ctx = makeCtx({
    jobHistory: Array.from({ length: 12 }, (_, i) => ({
      id: `j${i}`, createdAt: new Date(Date.now() - i * 30 * 86400000).toISOString(), status: 'completed', completedAt: null,
    })),
    invoiceHistory: Array.from({ length: 10 }, (_, i) => ({
      id: `inv${i}`, totalAmount: 700, status: 'paid', paidAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    })),
  });
  const candidates = classifyCustomerSegments(ctx, 'shop-1', 'cust-1');
  expect(candidates.some(c => c.key === 'vip')).toBe(true);
  expect(getPrimarySegment(candidates)).toBe('vip');
});

test('classifies new_customer for recent account with single visit', () => {
  const ctx = makeCtx({
    customer: { id: 'cust-1', shopId: 'shop-1', createdAt: new Date(Date.now() - 30 * 86400000).toISOString() },
    jobHistory: [{ id: 'j1', createdAt: new Date(Date.now() - 30 * 86400000).toISOString(), status: 'completed', completedAt: null }],
  });
  const candidates = classifyCustomerSegments(ctx, 'shop-1', 'cust-1');
  expect(candidates.some(c => c.key === 'new_customer')).toBe(true);
});

test('classifies fleet for fleet-flagged customer', () => {
  const ctx = makeCtx({
    customer: { id: 'cust-1', shopId: 'shop-1', createdAt: '2020-01-01T00:00:00Z', isFleet: true },
  });
  const candidates = classifyCustomerSegments(ctx, 'shop-1', 'cust-1');
  expect(candidates.some(c => c.key === 'fleet')).toBe(true);
});

test('price_sensitive segment is never primary', () => {
  const ctx = makeCtx({
    estimateHistory: Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`, totalAmount: 500, currency: 'USD', status: 'declined',
      approvedAt: null, declinedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    })),
  });
  const candidates = classifyCustomerSegments(ctx, 'shop-1', 'cust-1');
  const priceSensitive = candidates.find(c => c.key === 'price_sensitive');
  if (priceSensitive) {
    expect(priceSensitive.isPrimary).toBe(false);
  }
});

test('classifies at_risk for customer absent 300 days with history', () => {
  const oldDate = new Date(Date.now() - 300 * 86400000);
  const ctx = makeCtx({
    jobHistory: Array.from({ length: 5 }, (_, i) => ({
      id: `j${i}`, createdAt: new Date(oldDate.getTime() - i * 60 * 86400000).toISOString(), status: 'completed', completedAt: null,
    })),
  });
  const candidates = classifyCustomerSegments(ctx, 'shop-1', 'cust-1');
  expect(candidates.some(c => c.key === 'at_risk')).toBe(true);
});
