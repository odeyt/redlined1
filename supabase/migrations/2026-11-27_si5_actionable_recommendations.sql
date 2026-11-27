-- SI-5 Evidence Engine phase 1: actionable recommendations.
--
-- Owner approved building Phase 1 on 2026-11-27 (RedlineD1 AI Proposal).
--
-- ADDITIVE ONLY. Two feature-flag rows, both seeded OFF. No tables, columns,
-- triggers or data changes.
--   * actionable_recommendations — Command Center cards list the actual
--     records behind each recommendation, what to do, the money involved
--     (per currency) and buttons to the right screen.
--   * evidence_engine — the summary evidence panel. Code has read this flag
--     since SI-4 but no migration ever created it; seeding it OFF only makes
--     it visible in Settings. If a row already exists it is left as it is.
--
-- Neither flag uses an AI model or an external service.
--
-- Rollback: 2026-11-27_si5_actionable_recommendations_rollback.sql
-- Safe to re-run: ON CONFLICT DO NOTHING.

BEGIN;

INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope)
VALUES
  ('actionable_recommendations', 'Actionable recommendations',
   'Command Center: list the records behind each recommendation, what to do next, the money involved and a button to the right screen. Read-only; no AI.',
   false, 'global'),
  ('evidence_engine', 'Evidence engine',
   'Command Center: summary evidence and why each recommendation matters. Read-only; no AI.',
   false, 'global')
ON CONFLICT DO NOTHING;

COMMIT;

notify pgrst, 'reload schema';

-- ── Check after running (every row should say ok) ───────────────────────────

SELECT 'actionable_recommendations' AS item,
       CASE WHEN EXISTS (SELECT 1 FROM feature_flags WHERE flag_key = 'actionable_recommendations')
            THEN 'ok' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'evidence_engine',
       CASE WHEN EXISTS (SELECT 1 FROM feature_flags WHERE flag_key = 'evidence_engine')
            THEN 'ok' ELSE 'MISSING' END;
