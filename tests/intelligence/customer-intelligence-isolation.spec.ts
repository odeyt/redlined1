// SI-13: Customer Intelligence Isolation Tests

import { test, expect } from '@playwright/test';
import { assessRetentionRisk } from '../../intelligence/customer/CustomerRetentionRiskEngine';
import { scoreCustomerRelationship } from '../../intelligence/customer/CustomerRelationshipScoring';
import { classifyCustomerSegments } from '../../intelligence/customer/CustomerSegmentationEngine';
import { findCustomerOpportunities } from '../../intelligence/customer/CustomerOpportunityEngine';
import { buildCustomerTimeline } from '../../intelligence/customer/CustomerTimelineEngine';
import type { CustomerLifetimeContext } from '../../intelligence/customer/types';

const EMPTY_CTX: CustomerLifetimeContext = {
  shopId: 'shop-1',
  customerId: 'cust-1',
  customer: null,
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
};

test('retention risk engine never throws on empty context', () => {
  expect(() => assessRetentionRisk(EMPTY_CTX)).not.toThrow();
});

test('relationship scoring never throws on empty context', () => {
  expect(() => scoreCustomerRelationship(EMPTY_CTX)).not.toThrow();
});

test('segmentation engine never throws on empty context', () => {
  expect(() => classifyCustomerSegments(EMPTY_CTX, 'shop-1', 'cust-1')).not.toThrow();
});

test('opportunity engine never throws on empty context', () => {
  expect(() => findCustomerOpportunities(EMPTY_CTX)).not.toThrow();
});

test('timeline engine never throws on empty context', () => {
  expect(() => buildCustomerTimeline(EMPTY_CTX)).not.toThrow();
});

test('no engine mutates the input context', () => {
  const ctx = { ...EMPTY_CTX, jobHistory: [] };
  assessRetentionRisk(ctx);
  scoreCustomerRelationship(ctx);
  classifyCustomerSegments(ctx, 'shop-1', 'cust-1');
  findCustomerOpportunities(ctx);
  buildCustomerTimeline(ctx);
  expect(ctx.jobHistory).toHaveLength(0);
  expect(ctx.shopId).toBe('shop-1');
});

test('price_sensitive segment is never primary', () => {
  const ctx: CustomerLifetimeContext = {
    ...EMPTY_CTX,
    customer: { id: 'cust-1', shopId: 'shop-1', createdAt: '2020-01-01T00:00:00Z' },
    estimateHistory: Array.from({ length: 8 }, (_, i) => ({
      id: `e${i}`, totalAmount: 500, currency: 'USD', status: 'declined',
      approvedAt: null, declinedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    })),
  };
  const candidates = classifyCustomerSegments(ctx, 'shop-1', 'cust-1');
  const priceSensitive = candidates.find(c => c.key === 'price_sensitive');
  if (priceSensitive) {
    expect(priceSensitive.isPrimary).toBe(false);
  }
});

test('all opportunities include required action and disclaimer fields', () => {
  const ctx: CustomerLifetimeContext = {
    ...EMPTY_CTX,
    customer: { id: 'cust-1', shopId: 'shop-1', createdAt: '2020-01-01T00:00:00Z' },
    declinedWork: [{ id: 'd1', description: 'Brake pads', estimatedValue: 300, declinedAt: '2024-01-01', reason: null }],
  };
  for (const o of findCustomerOpportunities(ctx)) {
    expect(o.recommendedAction).toBeTruthy();
    expect(o.disclaimer).toBeTruthy();
  }
});
