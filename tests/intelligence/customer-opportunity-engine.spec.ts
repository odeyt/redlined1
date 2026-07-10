// SI-13: Customer Opportunity Engine Tests

import { findCustomerOpportunities } from '../../intelligence/customer/CustomerOpportunityEngine';
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

test('returns empty array for customer with no history', () => {
  expect(findCustomerOpportunities(makeCtx())).toHaveLength(0);
});

test('surfaces declined work opportunity', () => {
  const ctx = makeCtx({
    declinedWork: [
      { id: 'd1', description: 'Brake pad replacement', estimatedValue: 250, declinedAt: '2024-01-01T00:00:00Z', reason: 'Too expensive' },
      { id: 'd2', description: 'Timing belt', estimatedValue: 800, declinedAt: '2024-03-01T00:00:00Z', reason: null },
    ],
  });
  const opps = findCustomerOpportunities(ctx);
  const declined = opps.find(o => o.opportunityType === 'declined_work_re_engagement');
  expect(declined).toBeDefined();
  expect(declined!.evidence.length).toBeGreaterThan(0);
});

test('all opportunities include a disclaimer', () => {
  const ctx = makeCtx({
    declinedWork: [{ id: 'd1', description: 'Brake pads', estimatedValue: 250, declinedAt: '2024-01-01', reason: null }],
    jobHistory: [{ id: 'j1', createdAt: new Date(Date.now() - 200 * 86400000).toISOString(), status: 'completed', completedAt: null }],
    vehicles: [{ id: 'v1', make: 'Toyota', model: 'Vios', year: 2020, isActive: true }],
  });
  for (const opp of findCustomerOpportunities(ctx)) {
    expect(opp.disclaimer).toBeTruthy();
    expect(opp.disclaimer.length).toBeGreaterThan(5);
  }
});

test('result is capped at 5 opportunities', () => {
  const ctx = makeCtx({
    declinedWork: Array.from({ length: 3 }, (_, i) => ({
      id: `d${i}`, description: `Item ${i}`, estimatedValue: 200, declinedAt: '2024-01-01', reason: null,
    })),
    jobHistory: [{ id: 'j1', createdAt: new Date(Date.now() - 200 * 86400000).toISOString(), status: 'completed', completedAt: null }],
    vehicles: [
      { id: 'v1', make: 'Toyota', model: 'Vios', year: 2020, isActive: true },
      { id: 'v2', make: 'Honda', model: 'City', year: 2019, isActive: true },
    ],
    vehicleIntelligenceSummary: 'Brake wear signal detected',
    customer: { id: 'cust-1', shopId: 'shop-1', createdAt: '2020-01-01T00:00:00Z', isFleet: true },
  });
  expect(findCustomerOpportunities(ctx).length).toBeLessThanOrEqual(5);
});

test('maintenance opportunity surfaces after 90+ days', () => {
  const ctx = makeCtx({
    jobHistory: [{ id: 'j1', createdAt: new Date(Date.now() - 120 * 86400000).toISOString(), status: 'completed', completedAt: null }],
    vehicles: [{ id: 'v1', make: 'Toyota', model: 'Vios', year: 2020, isActive: true }],
  });
  const opps = findCustomerOpportunities(ctx);
  expect(opps.some(o => o.opportunityType === 'maintenance_interval')).toBe(true);
});
