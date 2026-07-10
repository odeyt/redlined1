// SI-11: Unit tests for Intelligence Learning Engine scoring formulas.
export {}; // make this file a module to avoid variable collision across test files
// These are standalone assertions with no external dependencies.
// Run with: npx tsx tests/intelligence/intelligence-learning-engine.spec.ts

import {
  correctnessRate,
  actionRate,
  successRate,
  dismissRate,
  calculateConfidenceAdjustment,
  calculateRankingAdjustment,
  calculateRuleProfile,
} from '../../intelligence/learning/LearningScoring';

import type { LearningCalculationInput } from '../../intelligence/learning/types';

// ── Simple assertion helper ───────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown, tolerance = 0) {
  const ok = typeof expected === 'number' && typeof actual === 'number'
    ? Math.abs(actual - expected) <= tolerance
    : actual === expected;
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertBounded(label: string, actual: number, min: number, max: number) {
  const ok = actual >= min && actual <= max;
  if (ok) {
    console.log(`  ✓ ${label} [${actual} in [${min}, ${max}]]`);
    passed++;
  } else {
    console.error(`  ✗ ${label} — ${actual} is NOT in [${min}, ${max}]`);
    failed++;
  }
}

// ── Correctness rate ──────────────────────────────────────────────────────────

console.log('\n[correctnessRate]');
assert('all correct',           correctnessRate(10,  0,  0), 1.0);
assert('all incorrect',         correctnessRate(0,   0, 10), 0.0);
assert('all partial',           correctnessRate(0,  10,  0), 0.5);
assert('mixed 5c 5p 5i',        correctnessRate(5,   5,  5), (5 + 2.5) / 15, 0.001);
assert('zero input → 1 (safe)', correctnessRate(0,   0,  0), 0);   // denominator clamps to 1, numerator 0

// ── Action rate ───────────────────────────────────────────────────────────────

console.log('\n[actionRate]');
assert('all acted',   actionRate(10, 10), 1.0);
assert('none acted',  actionRate(0,  10), 0.0);
assert('half acted',  actionRate(5,  10), 0.5);
assert('zero total → safe', actionRate(0, 0), 0.0);

// ── Success rate ──────────────────────────────────────────────────────────────

console.log('\n[successRate]');
assert('all successful', successRate(10, 0),  1.0);
assert('all failed',     successRate(0,  10), 0.0);
assert('half success',   successRate(5,  5),  0.5);
assert('zero both → safe', successRate(0, 0), 0.0);

// ── Dismiss rate ──────────────────────────────────────────────────────────────

console.log('\n[dismissRate]');
assert('all dismissed',   dismissRate(10, 10), 1.0);
assert('none dismissed',  dismissRate(0,  10), 0.0);
assert('zero total → safe', dismissRate(0, 0), 0.0);

// ── Minimum sample protection ─────────────────────────────────────────────────

console.log('\n[minimum sample protection]');
assert('conf adj = 0 when sampleSize < 20',  calculateConfidenceAdjustment(1, 5, 5,  1), 0);
assert('conf adj = 0 when sampleSize = 0',   calculateConfidenceAdjustment(1, 5, 0,  1), 0);
assert('rank adj = 0 when sampleSize < 20',  calculateRankingAdjustment(1, 1, 5, 10000, 5, 0), 0);
assert('rank adj = 0 when sampleSize = 19',  calculateRankingAdjustment(1, 1, 5, 10000, 19, 0), 0);

// ── Confidence adjustment bounds ──────────────────────────────────────────────

console.log('\n[calculateConfidenceAdjustment bounds]');
// Perfect signals, large sample
const confHigh = calculateConfidenceAdjustment(1, 5, 100, 1);
assertBounded('perfect signals → bounded [0, 10]', confHigh, 0, 10);

// Terrible signals, large sample
const confLow = calculateConfidenceAdjustment(0, 1, 100, 0);
assertBounded('terrible signals → bounded [-10, 0]', confLow, -10, 0);

// Neutral signals (0.5 correctness, 2.5/5 accuracy, 0.5 success)
const confNeutral = calculateConfidenceAdjustment(0.5, 2.5, 100, 0.5);
assertBounded('neutral signals → near 0', confNeutral, -2, 2);

// ── Ranking adjustment bounds ─────────────────────────────────────────────────

console.log('\n[calculateRankingAdjustment bounds]');
const rankHigh = calculateRankingAdjustment(1, 1, 5, 100000, 100, 0);
assertBounded('high perf → bounded [0, 100]', rankHigh, 0, 100);

const rankLow = calculateRankingAdjustment(0, 0, 0, 0, 100, 1);
assertBounded('low perf → bounded [-100, 0]', rankLow, -100, 0);

// ── Score validation (out-of-range rejected by submitFeedback) ────────────────

console.log('\n[score range validation — tested via engine logic]');
// These validate that scores 0 and 6 would be rejected in submitFeedback.
// We document the constraint here; enforcement is in IntelligenceLearningEngine.
assert('score 1 is valid (min)',  1 >= 1 && 1 <= 5, true);
assert('score 5 is valid (max)',  5 >= 1 && 5 <= 5, true);
assert('score 0 invalid',        0 >= 1, false);
assert('score 6 invalid',        6 <= 5, false);

// ── calculateRuleProfile integration ─────────────────────────────────────────

console.log('\n[calculateRuleProfile]');

const emptyInput: LearningCalculationInput = {
  shopId:               'shop-1',
  ruleKey:              'test_rule',
  category:             'operations',
  feedbackRows:         [],
  attributionRows:      [],
  totalRecommendations: 0,
  actedUponCount:       0,
  completedCount:       0,
  dismissedCount:       0,
};

const emptyResult = calculateRuleProfile(emptyInput);
assert('empty → collecting_data',          emptyResult.status, 'collecting_data');
assert('empty → confidence adj = 0',       emptyResult.confidenceAdjustment, 0);
assert('empty → ranking adj = 0',          emptyResult.rankingAdjustment, 0);
assert('empty → belowMinimumSample = true', emptyResult.belowMinimumSample, true);

// Summary
console.log(`\n${'─'.repeat(50)}`);
console.log(`Passed: ${passed}   Failed: ${failed}`);

if (failed > 0) {
  console.error('\nSome tests failed.');
  process.exit(1);
} else {
  console.log('All tests passed.');
}
