# SI-11 Change Manifest: Intelligence Learning Engine

## Feature Flags (all default OFF)

| Flag Key | Display Name | Description |
|---|---|---|
| `intelligence_learning_engine` | Intelligence Learning Engine | SI-11: Enable learning engine infrastructure |
| `recommendation_feedback` | Recommendation Feedback | SI-11: Allow staff to submit recommendation feedback |
| `learning_score_adjustments` | Learning Score Adjustments | SI-11: Apply learned adjustments to recommendation scores |
| `intelligence_learning_dashboard` | Intelligence Learning Dashboard | SI-11: Show learning metrics in Command Center |
| `value_attribution` | Value Attribution | SI-11: Enable revenue/time attribution tracking |

---

## Files Created

### Migrations
- `supabase/migrations/fix_intelligence_events_rls.sql` — Phase 0: fix missing GRANT on intelligence_events
- `supabase/migrations/migration_intelligence_learning_engine.sql` — Creates 4 new tables + feature flags

### New Tables
- `recommendation_feedback` — Stores user-submitted feedback on recommendations
- `recommendation_learning_profiles` — Aggregated learning stats per rule key per shop
- `recommendation_learning_events` — Audit log of profile recalculations
- `recommendation_value_attribution` — Revenue and time-savings attribution per recommendation

### Intelligence Engine
- `intelligence/learning/types.ts` — All TypeScript types for learning engine
- `intelligence/learning/IntelligenceLearningEngine.ts` — Core engine: feedback submission, profile calculation, summaries
- `intelligence/learning/LearningScoring.ts` — Deterministic scoring formulas (correctness rate, confidence adjustment, ranking adjustment)
- `intelligence/learning/LearningAdjustmentAdapter.ts` — Adapter to apply learned adjustments to existing recommendations

### UI Components
- `features/intelligence-learning/IntelligenceLearningErrorBoundary.tsx`
- `features/intelligence-learning/LearningConfidenceBadge.tsx`
- `features/intelligence-learning/RecommendationFeedbackPanel.tsx`
- `features/intelligence-learning/RecommendationOutcomeForm.tsx`
- `features/intelligence-learning/RulePerformanceCard.tsx`
- `features/intelligence-learning/LearningDashboardSection.tsx`

### API Routes
- `app/api/intelligence/learning/feedback/route.ts` — POST: submit feedback
- `app/api/intelligence/learning/outcome/route.ts` — POST: record realized outcome
- `app/api/intelligence/learning/summary/route.ts` — GET: shop learning health
- `app/api/intelligence/learning/rules/[ruleKey]/route.ts` — GET: per-rule performance
- `app/api/intelligence/learning/recalculate/route.ts` — POST: trigger recalculation (owner only)

### Scripts
- `scripts/recalculate-intelligence-learning.ts` — CLI script for manual/automated recalculation

### Tests
- `tests/intelligence/intelligence-learning-engine.spec.ts`
- `tests/intelligence/learning-adjustment-adapter.spec.ts`
- `tests/intelligence/intelligence-learning-api.spec.ts`
- `tests/intelligence/intelligence-learning-isolation.spec.ts`

### Documentation
- `docs/intelligence/INFRA_BUG_001_INTELLIGENCE_EVENTS_RLS.md`
- `docs/intelligence/SI11_CHANGE_MANIFEST.md` (this file)
- `docs/intelligence/INTELLIGENCE_LEARNING_ENGINE.md`
- `docs/intelligence/RECOMMENDATION_FEEDBACK.md`
- `docs/intelligence/LEARNING_SCORING.md`
- `docs/intelligence/VALUE_ATTRIBUTION.md`
- `docs/intelligence/SI11_ROLLOUT.md`
- `docs/intelligence/SI11_ROLLBACK.md`
- `docs/intelligence/SI11_REGRESSION_REPORT.md`

---

## Files Modified

- `features/command-center/CommandCenterView.tsx` — Added `LearningDashboardSection` in Suspense boundary (additive, does not modify existing rendering logic)
- `package.json` — Added `intelligence:learning` script

---

## Protected Modules (not modified)

- `intelligence/recommendations/RecommendationEngine.ts` — existing deterministic rules untouched
- `intelligence/rules/RuleRegistry.ts` — untouched
- `intelligence/decision/DecisionEngine.ts` — untouched
- `intelligence/vehicle/VehicleIntelligenceEngine.ts` — untouched
- `intelligence/bus/IntelligenceBus.ts` — untouched
- All invoice, estimate, payment, parts-order workflows — untouched
- All customer-facing messaging — untouched

---

## API Dependencies

- Supabase (existing client patterns)
- No external AI, embeddings, or third-party APIs
- No Sapelee calls

---

## Rollback Method

1. Disable all 5 feature flags in `feature_flags` table (set `enabled = false`)
2. The LearningDashboardSection returns null when flag is off — no UI impact
3. Feedback API routes return 404/disabled when flag is off
4. Adjustment adapter returns 0 when flag is off — existing scores unaffected
5. New tables can be dropped without affecting any existing tables (no FK references from existing tables to new tables)

See `docs/intelligence/SI11_ROLLBACK.md` for full instructions.
