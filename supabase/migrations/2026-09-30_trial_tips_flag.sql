-- Trial tips — the Settings panel's feature-flag row, seeded DISABLED.
--
-- The "Email preferences" panel in Settings (features/settings/TrialTipsPanel.tsx)
-- renders only while `trial_tips` is on. It needs the trial-tips tables from
-- 2026-09-30_trial_tips_email.sql, so switch it on only after that migration
-- has been applied.
--
-- The flag is already OFF without this row (a missing flag evaluates to false);
-- the row exists so the owner can switch it on from Settings → Feature Flags,
-- which lists existing rows but cannot create one. Same pattern as
-- 2026-09-26_intent_intake_flag.sql.
--
-- It governs the panel only. Emails are controlled separately by
-- TRIAL_TIPS_SENDING_ENABLED and the other gates in docs/trial-tips-launch.md.
--
-- Additive only: one insert, skipped if the row already exists. Safe to apply
-- before or after the trial-tips migration. Rollback: delete from
-- feature_flags where flag_key = 'trial_tips' and scope = 'global';

INSERT INTO feature_flags (flag_key, enabled, description)
VALUES
  ('trial_tips', false, 'Show the trial-tips email preference in Settings. Requires the trial-tips migration. Does not send anything.')
ON CONFLICT DO NOTHING;
