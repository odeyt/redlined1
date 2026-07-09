# Morning Brief Rollout Guide

## Prerequisites

- SI-4 Live Intelligence Pipeline active (metrics flowing)
- SI-6 Executive Decision Engine active (decision_rankings populated)
- Migration `migration_morning_brief_engine.sql` run in Supabase

## Step 1 — Run the migration

In Supabase SQL Editor, run:
```
supabase/migrations/migration_morning_brief_engine.sql
```

Creates:
- `morning_briefs` table
- `brief_delivery_logs` table
- 3 feature flags (all `enabled = false`)

## Step 2 — Test with Shop 2 first

Enable flag for testing (Supabase → feature_flags table):
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'morning_brief_engine';
```

Then generate a brief manually via Command Center or API:
```
POST /api/intelligence/morning-brief
Headers: x-shop-id: 90b72748-bf01-4456-999f-f4ba48091606
```

Verify brief appears in `morning_briefs` table.

## Step 3 — Enable dashboard panel

```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'morning_brief_dashboard';
```

Reload Command Center — Morning Brief section should appear.

## Step 4 — Enable for Shop 1

Repeat Step 2-3 for Shop 1 (38d55fae-741b-4bac-b520-f96eed65bf38).

## Step 5 — Enable delivery (when ready)

```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'morning_brief_delivery';
```

Currently only logs dashboard delivery. Email/SMS requires additional implementation.

## Rollback

Disable all three flags:
```sql
UPDATE feature_flags SET enabled = false WHERE flag_key IN (
  'morning_brief_engine', 'morning_brief_dashboard', 'morning_brief_delivery'
);
```

Command Center returns to pre-SI-7 state immediately. No data loss.

## Monitoring

Check `brief_delivery_logs` table for delivery status.
Check `morning_briefs` table for generated briefs.
Supabase logs for any errors in the morning-brief API route.
