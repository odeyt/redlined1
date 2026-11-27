-- Estimate drafting from the shop's own past estimates (no AI).
--
-- Owner approved 2026-11-27: "Past jobs first, no AI"; any shop, via flag.
--
-- ADDITIVE ONLY. One feature-flag row, seeded OFF. No tables or data change.
-- The feature only reads existing estimates and job cards.
--
-- Rollback: 2026-11-27_estimate_drafting_rollback.sql
-- Safe to re-run: ON CONFLICT DO NOTHING.

BEGIN;

INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope)
VALUES
  ('estimate_drafting', 'Draft estimates from past jobs',
   'Estimates: a "Draft from past jobs" button suggests lines from this shop''s own past estimates for the same make and model with similar work, at the prices charged. Staff pick what to add. No AI.',
   false, 'global')
ON CONFLICT DO NOTHING;

COMMIT;

notify pgrst, 'reload schema';

SELECT 'estimate_drafting flag' AS item,
       CASE WHEN EXISTS (SELECT 1 FROM feature_flags WHERE flag_key = 'estimate_drafting')
            THEN 'ok' ELSE 'MISSING' END AS status;
