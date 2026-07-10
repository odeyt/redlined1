# SI-11 Rollout Sequence

## Prerequisites

- Migration `migration_intelligence_learning_engine.sql` applied to production
- Migration `fix_intelligence_events_rls.sql` applied to production
- All feature flags confirmed `enabled = false` in production

## Recommended Sequence

### Stage 1: Infrastructure (Day 1)
Enable `intelligence_learning_engine` only.
- Enables: engine calculations, profile storage, audit events
- Does NOT: show any UI, collect feedback, change any scores
- Monitor: check Supabase logs for any 42501 errors; confirm new tables accessible

### Stage 2: Dashboard (Day 2–3)
Enable `intelligence_learning_dashboard`.
- Shows the Learning section in Command Center for owner/manager
- Will show "Learning data is being collected" since no feedback exists yet
- Safe to roll back immediately if any visual issue

### Stage 3: Feedback collection (Week 1)
Enable `recommendation_feedback`.
- Owners and managers can now rate recommendations
- Feedback starts accumulating in `recommendation_feedback`
- No adjustments applied yet (minimum sample = 20 not reached)

### Stage 4: Value attribution (Week 2+)
Enable `value_attribution`.
- Allows recording realized revenue and time saved
- All attributions stay `pending` until manually verified

### Stage 5: Score adjustments (After 20+ samples)
Enable `learning_score_adjustments` ONLY after:
- At least one rule has 20+ verified feedback records
- Owner has reviewed the dashboard and is satisfied with data quality
- This is the only flag that changes recommendation scoring

## Monitoring

After enabling `learning_score_adjustments`, check:
1. `recommendation_learning_profiles` table for `learned_confidence_adjustment` values
2. Dashboard shows rule statuses (trusted / active / low_performing)
3. No unexpected recommendation ranking changes

## Communication to Staff

No customer notification required. This is an internal shop management improvement. Inform owners that:
- Rating recommendations helps the system improve over time
- At least 20 ratings per rule type are needed before any adjustment kicks in
- Revenue attribution requires owner verification
