-- Rollback for 2026-11-27_si5_actionable_recommendations.sql.
--
-- FIRST, prefer the off switch: Settings → Feature Flags →
-- actionable_recommendations OFF. The Command Center cards go back to the
-- summary view at once, and nothing else changes.
--
-- This file removes only the actionable_recommendations rows. It does NOT
-- remove evidence_engine: that flag may have existed (and been switched on)
-- before the migration, and the migration never changed an existing row.
-- No business data is touched.

BEGIN;

DELETE FROM feature_flags WHERE flag_key = 'actionable_recommendations';

COMMIT;

notify pgrst, 'reload schema';
