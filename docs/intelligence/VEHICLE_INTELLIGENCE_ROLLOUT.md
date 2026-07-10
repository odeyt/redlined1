# Vehicle Intelligence Rollout Guide (SI-10)

## Step 1: Run the migration

In Supabase SQL Editor, run `supabase/migrations/migration_vehicle_intelligence_engine.sql`.

Verify: "Success. No rows returned" — the migration is safe to re-run (all statements use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`).

## Step 2: Backfill existing vehicles (optional)

```bash
npm run intelligence:vehicles -- --shop-id <your-shop-id> --dry-run
```

Review output for warnings, then run without `--dry-run` to commit.

## Step 3: Enable the engine

In Supabase:
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'vehicle_intelligence_engine';
```

The engine is now active. New builds will be triggered on API calls and (if enabled) via event hooks.

## Step 4: Enable the UI panel

```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'vehicle_intelligence_panel';
```

The Vehicle Intelligence Panel will now appear at the bottom of the vehicle drawer for all users.

## Step 5: Enable Command Center alerts (optional)

```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'vehicle_intelligence_command_center';
```

High-risk vehicle count appears in Command Center when non-zero.

## Step 6: Enable auto-refresh (optional, low traffic only)

```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'vehicle_intelligence_auto_refresh';
```

Triggers intelligence rebuild on vehicle record updates. Not recommended for high-volume shops until performance is validated.

## Rollback

See `SI10_ROLLBACK_PLAN.md`.
