-- Intelligence Foundation feature flags — all default disabled (enabled = false)
-- Safe to re-run: INSERT ... ON CONFLICT DO NOTHING

INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope)
VALUES
  ('intelligence_foundation', 'Intelligence Foundation', 'Master gate for event publishing and intelligence infrastructure', false, 'global'),
  ('command_center',          'Owner Command Center',    'Owner Command Center data API and analytics', false, 'global'),
  ('daily_summary',           'Daily Summary',           'Automated daily shop summary generation', false, 'global'),
  ('morning_briefing',        'Morning Briefing',        'Morning briefing for shop owners', false, 'global')
ON CONFLICT (flag_key) DO NOTHING;
