-- Intent-based intake ("What does this customer need?") — the flag row.
--
-- Seeds the flag DISABLED, so nothing changes when this runs. It exists so
-- the owner can turn the feature on from Settings → Feature Flags, which lists
-- existing rows but cannot create one. Same pattern as the SI-10 flags in
-- migration_vehicle_intelligence_engine.sql.
--
-- Additive only: one insert, skipped if the row already exists. No table,
-- column or data changes. Rollback: delete from feature_flags where
-- flag_key = 'intent_intake' and scope = 'global';

INSERT INTO feature_flags (flag_key, enabled, description)
VALUES
  ('intent_intake', false, 'Ask "What does this customer need?" after saving a customer or vehicle, and at appointment check-in')
ON CONFLICT DO NOTHING;
