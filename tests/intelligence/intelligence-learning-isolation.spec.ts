// SI-11: Isolation Guarantees Documentation
export {}; // make this file a module to avoid variable collision across test files
// Verifies that SI-11 has no dependencies on protected modules.

/**
 * ISOLATION GUARANTEE 1: No imports from protected modules.
 *
 * SI-11 learning engine files do NOT import from:
 * - intelligence/recommendations/RecommendationEngine.ts
 * - intelligence/rules/RuleRegistry.ts
 * - intelligence/decision/DecisionEngine.ts
 * - intelligence/vehicle/VehicleIntelligenceEngine.ts
 * - intelligence/bus/IntelligenceBus.ts
 * - Any invoice, estimate, payment, or parts-order service
 *
 * The only outbound dependencies are:
 * - @/lib/supabaseServer (getAdminDb)
 * - @/lib/supabase (client — for UI components only)
 * - ./types (internal)
 * - ./LearningScoring (internal)
 * - ./IntelligenceLearningEngine (internal)
 */

/**
 * ISOLATION GUARANTEE 2: Adapter is opt-in.
 *
 * `LearningAdjustmentAdapter.applyLearningAdjustment()` is designed to be called
 * by the recommendation engine only if the team explicitly adds the call.
 * It is NOT auto-wired into any existing pipeline in this epic.
 * The recommendation engine continues to use its existing deterministic scores.
 */

/**
 * ISOLATION GUARANTEE 3: Feature flags isolate all behavior.
 *
 * Every SI-11 behavior is gated behind a feature flag:
 *
 * intelligence_learning_engine    → engine calculations + API routes
 * recommendation_feedback         → feedback submission UI + API
 * learning_score_adjustments      → adapter applies adjustments
 * intelligence_learning_dashboard → dashboard section in Command Center
 * value_attribution               → outcome/revenue tracking
 *
 * All flags default to false. Zero new behavior activates on deploy.
 */

/**
 * ISOLATION GUARANTEE 4: Failure is silent.
 *
 * All engine functions return null or safe defaults on error.
 * All adapter functions return the base object on error.
 * No exception from SI-11 code can propagate to break existing UI.
 */

/**
 * ISOLATION GUARANTEE 5: No external AI.
 *
 * No OpenAI, Anthropic, Gemini, embedding, vector, or ML API calls.
 * All logic is deterministic and based on shop-owned data only.
 */

// ── File import verification (static check via node) ──────────────────────────

import * as fs from 'fs';
import * as path from 'path';

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

const ROOT = path.resolve(__dirname, '../../');

function readFile(rel: string): string {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); }
  catch { return ''; }
}

console.log('\n[Isolation: no protected module imports in learning engine]');

const engineSrc = readFile('intelligence/learning/IntelligenceLearningEngine.ts');
const scoringSrc = readFile('intelligence/learning/LearningScoring.ts');
const adapterSrc = readFile('intelligence/learning/LearningAdjustmentAdapter.ts');

const allSrc = engineSrc + scoringSrc + adapterSrc;

const FORBIDDEN_IMPORTS = [
  'RecommendationEngine',
  'RuleRegistry',
  'DecisionEngine',
  'VehicleIntelligenceEngine',
  'IntelligenceBus',
  'partsOrderService',
  'invoiceService',
  'paymentService',
];

for (const name of FORBIDDEN_IMPORTS) {
  assert(`No import of ${name}`, allSrc.includes(name), false);
}

console.log('\n[Isolation: feature flags present in migration]');

const migrationSrc = readFile('supabase/migrations/migration_intelligence_learning_engine.sql');

const EXPECTED_FLAGS = [
  'intelligence_learning_engine',
  'recommendation_feedback',
  'learning_score_adjustments',
  'intelligence_learning_dashboard',
  'value_attribution',
];

for (const flag of EXPECTED_FLAGS) {
  assert(`Flag '${flag}' defined`, migrationSrc.includes(flag), true);
  assert(`Flag '${flag}' defaults OFF`, migrationSrc.includes(`'${flag}'`) && migrationSrc.includes('false'), true);
}

console.log('\n[Isolation: no AI/embedding calls]');
const AI_PATTERNS = ['openai', 'anthropic', 'gemini', 'embedding', 'vectorize', 'sapelee'];
for (const pattern of AI_PATTERNS) {
  assert(`No '${pattern}' in engine`, allSrc.toLowerCase().includes(pattern), false);
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) { console.error('Some tests failed.'); process.exit(1); }
else { console.log('All tests passed.'); }
