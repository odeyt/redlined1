# SI-10 Rollback Plan — Vehicle Intelligence Engine

## Instant rollback (no redeploy)

```sql
UPDATE feature_flags
SET enabled = false
WHERE flag_key IN (
  'vehicle_intelligence_engine',
  'vehicle_intelligence_panel',
  'vehicle_intelligence_command_center',
  'vehicle_intelligence_auto_refresh'
);
```

Effect takes hold within seconds. Vehicle pages, Command Center, and API routes all check flags at runtime.

## Code rollback

If the feature branch needs to be reverted:

```bash
git checkout main
# Redeploy main to Vercel
```

New tables remain in the database but have no production dependency — they are inert.

## Database cleanup (if needed)

These are safe to run only after code rollback:

```sql
-- Optional: remove new tables
DROP TABLE IF EXISTS vehicle_intelligence_signals;
DROP TABLE IF EXISTS vehicle_intelligence_events;
DROP TABLE IF EXISTS vehicle_intelligence_profiles;

-- Optional: remove feature flags
DELETE FROM feature_flags WHERE flag_key IN (
  'vehicle_intelligence_engine',
  'vehicle_intelligence_panel',
  'vehicle_intelligence_command_center',
  'vehicle_intelligence_auto_refresh'
);
```

**Warning**: Only run the above if you are certain no other code references these tables.

## Impact assessment

- No production workflows depend on SI-10 tables
- No existing tables were modified
- Rollback is safe at any time
