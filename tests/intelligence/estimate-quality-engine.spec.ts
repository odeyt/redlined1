// SI-12: Estimate Quality Engine Unit Tests

import {
  findMissingDescriptions,
  findUnpricedItems,
  findDuplicateItems,
  findMissingLabor,
  findMissingParts,
  findInspectionEstimateGaps,
  findUnsafeAmbiguity,
  findCurrencyIssues,
  calculateEstimateQualityScore,
} from '../../intelligence/service-advisor/EstimateQualityEngine';
import type { ServiceAdvisorContext, EstimateLine } from '../../intelligence/service-advisor/types';

function makeContext(overrides: Partial<ServiceAdvisorContext> = {}): ServiceAdvisorContext {
  return {
    shopId: 'test-shop',
    sessionId: null,
    customer: null,
    vehicle: null,
    inspection: null,
    estimate: null,
    jobCardConcern: null,
    businessMemorySummary: null,
    repairIntelligenceSummary: null,
    dataQualityWarnings: [],
    builtAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeLine(overrides: Partial<EstimateLine> = {}): EstimateLine {
  return {
    id: 'line-1',
    description: 'Oil Change',
    quantity: 1,
    unitPrice: 50,
    total: 50,
    currency: 'USD',
    lineType: 'labor',
    inspectionFindingId: null,
    ...overrides,
  };
}

// ── 1. Empty estimate returns safe result ─────────────────────────────────────
test('empty estimate returns no issues', () => {
  const ctx = makeContext({ estimate: { estimateId: 'e1', status: 'draft', totalAmount: 0, currency: 'USD', lineCount: 0, lines: [], hasCustomerExplanation: false, sentAt: null, viewedAt: null, approvedAt: null, declinedAt: null, createdAt: new Date().toISOString(), hasLinkedInspection: false } });
  const issues = findMissingDescriptions(ctx);
  expect(issues).toHaveLength(0);
});

// ── 2. Missing description detected ──────────────────────────────────────────
test('detects missing description', () => {
  const ctx = makeContext({ estimate: { estimateId: 'e1', status: 'draft', totalAmount: 50, currency: 'USD', lineCount: 1, lines: [makeLine({ description: '' })], hasCustomerExplanation: false, sentAt: null, viewedAt: null, approvedAt: null, declinedAt: null, createdAt: new Date().toISOString(), hasLinkedInspection: false } });
  const issues = findMissingDescriptions(ctx);
  expect(issues.length).toBeGreaterThan(0);
  expect(issues[0].ruleKey).toBe('missing_description');
});

// ── 3. Zero-price item detected ───────────────────────────────────────────────
test('detects zero-price item', () => {
  const ctx = makeContext({ estimate: { estimateId: 'e1', status: 'draft', totalAmount: 0, currency: 'USD', lineCount: 1, lines: [makeLine({ description: 'Labor', unitPrice: 0, total: 0 })], hasCustomerExplanation: false, sentAt: null, viewedAt: null, approvedAt: null, declinedAt: null, createdAt: new Date().toISOString(), hasLinkedInspection: false } });
  const issues = findUnpricedItems(ctx);
  expect(issues.length).toBeGreaterThan(0);
  expect(issues[0].ruleKey).toBe('zero_price_item');
});

// ── 4. Duplicate line detected ────────────────────────────────────────────────
test('detects duplicate lines', () => {
  const ctx = makeContext({ estimate: { estimateId: 'e1', status: 'draft', totalAmount: 100, currency: 'USD', lineCount: 2, lines: [makeLine({ id: 'l1', description: 'Oil Change' }), makeLine({ id: 'l2', description: 'Oil Change' })], hasCustomerExplanation: false, sentAt: null, viewedAt: null, approvedAt: null, declinedAt: null, createdAt: new Date().toISOString(), hasLinkedInspection: false } });
  const issues = findDuplicateItems(ctx);
  expect(issues.length).toBeGreaterThan(0);
  expect(issues[0].ruleKey).toBe('duplicate_line');
});

// ── 5. Valid estimate is not falsely flagged ──────────────────────────────────
test('valid estimate with good descriptions is not flagged for missing desc', () => {
  const ctx = makeContext({ estimate: { estimateId: 'e1', status: 'draft', totalAmount: 200, currency: 'USD', lineCount: 2, lines: [makeLine({ id: 'l1', description: 'Oil and Filter Change', lineType: 'labor' }), makeLine({ id: 'l2', description: 'Synthetic Motor Oil 5W-30', lineType: 'part', unitPrice: 30, total: 30 })], hasCustomerExplanation: false, sentAt: null, viewedAt: null, approvedAt: null, declinedAt: null, createdAt: new Date().toISOString(), hasLinkedInspection: false } });
  const descIssues = findMissingDescriptions(ctx);
  const dupIssues = findDuplicateItems(ctx);
  const zeroIssues = findUnpricedItems(ctx);
  expect(descIssues).toHaveLength(0);
  expect(dupIssues).toHaveLength(0);
  expect(zeroIssues).toHaveLength(0);
});

// ── 6. Mixed currency issue detection ────────────────────────────────────────
test('detects mixed currency', () => {
  const ctx = makeContext({ estimate: { estimateId: 'e1', status: 'draft', totalAmount: 200, currency: 'USD', lineCount: 2, lines: [makeLine({ id: 'l1', currency: 'USD' }), makeLine({ id: 'l2', currency: 'THB' })], hasCustomerExplanation: false, sentAt: null, viewedAt: null, approvedAt: null, declinedAt: null, createdAt: new Date().toISOString(), hasLinkedInspection: false } });
  const issues = findCurrencyIssues(ctx);
  expect(issues.length).toBeGreaterThan(0);
  expect(issues[0].ruleKey).toBe('mixed_currency');
});

// ── 7. Shop-supplies item not introduced ──────────────────────────────────────
test('does not introduce phantom shop-supplies item', () => {
  const ctx = makeContext({ estimate: { estimateId: 'e1', status: 'draft', totalAmount: 50, currency: 'USD', lineCount: 1, lines: [makeLine()], hasCustomerExplanation: false, sentAt: null, viewedAt: null, approvedAt: null, declinedAt: null, createdAt: new Date().toISOString(), hasLinkedInspection: false } });
  const allIssues = [...findMissingDescriptions(ctx), ...findUnpricedItems(ctx), ...findDuplicateItems(ctx)];
  expect(allIssues.every(i => !i.title.toLowerCase().includes('shop supplies'))).toBe(true);
});

// ── 8. Parts without labor flagged ───────────────────────────────────────────
test('detects parts without labor', () => {
  const ctx = makeContext({ estimate: { estimateId: 'e1', status: 'draft', totalAmount: 50, currency: 'USD', lineCount: 1, lines: [makeLine({ lineType: 'part' })], hasCustomerExplanation: false, sentAt: null, viewedAt: null, approvedAt: null, declinedAt: null, createdAt: new Date().toISOString(), hasLinkedInspection: false } });
  const issues = findMissingLabor(ctx);
  expect(issues.length).toBeGreaterThan(0);
});

// ── 9. Vague description detected ─────────────────────────────────────────────
test('detects vague descriptions', () => {
  const ctx = makeContext({ estimate: { estimateId: 'e1', status: 'draft', totalAmount: 50, currency: 'USD', lineCount: 1, lines: [makeLine({ description: 'Misc repairs' })], hasCustomerExplanation: false, sentAt: null, viewedAt: null, approvedAt: null, declinedAt: null, createdAt: new Date().toISOString(), hasLinkedInspection: false } });
  const issues = findUnsafeAmbiguity(ctx);
  expect(issues.length).toBeGreaterThan(0);
});

// ── 10. Inspection gap detected ───────────────────────────────────────────────
test('detects inspection finding without estimate line', () => {
  const ctx = makeContext({
    estimate: { estimateId: 'e1', status: 'draft', totalAmount: 50, currency: 'USD', lineCount: 1, lines: [makeLine()], hasCustomerExplanation: false, sentAt: null, viewedAt: null, approvedAt: null, declinedAt: null, createdAt: new Date().toISOString(), hasLinkedInspection: true },
    inspection: { inspectionId: 'i1', findings: [{ id: 'f1', category: 'Brakes', name: 'Worn pads', condition: 'worn', notes: null, isSafety: false, hasEstimateLine: false }], completedAt: new Date().toISOString(), technicianNotes: null },
  });
  const issues = findInspectionEstimateGaps(ctx);
  expect(issues.length).toBeGreaterThan(0);
  expect(issues[0].ruleKey).toBe('inspection_gap');
});

// ── 11. Quality score range ───────────────────────────────────────────────────
test('quality score is bounded 0-100', () => {
  const ctx = makeContext({ estimate: { estimateId: 'e1', status: 'draft', totalAmount: 50, currency: 'USD', lineCount: 5, lines: Array(5).fill(null).map((_, i) => makeLine({ id: `l${i}`, description: '', unitPrice: 0, total: 0 })), hasCustomerExplanation: false, sentAt: null, viewedAt: null, approvedAt: null, declinedAt: null, createdAt: new Date().toISOString(), hasLinkedInspection: false } });
  const score = calculateEstimateQualityScore(ctx);
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(100);
});
