# Recommendation Feedback (SI-11)

## Purpose

Allows shop owners and managers to rate whether each recommendation was correct, useful, and led to a successful outcome. This data feeds the learning engine to improve future recommendations.

## What is Collected

- **Feedback type**: correct / partially_correct / incorrect / useful / not_useful / needs_more_information
- **Usefulness score**: 1–5 (optional)
- **Accuracy score**: 1–5 (optional)
- **Trust score**: 1–5 (optional)
- **Result status**: successful / partially_successful / unsuccessful / not_measured / unknown (optional)
- **Comment**: free text up to 500 characters (optional)

## Privacy

- No customer PII is stored in feedback records.
- Comments are staff notes about the recommendation itself, not customer details.
- `recommendation_id` links to the recommendation but does not expose customer names or contact info.
- Feedback is scoped to the shop and only accessible to owner/manager roles.

## Who Can Submit

Owner and manager roles only. Technicians cannot see or submit feedback.

## How it Works

1. Staff opens a recommendation in Command Center.
2. They click "Rate this recommendation" to open `RecommendationFeedbackPanel`.
3. They select a feedback type and optionally add scores and comments.
4. On submit, the panel POSTs to `/api/intelligence/learning/feedback`.
5. The API validates and calls `submitFeedback()` in the learning engine.
6. The engine inserts a row into `recommendation_feedback`.

## Feature Flag

Controlled by `recommendation_feedback` flag. When off, the panel returns null and the API returns `{ disabled: true }`.

## Minimum Sample Requirement

Adjustments do not apply until 20 feedback records exist for a rule. Until then, the rule remains in "collecting_data" status.
