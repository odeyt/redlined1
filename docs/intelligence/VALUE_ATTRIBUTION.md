# Value Attribution (SI-11)

## Purpose

Tracks whether acted-upon recommendations led to measurable outcomes — revenue collected, time saved, or risk avoided. This data makes the learning engine's scoring more precise over time.

## What is Tracked

- `realized_revenue` — amount collected as a direct result of following the recommendation
- `realized_time_saved_minutes` — time saved by following the recommendation
- `risk_reduction_score` — subjective 0–1 score for risk avoided (future use)

## Attribution Status

All attributions start as `pending` and require manual verification before they affect scoring.

| Status | Meaning |
|---|---|
| `pending` | Submitted by staff, not yet verified |
| `verified` | Owner has confirmed the outcome |
| `rejected` | Outcome was not attributable to the recommendation |

**Only `verified` attributions are included in learning calculations.**

## Why Manual Verification?

Revenue can occur for many reasons. Requiring manual verification (by the owner) prevents false learning from coincidental revenue events.

## Privacy

- No customer names, contact information, or PII is stored.
- Attribution links `recommendation_id` to financial outcomes at the shop level only.

## Feature Flag

Controlled by `value_attribution`. When off, `RecommendationOutcomeForm` returns null and `/api/intelligence/learning/outcome` returns `{ disabled: true }`.

## Who Can Record Outcomes

Owner and manager roles only. Verification (changing status from pending → verified/rejected) is currently manual via direct database update or a future admin UI.
