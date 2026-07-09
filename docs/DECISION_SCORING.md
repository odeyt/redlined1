# Decision Scoring Model

## Score Range: 0–1000

`decisionScore = rawScore × confidenceMultiplier`

`rawScore = revenueScore + riskScore + urgencyScore + timeEfficiencyScore + cashFlowScore + customerImpactScore + technicianImpactScore + knowledgeImpactScore`

## Sub-Scores

| Sub-score | Max | Description |
|-----------|-----|-------------|
| Revenue | 350 | Expected revenue recovery/generation |
| Risk | 250 | Severity of risk if ignored |
| Urgency | 150 | How time-sensitive the action is (includes age bonus) |
| Time Efficiency | 100 | ROI per minute (quick wins score higher) |
| Cash Flow | 100 | Immediate cash impact |
| Customer Impact | 30 | Customer satisfaction / retention |
| Technician Impact | 20 | Technician productivity / morale |
| Knowledge Impact | 20 | Learning / institutional knowledge |

## Confidence Multiplier

`confidenceMultiplier` maps recommendation confidence → 0.5–1.0.

Low-confidence recommendations are capped at 50% of their raw score.

## Time Efficiency Lookup

| Estimated time | Score |
|----------------|-------|
| ≤2 min | 100 |
| ≤5 min | 85 |
| ≤10 min | 70 |
| ≤30 min | 50 |
| ≤60 min | 30 |
| >120 min | 10 |

## Urgency Age Bonus

Recommendations gain +10 urgency per day old, capped at +50.
This prevents high-priority items from languishing.

## Tie-Breaking

When two actions have equal `decisionScore`, the one with higher `urgencyScore` ranks first.

## Key File

`intelligence/decision/ScoringModel.ts` — all scoring is pure functions with no DB calls or side effects.
