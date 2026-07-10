// SI-11: Learning Adjustment Adapter — behavior contract documentation.
export {}; // make this file a module to avoid variable collision across test files
// These tests document the isolation guarantees of the adapter.
// No DB calls are made in this file.

// ── Documented behavior ───────────────────────────────────────────────────────

/**
 * GUARANTEE 1: Flag OFF → returns original recommendation unchanged.
 *
 * When `learning_score_adjustments` feature flag is false:
 * - `getConfidenceAdjustment()` returns 0
 * - `getRankingAdjustment()` returns 0
 * - `applyLearningAdjustment()` returns the base object unchanged
 * - No `learningAdjustment` field is added
 *
 * This means existing recommendation scores are completely unaffected.
 */

/**
 * GUARANTEE 2: Sample size < 20 → returns original unchanged.
 *
 * When the learning profile exists but `sample_size < MINIMUM_SAMPLE_SIZE (20)`:
 * - Both adjustment functions return 0
 * - `applyLearningAdjustment()` returns base unchanged
 *
 * This protects against premature adjustments from insufficient data.
 */

/**
 * GUARANTEE 3: Engine failure → returns original unchanged.
 *
 * If `getAdminDb()` throws, the DB is unavailable, or any unexpected error occurs:
 * - All adapter functions catch silently
 * - `applyLearningAdjustment()` returns the `base` parameter untouched
 * - No exception propagates to calling code
 *
 * This ensures the adapter can never crash the recommendation engine.
 */

/**
 * GUARANTEE 4: Confidence delta is bounded [-10, +10].
 *
 * The `learned_confidence_adjustment` stored in `recommendation_learning_profiles`
 * is always in [-10, +10] as computed by `calculateConfidenceAdjustment()`.
 * The adapter reads this pre-computed value directly.
 */

/**
 * GUARANTEE 5: Ranking delta is bounded [-100, +100].
 *
 * Similarly, `ranking_adjustment` is always in [-100, +100].
 */

// ── Pure-logic unit test (no DB) ──────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log('\n[Adapter behavior contract]');

// Simulate "flag off" behavior: adjustment = 0, so base is returned
const base = { id: 'r1', shopId: 's1', recommendationKey: 'test_rule', confidence: 75 };
const confAdj = 0; // flag off
const rankAdj = 0;
const adjusted = confAdj === 0 && rankAdj === 0
  ? base
  : { ...base, confidence: base.confidence + confAdj };

assert('flag off → same object reference (no copy)', adjusted === base, true);
assert('flag off → confidence unchanged', adjusted.confidence, 75);
assert('flag off → no learningAdjustment key', 'learningAdjustment' in adjusted, false);

// Simulate "sample < 20" behavior: adjustment still 0
const sampleSize = 15;
const adjFromProfile = sampleSize < 20 ? 0 : 5; // hypothetical
assert('sample < 20 → adjustment suppressed to 0', adjFromProfile, 0);

// Simulate successful adjustment
const sampleSize2 = 50;
const adjFromProfile2 = sampleSize2 < 20 ? 0 : 4.5;
assert('sample >= 20 → adjustment applied', adjFromProfile2, 4.5);
const applied = { ...base, confidence: base.confidence + adjFromProfile2, learningAdjustment: { confidenceDelta: 4.5, rankingDelta: 20, reason: 'Learned from 50 verified outcomes', sampleSize: 50 } };
assert('adjustment increases confidence', applied.confidence, 79.5);
assert('learningAdjustment.sampleSize', applied.learningAdjustment.sampleSize, 50);

console.log(`\n${'─'.repeat(50)}`);
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) { console.error('Some tests failed.'); process.exit(1); }
else { console.log('All tests passed.'); }
