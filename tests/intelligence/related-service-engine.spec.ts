// SI-12: Related Service Engine Unit Tests

import {
  findPreviouslyDeclinedWork,
  findInspectionRelatedItems,
  findRepairBundlePatterns,
  deduplicateSuggestions,
} from '../../intelligence/service-advisor/RelatedServiceEngine';
import type { ServiceAdvisorContext } from '../../intelligence/service-advisor/types';

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

// ── 8. Related service requires evidence ──────────────────────────────────────
test('declined work suggestion includes evidence', () => {
  const ctx = makeContext({
    customer: {
      customerId: 'c1', visitCount: 3, lastVisitDate: null, averageInvoiceValue: null, unpaidBalance: null,
      approvalHistoryRate: null, priorDeclinedCount: 1,
      priorDeclinedItems: [{ serviceId: null, description: 'Brake pad replacement', estimatedValue: 200, declinedDate: '2026-01-01', reason: null }],
      repeatConcerns: [],
    },
  });
  const suggestions = findPreviouslyDeclinedWork(ctx);
  expect(suggestions.length).toBeGreaterThan(0);
  expect(suggestions[0].evidence.length).toBeGreaterThan(0);
  expect(suggestions[0].requiresInspectionConfirmation).toBe(true);
});

// ── 9. Unsupported upsell not generated ───────────────────────────────────────
test('no suggestions generated when no evidence exists', () => {
  const ctx = makeContext();
  const declined = findPreviouslyDeclinedWork(ctx);
  const inspection = findInspectionRelatedItems(ctx);
  const bundles = findRepairBundlePatterns(ctx);
  expect(declined).toHaveLength(0);
  expect(inspection).toHaveLength(0);
  expect(bundles).toHaveLength(0);
});

// ── 10. Declined work appears as suggestion ───────────────────────────────────
test('declined work surfaces as a suggestion', () => {
  const ctx = makeContext({
    customer: {
      customerId: 'c1', visitCount: 1, lastVisitDate: null, averageInvoiceValue: null, unpaidBalance: null,
      approvalHistoryRate: null, priorDeclinedCount: 1,
      priorDeclinedItems: [{ serviceId: null, description: 'Transmission flush', estimatedValue: 350, declinedDate: '2025-11-01', reason: null }],
      repeatConcerns: [],
    },
  });
  const suggestions = findPreviouslyDeclinedWork(ctx);
  expect(suggestions.some(s => s.title.includes('Transmission flush'))).toBe(true);
});

// ── Deduplication ─────────────────────────────────────────────────────────────
test('deduplicates suggestions by key', () => {
  const dupe = {
    suggestionKey: 'same_key',
    title: 'Test',
    relevanceReason: 'reason',
    evidence: [],
    confidence: 0.7,
    estimatedRevenue: null,
    requiresInspectionConfirmation: true,
    disclaimer: '',
  };
  const deduped = deduplicateSuggestions([dupe, dupe, { ...dupe, suggestionKey: 'other_key' }]);
  expect(deduped).toHaveLength(2);
});

// ── Safety findings surface as high confidence ────────────────────────────────
test('safety inspection finding has high confidence', () => {
  const ctx = makeContext({
    inspection: {
      inspectionId: 'i1',
      findings: [{ id: 'f1', category: 'Brakes', name: 'Metal on metal brakes', condition: 'danger', notes: null, isSafety: true, hasEstimateLine: false }],
      completedAt: new Date().toISOString(),
      technicianNotes: null,
    },
  });
  const suggestions = findInspectionRelatedItems(ctx);
  expect(suggestions.some(s => s.confidence >= 0.85)).toBe(true);
});

// ── Alignment suggestion with evidence ───────────────────────────────────────
test('alignment suggestion appears with suspension line evidence', () => {
  const ctx = makeContext({
    estimate: {
      estimateId: 'e1', status: 'draft', totalAmount: 500, currency: 'USD', lineCount: 1,
      lines: [{ id: 'l1', description: 'Lower control arm replacement', quantity: 1, unitPrice: 500, total: 500, currency: 'USD', lineType: 'labor', inspectionFindingId: null }],
      hasCustomerExplanation: false, sentAt: null, viewedAt: null, approvedAt: null, declinedAt: null,
      createdAt: new Date().toISOString(), hasLinkedInspection: false,
    },
    vehicle: { vehicleId: 'v1', year: 2018, make: 'Toyota', model: 'Camry', mileage: 90000, repairHistorySummary: [], activeDtcCodes: [], lastServiceDate: null, vehicleIntelligenceSignals: [] },
  });
  const suggestions = findRepairBundlePatterns(ctx);
  expect(suggestions.some(s => s.suggestionKey === 'alignment_after_suspension')).toBe(true);
});
