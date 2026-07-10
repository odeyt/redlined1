# Intelligence Learning Engine (SI-11)

## Overview

The Intelligence Learning Engine closes the feedback loop on deterministic recommendations. It tracks whether each rule's recommendations were acted upon, completed, dismissed, and rated by staff — then uses this data to compute per-rule confidence and ranking adjustments.

**All logic is deterministic and purely statistical. No AI, embeddings, or external APIs are used.**

## Architecture

```
recommendation_feedback ──┐
                           │
recommendation_value_      ├──► LearningScoring.ts ──► recommendation_learning_profiles
attribution (verified) ───┘                              (per rule, per shop)
                                                              │
                                                              ▼
                                               LearningAdjustmentAdapter.ts
                                                              │
                                                              ▼
                                               RecommendationEngine (opt-in call)
```

## Components

### LearningScoring.ts
Pure deterministic functions that compute:
- Correctness rate: how often the rule was marked correct vs incorrect
- Action rate: how often staff acted on the recommendation
- Success rate: how often acted-upon recommendations led to successful outcomes
- Dismiss rate: how often the recommendation was dismissed
- Confidence adjustment: bounded -10 to +10
- Ranking adjustment: bounded -100 to +100

See `LEARNING_SCORING.md` for all formulas.

### IntelligenceLearningEngine.ts
Server-side functions:
- `submitFeedback()` — records staff feedback on a recommendation
- `calculateRuleLearningProfile()` — computes live profile for one rule
- `recalculateShopLearningProfiles()` — batch recalculates all rules for a shop
- `getRulePerformance()` — reads stored profile for a rule
- `getShopLearningSummary()` — aggregated health status for the shop

All functions catch all errors and return safe defaults. They never throw.

### LearningAdjustmentAdapter.ts
Provides `applyLearningAdjustment()` for use by the recommendation engine (opt-in). Returns the base recommendation unchanged if:
- The `learning_score_adjustments` flag is off
- Sample size is below 20
- Any DB error occurs

## Safety Controls

1. **Feature flags** — all behavior default OFF; flags must be explicitly enabled
2. **Minimum sample** — 20 verified outcomes required before any adjustment applies
3. **Bounded adjustments** — confidence ±10, ranking ±100
4. **Silent failures** — all engine functions return null/0 on error
5. **No side effects** — learning never modifies existing recommendations directly
6. **Existing scores are fallback** — if learning engine is disabled or fails, deterministic scores are used unchanged

## Database Tables

- `recommendation_feedback` — raw feedback submissions
- `recommendation_learning_profiles` — aggregated stats per rule per shop (UNIQUE on shop_id, rule_key)
- `recommendation_learning_events` — audit log of profile recalculations
- `recommendation_value_attribution` — revenue and time attribution (pending manual verification)

## Feature Flags

| Flag | Purpose |
|---|---|
| `intelligence_learning_engine` | Master switch — enables engine infrastructure |
| `recommendation_feedback` | Enables feedback submission from UI |
| `learning_score_adjustments` | Applies learned adjustments to recommendation scores |
| `intelligence_learning_dashboard` | Shows learning section in Command Center |
| `value_attribution` | Enables revenue/time attribution tracking |
