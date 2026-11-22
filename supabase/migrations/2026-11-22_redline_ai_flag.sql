-- Redline AI prototype feature flag — default disabled (enabled = false).
-- Safe to re-run: INSERT ... ON CONFLICT DO NOTHING.
--
-- The flag gates both the "Redline AI" sidebar module / route
-- (lib/featureFlags/flaggedModules.ts) and the /api/redline-ai endpoint,
-- which fails closed when no enabling row exists.
--
-- To enable for one shop only (the prototype pilot), add a shop-scoped row
-- instead of flipping the global one:
--   INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope, shop_id)
--   VALUES ('redline_ai', 'Redline AI', 'Read-only AI chat panel (prototype)', true, 'shop', '<shop uuid>')
--   ON CONFLICT DO NOTHING;

INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope)
VALUES
  ('redline_ai', 'Redline AI', 'Read-only AI chat panel: morning brief, stale estimates, money owed, vehicle history, follow-up drafts (prototype)', false, 'global')
ON CONFLICT DO NOTHING;
