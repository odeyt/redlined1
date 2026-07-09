-- SI-8: Sapelee Intelligence Provider — Feature Flags
-- All default OFF. RedlineD1 works identically with every flag disabled.

INSERT INTO feature_flags (flag_key, enabled, description)
VALUES
  ('sapelee_provider',                  false, 'SI-8: Enable Sapelee as the active intelligence provider'),
  ('sapelee_morning_brief_enhancement', false, 'SI-8: Send morning brief to Sapelee for executive enhancement'),
  ('sapelee_event_sync',                false, 'SI-8: Sync anonymized operational events to Sapelee'),
  ('sapelee_owner_coaching',            false, 'SI-8: Show Sapelee owner coaching in Command Center')
ON CONFLICT DO NOTHING;
