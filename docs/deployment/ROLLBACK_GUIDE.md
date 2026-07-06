# Redlined1 — Rollback Guide

## When to Roll Back

Roll back when:
- Production is throwing errors affecting shop operations
- A migration corrupted or lost data
- A feature is causing incorrect behavior for staff
- Login or core workflow is broken

---

## 1. Vercel Rollback (Fastest — < 2 minutes)

Rolls back the application code without touching the database.

**Steps:**
1. Go to [vercel.com](https://vercel.com) → `redlined1` project
2. Click **Deployments** tab
3. Find the last known-good deployment (look for the green checkmark before the bad deploy)
4. Click **⋯ (three dots)** → **Promote to Production**
5. Confirm — traffic switches instantly

**When to use:** Bugs in application logic, UI errors, API errors that are not database-related.

**Does NOT fix:** Database schema changes, corrupted data.

---

## 2. Feature Flag Rollback (Fastest for Feature Issues — < 1 minute)

If a newly enabled feature is causing problems:

1. Log in as **owner** on production
2. Go to **Settings → Feature Flags**
3. Find the flag for the broken feature
4. Toggle it **OFF**
5. The feature is immediately hidden for all users

**When to use:** Any feature gated behind a flag.

**This is why all new features MUST be behind a flag.**

---

## 3. Database Migration Rollback

Migrations are the most complex rollbacks. Prevention is better than cure.

### Step 1: Assess damage
```sql
-- Check recent changes
SELECT * FROM public.payment_events ORDER BY created_at DESC LIMIT 20;
SELECT * FROM public.subscriptions ORDER BY updated_at DESC LIMIT 20;
```

### Step 2: Reverse the migration manually (if reversible)

If the migration only added columns or tables:
```sql
-- Drop a column that was added (example)
ALTER TABLE public.job_cards DROP COLUMN IF EXISTS bad_column;

-- Drop a table that was added (example)
DROP TABLE IF EXISTS public.bad_table;
```

If the migration altered or dropped existing data:
→ Proceed to Step 3.

### Step 3: Restore from backup

Only if data was lost or corrupted and cannot be recovered manually.

1. Download the pre-migration backup from Supabase → **Settings → Backups**
2. Contact Supabase support if point-in-time restore is needed (Pro plan feature)
3. Or restore table-by-table from exported CSV files

**WARNING:** A full restore will overwrite all data created after the backup was taken. Coordinate with D1 Imports to understand what data was created between backup and restore time.

---

## 4. Emergency Disable Process

If the entire application needs to be taken offline briefly:

### Option A — Vercel Maintenance Page
1. Create a static `app/maintenance/page.tsx` that returns a simple message
2. Temporarily redirect all traffic in `middleware.ts`
3. Revert once issue is resolved

### Option B — Password Protect on Vercel
1. Vercel project → **Settings → Deployment Protection**
2. Enable **Password Protection** temporarily
3. Share password only with D1 team during emergency

---

## 5. When to Restore a Database Backup

Only restore if:
- A migration dropped a non-empty table
- A migration deleted or corrupted rows in a critical table (job_cards, invoices, customers)
- Data cannot be recovered by any other means

**Before restoring:**
- Document what happened and what data will be lost
- Confirm with D1 Imports owner
- Take a backup of the current (broken) state before restoring
- Plan for re-entry of any data created after the backup timestamp

---

## 6. Who Should Approve a Rollback

| Severity | Who Approves |
|---|---|
| Feature flag toggle | Any owner-role user |
| Vercel code rollback | Lead engineer or D1 owner |
| Database migration rollback | Lead engineer + D1 owner sign-off |
| Full database restore | D1 owner only — irreversible |

---

## 7. Production Incident Note Template

After any rollback, write a brief post-incident note. Save it in `docs/incidents/YYYY-MM-DD-description.md`.

```markdown
# Incident — YYYY-MM-DD — Short Description

## What happened
[Describe the symptom and when it was first noticed]

## Impact
[Which features were affected, how many users, duration]

## Root cause
[What caused the issue — migration bug, bad deploy, config issue]

## Rollback action taken
[ ] Vercel deployment rollback
[ ] Feature flag disabled
[ ] Migration manually reversed
[ ] Database backup restored

## Timeline
- HH:MM — Issue detected
- HH:MM — Rollback started
- HH:MM — Service restored

## Prevention
[What process change will prevent this in the future]
```
