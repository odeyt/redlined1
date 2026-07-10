// SI-12: Estimate Follow-Up Engine Tests

import {
  buildFollowUpRecommendation,
  calculateFollowUpPriority,
  calculateFollowUpOpportunityScore,
} from '../../intelligence/service-advisor/EstimateFollowUpEngine';
import type { StaleEstimateRow } from '../../intelligence/service-advisor/EstimateFollowUpEngine';

function makeEstimate(overrides: Partial<StaleEstimateRow> = {}): StaleEstimateRow {
  return {
    id: 'e-test',
    status: 'sent',
    total_amount: 600,
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(), // 20 days old
    sent_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    viewed_at: null,
    approved_at: null,
    declined_at: null,
    customer_id: 'c1',
    vehicle_id: 'v1',
    ...overrides,
  };
}

// ── 13. Follow-up score shows transparent factors ────────────────────────────
test('opportunity score includes factors', () => {
  const estimate = makeEstimate();
  const score = calculateFollowUpOpportunityScore(estimate, { visitCount: 5, hasDeclined: false, hasSafetyFinding: false });
  expect(score.positiveFactors.length + score.negativeFactors.length).toBeGreaterThan(0);
  expect(score.finalScore).toBeGreaterThanOrEqual(0);
  expect(score.finalScore).toBeLessThanOrEqual(100);
  expect(score.baseScore).toBe(50);
});

// ── Repeat customer boosts score ──────────────────────────────────────────────
test('repeat customer adds positive factor', () => {
  const estimate = makeEstimate();
  const score = calculateFollowUpOpportunityScore(estimate, { visitCount: 5, hasDeclined: false, hasSafetyFinding: false });
  expect(score.positiveFactors.some(f => f.key === 'repeat_customer')).toBe(true);
});

// ── Prior decline subtracts from score ───────────────────────────────────────
test('prior decline subtracts from score', () => {
  const estimate = makeEstimate();
  const scoreWithDecline = calculateFollowUpOpportunityScore(estimate, { visitCount: 1, hasDeclined: true, hasSafetyFinding: false });
  const scoreWithout = calculateFollowUpOpportunityScore(estimate, { visitCount: 1, hasDeclined: false, hasSafetyFinding: false });
  expect(scoreWithDecline.finalScore).toBeLessThan(scoreWithout.finalScore);
});

// ── Approved estimate gets high score ─────────────────────────────────────────
test('approved estimate gets high opportunity score', () => {
  const estimate = makeEstimate({ status: 'approved', approved_at: new Date().toISOString() });
  const score = calculateFollowUpOpportunityScore(estimate, { visitCount: 1, hasDeclined: false, hasSafetyFinding: false });
  expect(score.positiveFactors.some(f => f.key === 'already_approved')).toBe(true);
  expect(score.finalScore).toBeGreaterThan(60);
});

// ── Safety finding raises priority ───────────────────────────────────────────
test('safety finding raises priority to critical', () => {
  const estimate = makeEstimate();
  const priority = calculateFollowUpPriority(estimate, { hasSafetyFinding: true, visitCount: 1 });
  expect(priority).toBe('critical');
});

// ── Follow-up recommendation includes actions ────────────────────────────────
test('follow-up recommendation includes suggested actions', () => {
  const estimate = makeEstimate();
  const rec = buildFollowUpRecommendation(estimate, { visitCount: 1, hasDeclined: false, hasSafetyFinding: false });
  expect(rec.suggestedActions.length).toBeGreaterThan(0);
  expect(rec.suggestedActions.some(a => a.actionType === 'call_customer')).toBe(true);
});

// ── Stale estimate gets data quality warning ──────────────────────────────────
test('very old estimate gets data quality warning', () => {
  const estimate = makeEstimate({ created_at: new Date(Date.now() - 70 * 86400000).toISOString() });
  const score = calculateFollowUpOpportunityScore(estimate, { visitCount: 1, hasDeclined: false, hasSafetyFinding: false });
  expect(score.dataQualityWarning).not.toBeNull();
});
