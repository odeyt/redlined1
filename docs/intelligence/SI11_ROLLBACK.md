# SI-11 Rollback Procedures

## Immediate Rollback (No DB Changes)

If any SI-11 behavior needs to be disabled immediately:

```sql
UPDATE feature_flags SET enabled = false
WHERE flag_key IN (
  'intelligence_learning_engine',
  'recommendation_feedback',
  'learning_score_adjustments',
  'intelligence_learning_dashboard',
  'value_attribution'
);
```

Effect:
- `LearningDashboardSection` returns null — Command Center unchanged
- Feedback panel returns null — recommendation UI unchanged
- `LearningAdjustmentAdapter` returns 0 for all adjustments — scores unchanged
- All API routes return `{ disabled: true }` — safe for clients

This is sufficient for most rollback scenarios. No code deployment needed.

## Code Rollback (Revert Commit)

If the commit itself needs to be reverted:

```bash
git revert <commit-sha>
```

All SI-11 files are isolated. Reverting the commit removes:
- `intelligence/learning/` directory
- `features/intelligence-learning/` directory
- `app/api/intelligence/learning/` routes
- The `<LearningDashboardSection>` Suspense block from CommandCenterView.tsx
- The `intelligence:learning` script from package.json

## Database Rollback (Remove Tables)

Only needed if you want to clean up the new tables. Run with care:

```sql
-- CAUTION: destructive. Only run if you want to remove all SI-11 data.
DROP TABLE IF EXISTS recommendation_value_attribution;
DROP TABLE IF EXISTS recommendation_learning_events;
DROP TABLE IF EXISTS recommendation_learning_profiles;
DROP TABLE IF EXISTS recommendation_feedback;

DELETE FROM feature_flags WHERE flag_key IN (
  'intelligence_learning_engine',
  'recommendation_feedback',
  'learning_score_adjustments',
  'intelligence_learning_dashboard',
  'value_attribution'
);
```

**This permanently deletes all collected feedback and learning data.** Only do this if you are abandoning the feature entirely. The table names have no FK dependencies from existing production tables, so dropping them is safe from an integrity standpoint.

## Rollback of Phase 0 (RLS Fix)

The RLS fix for `intelligence_events` should NOT be rolled back unless it caused an unexpected problem. Rolling it back restores the original broken state where authenticated users cannot query intelligence_events at all.

If rollback is needed:
```sql
DROP POLICY IF EXISTS "owner_manager_intelligence_events_select" ON intelligence_events;
DROP POLICY IF EXISTS "service_intelligence_events_all" ON intelligence_events;
REVOKE SELECT ON TABLE intelligence_events FROM authenticated;
```
