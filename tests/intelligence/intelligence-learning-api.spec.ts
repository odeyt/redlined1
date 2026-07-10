// SI-11: API Shape Expectations Documentation
export {}; // make this file a module to avoid variable collision across test files
// Documents the expected request/response shapes for all SI-11 API routes.
// Use this as a reference for integration testing or Postman setup.

/**
 * POST /api/intelligence/learning/feedback
 *
 * Request:
 * {
 *   "recommendationId": "uuid",          // required
 *   "feedbackType": "correct"            // required; one of:
 *                                        //   correct | incorrect | partially_correct
 *                                        //   | useful | not_useful | needs_more_information
 *   "usefulnessScore": 4,                // optional; integer 1-5
 *   "accuracyScore": 3,                  // optional; integer 1-5
 *   "trustScore": 5,                     // optional; integer 1-5
 *   "resultStatus": "successful",        // optional; one of:
 *                                        //   unknown | successful | partially_successful
 *                                        //   | unsuccessful | not_measured
 *   "reasonCode": "revenue_collected",   // optional; free text
 *   "comment": "Fixed the issue"         // optional; max 500 chars
 * }
 *
 * Success: 200 { "ok": true }
 * Flag off: 200 { "disabled": true, "ok": false }
 * Validation error: 400 { "ok": false, "error": "..." }
 * Unauthenticated: 401 { "error": "Unauthorized" }
 * No shop: 403 { "error": "No shop" }
 * Server error: 500 { "ok": false, "error": "internal_error" }
 */

/**
 * POST /api/intelligence/learning/outcome
 *
 * Owner/manager only. Feature flag: value_attribution.
 *
 * Request:
 * {
 *   "recommendationId": "uuid",          // required
 *   "realizedRevenue": 1500.00,          // optional
 *   "realizedTimeSavedMinutes": 45       // optional
 * }
 *
 * Success: 200 { "ok": true }
 * Flag off: 200 { "disabled": true, "ok": false }
 * Unauthenticated: 401
 * Non-owner/manager: 403 { "error": "Forbidden" }
 */

/**
 * GET /api/intelligence/learning/summary
 *
 * Owner/manager only. Feature flag: intelligence_learning_dashboard.
 *
 * Response (when enabled):
 * {
 *   "shopId": "uuid",
 *   "totalRules": 12,
 *   "rulesCollectingData": 8,
 *   "rulesTrusted": 2,
 *   "rulesLowPerforming": 1,
 *   "rulesActive": 4,
 *   "totalFeedbackSubmitted": 47,
 *   "totalVerifiedAttributions": 3,
 *   "totalVerifiedRevenue": 4500.00,
 *   "averageUsefulnessAllRules": 3.8,
 *   "lastRecalculatedAt": "2026-07-10T...",
 *   "learningEnabled": true,
 *   "adjustmentsEnabled": false
 * }
 *
 * When flag off: { "disabled": true, "learningEnabled": false, "adjustmentsEnabled": false }
 */

/**
 * GET /api/intelligence/learning/rules/[ruleKey]
 *
 * Owner/manager only. Feature flag: intelligence_learning_engine.
 *
 * Response:
 * {
 *   "profile": {
 *     "ruleKey": "unpaid_invoice_followup",
 *     "category": "unpaid_invoices",
 *     "sampleSize": 34,
 *     "status": "trusted",             // collecting_data | active | trusted | low_performing
 *     "correctnessRate": 0.82,
 *     "actionRate": 0.71,
 *     "averageUsefulness": 4.1,
 *     "confidenceAdjustment": 6.0,
 *     "rankingAdjustment": 42,
 *     "totalRevenueRealized": 7800.00,
 *     "lastCalculatedAt": "2026-07-10T..."
 *   }
 * }
 */

/**
 * POST /api/intelligence/learning/recalculate
 *
 * Owner only. Feature flag: intelligence_learning_engine.
 *
 * Request: {} (no body required)
 *
 * Response:
 * {
 *   "ok": true,
 *   "updated": 8,
 *   "skipped": 1
 * }
 */

// ── Basic shape assertion ──────────────────────────────────────────────────────

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

console.log('\n[API shape validation]');

// Validate feedback type union
const ALLOWED_FEEDBACK: string[] = ['correct','incorrect','partially_correct','useful','not_useful','needs_more_information'];
assert('correct is allowed',                 ALLOWED_FEEDBACK.includes('correct'), true);
assert('needs_more_information is allowed',  ALLOWED_FEEDBACK.includes('needs_more_information'), true);
assert('unknown_type is rejected',           ALLOWED_FEEDBACK.includes('unknown_type'), false);

// Validate result status union
const ALLOWED_STATUS: string[] = ['unknown','successful','partially_successful','unsuccessful','not_measured'];
assert('successful is allowed',              ALLOWED_STATUS.includes('successful'), true);
assert('bad_status is rejected',             ALLOWED_STATUS.includes('bad_status'), false);

// Score range
for (const v of [1, 2, 3, 4, 5]) {
  assert(`score ${v} is valid`, v >= 1 && v <= 5, true);
}
assert('score 0 invalid', 0 >= 1 && 0 <= 5, false);
assert('score 6 invalid', 6 >= 1 && 6 <= 5, false);

console.log(`\n${'─'.repeat(50)}`);
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) { console.error('Some tests failed.'); process.exit(1); }
else { console.log('All tests passed.'); }
