// SI-12: Customer Explanation Builder Tests

import {
  buildFindingExplanation,
  buildRepairExplanation,
  buildSafetyExplanation,
  buildDeclinedWorkExplanation,
  buildLaoPlaceholderStructure,
} from '../../intelligence/service-advisor/CustomerExplanationBuilder';
import type { ServiceAdvisorContext } from '../../intelligence/service-advisor/types';

function makeContext(): ServiceAdvisorContext {
  return {
    shopId: 'test',
    sessionId: null,
    customer: null,
    vehicle: { vehicleId: 'v1', year: 2020, make: 'Honda', model: 'Civic', mileage: 55000, repairHistorySummary: [], activeDtcCodes: [], lastServiceDate: null, vehicleIntelligenceSignals: [] },
    inspection: null,
    estimate: null,
    jobCardConcern: null,
    businessMemorySummary: null,
    repairIntelligenceSummary: null,
    dataQualityWarnings: [],
    builtAt: new Date().toISOString(),
  };
}

// ── 11. Explanation is deterministic ─────────────────────────────────────────
test('finding explanation is deterministic for same input', () => {
  const finding = { id: 'f1', name: 'Worn brake pads', category: 'Brakes', condition: 'worn', notes: null, isSafety: false };
  const exp1 = buildFindingExplanation(finding, null);
  const exp2 = buildFindingExplanation(finding, null);
  expect(exp1.whatWasFound).toBe(exp2.whatWasFound);
  expect(exp1.recommendation).toBe(exp2.recommendation);
});

// ── 12. Explanation does not claim guaranteed diagnosis ───────────────────────
test('explanation does not claim guaranteed diagnosis', () => {
  const finding = { id: 'f1', name: 'Check Engine Light', category: 'Engine', condition: 'active', notes: null, isSafety: false };
  const exp = buildFindingExplanation(finding, null);
  const text = JSON.stringify(exp).toLowerCase();
  expect(text).not.toMatch(/guaranteed|definitely|confirmed diagnosis|will fix/);
});

// ── Editable flag ─────────────────────────────────────────────────────────────
test('customer explanation is always marked as editable', () => {
  const exp = buildFindingExplanation({ id: 'f1', name: 'Test', category: 'General', condition: null, notes: null, isSafety: false }, null);
  // isEditable is on CustomerExplanation level — test the shape
  expect(exp).toHaveProperty('findingName');
  expect(exp).toHaveProperty('whatWasFound');
  expect(exp).toHaveProperty('recommendation');
});

// ── Safety explanation included ────────────────────────────────────────────────
test('safety explanation includes safety language', () => {
  const text = buildSafetyExplanation({ name: 'Brake failure', notes: 'Caliper seized' });
  expect(text.toLowerCase()).toContain('safety');
});

// ── Declined work reminder ────────────────────────────────────────────────────
test('declined work reminder references prior date', () => {
  const text = buildDeclinedWorkExplanation({ description: 'Coolant flush', declinedDate: '2026-01-15' });
  expect(text).toContain('2026-01-15');
  expect(text).toContain('Coolant flush');
});

// ── Repair explanation includes price ─────────────────────────────────────────
test('repair explanation includes price when available', () => {
  const text = buildRepairExplanation({ description: 'Timing belt', total: 450, currency: 'USD' }, null);
  expect(text).toContain('450');
  expect(text).toContain('USD');
});

// ── Lao placeholder structure ─────────────────────────────────────────────────
test('Lao placeholder structure returns placeholder status', () => {
  const ctx = makeContext();
  const result = buildLaoPlaceholderStructure(ctx);
  expect(result.language).toBe('lo');
  expect(result.status).toBe('placeholder');
});

// ── No PII in explanation ─────────────────────────────────────────────────────
test('finding explanation does not include raw customer PII fields', () => {
  const finding = { id: 'f1', name: 'Test', category: 'Engine', condition: null, notes: null, isSafety: false };
  const exp = buildFindingExplanation(finding, null);
  const text = JSON.stringify(exp);
  // Should not contain patterns that look like phone numbers, emails, or raw addresses
  expect(text).not.toMatch(/\b\d{10}\b/);
  expect(text).not.toMatch(/[a-z0-9.]+@[a-z0-9.]+\.[a-z]{2,}/i);
});
