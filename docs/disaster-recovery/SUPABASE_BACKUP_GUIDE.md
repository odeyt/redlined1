# Supabase Backup Guide — RedlineD1

**Version:** 1.0  
**Last Updated:** 2026-07-07

---

## Supabase Backup Types

### 1. Automatic Daily Snapshots

Available on Supabase Pro plan.

**Access:**
```
Supabase Dashboard → Project → Database → Backups
```

- Snapshots taken every 24 hours
- Retained for 7 days (Pro) / 30 days (Team)
- Full database restore — replaces current DB

**How to restore from snapshot:**
1. Go to Database → Backups
2. Click the snapshot you want to restore
3. Click "Restore"
4. Confirm — this is destructive and replaces the live database
5. Wait 1–3 minutes for restore to complete

---

### 2. Point-in-Time Recovery (PITR)

PITR uses continuous WAL (Write-Ahead Logging) archiving to allow restore to any
second within the retention window.

**Access:**
```
Supabase Dashboard → Database → Backups → Point in Time Recovery
```

**Steps:**
1. Click "Point in Time Recovery"
2. Select a date and time (use a time just before the incident)
3. Review what will be restored
4. Click "Restore" — replaces live database
5. Wait for completion
6. Verify with GET /api/health

**RPO achieved:** < 15 minutes (WAL lag is typically < 1 minute)

---

### 3. Manual Schema Export (Migration-based)

All schema changes are tracked as migration SQL files in `supabase/`.

To recreate the full schema from scratch:
```bash
# Run all migrations in order documented in MIGRATION_REGISTRY.md
# In Supabase SQL Editor, run each file in sequence
```

This recreates structure but NOT data. Use for new environment setup.

---

### 4. Supabase CLI Export

For manual data exports:

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Export database (requires service role access)
supabase db dump --db-url "postgresql://postgres:[password]@[host]:5432/postgres" > backup.sql

# Export storage
# Use: Supabase Storage API or AWS S3 CLI (storage is S3-compatible)
```

---

## Backup Verification

Run this check to verify the database is healthy:

```
GET https://redlined1.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "checks": {
    "supabase": true,
    "feature_flags": true
  }
}
```

---

## Supabase Project Details

| Field | Value |
|-------|-------|
| Project Name | redlined1 (production) |
| Dashboard | https://supabase.com/dashboard/projects |
| Region | (check dashboard) |
| Plan | Pro (required for PITR) |
| Staging Project | redlined1-staging |

---

## Tables to Verify After Restore

Run in Supabase SQL Editor to confirm key tables are intact:

```sql
SELECT 
  'profiles'       AS t, count(*) FROM profiles
UNION ALL SELECT 
  'shops',          count(*) FROM shops
UNION ALL SELECT 
  'customers',      count(*) FROM customers
UNION ALL SELECT 
  'vehicles',       count(*) FROM vehicles
UNION ALL SELECT 
  'job_cards',      count(*) FROM job_cards
UNION ALL SELECT 
  'feature_flags',  count(*) FROM feature_flags
UNION ALL SELECT 
  'observability_logs', count(*) FROM observability_logs;
```

All counts should be > 0 (except observability_logs which may be empty on fresh restore).
