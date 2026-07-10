# SI-11 Regression Report

## Protected Workflows and their Status

| Module / File | Status | Notes |
|---|---|---|
| `intelligence/recommendations/RecommendationEngine.ts` | UNTOUCHED | Not modified. Existing deterministic scores unchanged. |
| `intelligence/rules/RuleRegistry.ts` | UNTOUCHED | Not modified. |
| `intelligence/decision/DecisionEngine.ts` | UNTOUCHED | Not modified. |
| `intelligence/vehicle/VehicleIntelligenceEngine.ts` | UNTOUCHED | Not modified. |
| `intelligence/bus/IntelligenceBus.ts` | UNTOUCHED | Not modified. |
| `intelligence/morning-brief/MorningBriefEngine.ts` | UNTOUCHED | Not modified. |
| `intelligence/memory/BusinessMemoryEngine.ts` | UNTOUCHED | Not modified. |
| Invoice creation / payment flows | UNTOUCHED | No SI-11 code touches these. |
| Estimate creation / approval flows | UNTOUCHED | No SI-11 code touches these. |
| Parts order flows | UNTOUCHED | No SI-11 code touches these. |
| Customer messaging / Sapelee | UNTOUCHED | No calls made. |
| `features/command-center/CommandCenterView.tsx` | VERIFY MANUALLY | Added one `<Suspense>` block wrapping `<LearningDashboardSection>` at the bottom of the Panel. The section returns null when flag is off. Wrapped in IntelligenceLearningErrorBoundary. Visually additive only — does not alter existing sections. |
| `package.json` | VERIFY MANUALLY | Added `intelligence:learning` script only. Existing scripts unchanged. |

## Verification Steps

Before deploying, manually confirm:

1. Command Center loads normally with all 5 feature flags OFF — no new section visible.
2. Enabling `intelligence_learning_dashboard` shows the learning section only (no crash).
3. Disabling it again hides the section immediately.
4. Recommendation scoring, ranking, and dismissal work as before.
5. Morning Brief generation still works.
6. Business Memory extraction still works.
7. Vehicle Intelligence still works.

## Rollback

See `docs/intelligence/SI11_ROLLBACK.md`.
