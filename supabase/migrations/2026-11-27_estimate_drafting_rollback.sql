-- Rollback for 2026-11-27_estimate_drafting.sql.
--
-- FIRST, prefer the off switch: Settings → Feature Flags → estimate_drafting
-- OFF. The button disappears at once.
--
-- Removes only the estimate_drafting flag rows. No business data is touched.

BEGIN;

DELETE FROM feature_flags WHERE flag_key = 'estimate_drafting';

COMMIT;

notify pgrst, 'reload schema';
