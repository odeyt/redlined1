# Redlined1 — Supabase Environment Guide

## Overview

Each environment should have its own Supabase project to prevent staging activity from affecting production data.

| Environment | Supabase Project | Contains Real Data |
|---|---|---|
| Production | `redlined1-prod` | YES — protect at all times |
| Staging | `redlined1-staging` | NO — test data only |
| Development | `redlined1-dev` (optional) | NO — throwaway |

---

## 1. Why Staging Must Not Use Production DB

- A bad migration on production DB can destroy real customer data
- Test user creation can pollute RLS policies
- Performance tests can degrade production query speed
- Webhook tests trigger real payment events
- D1 Imports staff data must remain private

**Rule: Staging = staging DB. No exceptions.**

---

## 2. Creating the Staging Supabase Project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Name: `redlined1-staging`
3. Organization: `d1group`
4. Region: same as production (reduces latency differences)
5. Password: generate strong password, save in password manager
6. Copy the project URL and keys to Vercel staging environment variables

---

## 3. Cloning Schema to Staging

After creating the staging project, apply all migrations in order:

```sql
-- Run in Supabase SQL Editor (staging project) in this order:
-- 1. Core schema (from your initial schema file if it exists)
-- 2. migration_triage.sql
-- 3. migration_smart_intake.sql
-- 4. migration_billing.sql
-- 5. migration_feature_flags.sql
```

All migration files are in `supabase/` in the repo. Run each one in the staging SQL Editor.

**Tip:** Paste the contents of each file into a new SQL Editor tab → Run → confirm "Success. No rows returned".

---

## 4. Seeding Test Data

After schema is applied, seed staging with test data:

```sql
-- Example: create a test shop
INSERT INTO public.shops (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'D1 Beta Test Shop');

-- Example: create a test owner user (use Supabase Auth → Add User for the actual user)
-- Then link them in shop_users:
INSERT INTO public.shop_users (user_id, shop_id, role) VALUES
  ('<auth-user-id>', '00000000-0000-0000-0000-000000000001', 'owner');
```

Use Supabase dashboard → **Authentication → Users → Add User** to create test accounts.

---

## 5. Avoiding Real Customer Data Exposure

- Never copy production data to staging with `pg_dump` + `pg_restore` unless fully anonymized
- If you need realistic data, write a seed script that generates fake names, phones, and emails
- VIN numbers: use obviously fake VINs like `1HGBH41JXMN109186` (public test VINs)
- Never import real invoice or payment data to staging

---

## 6. Testing RLS Policies

In Supabase dashboard (staging) → **Authentication → Policies**:

1. Enable **RLS Simulation** mode
2. Set `auth.uid()` to a test user's UUID
3. Run queries to verify they respect RLS rules
4. Test that technician users cannot read other shops' data

```sql
-- Verify a technician can only see their own shop's job cards
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "<test-technician-user-id>"}';
SELECT * FROM job_cards;  -- should only return their shop's cards
```

---

## 7. Running SQL Migrations Safely

**Always follow this order:**

```
1. BACKUP — Supabase dashboard → Settings → Backups → Download backup
2. TEST on staging — paste migration SQL → run → verify "Success"
3. Review the SQL — check for DROP, TRUNCATE, irreversible changes
4. Run on production — same paste → run → verify
5. Confirm app behavior — smoke test the affected feature
```

**Never run untested SQL directly on production.**

---

## 8. Backing Up Before Migrations

### Supabase Dashboard Backup
1. Production project → **Settings → Database**
2. Scroll to **Backups** section
3. Click **Download backup** (point-in-time or daily backup)
4. Save the backup file labeled with today's date

### Manual SQL Export (quick)
```sql
-- Export critical tables before a migration
COPY (SELECT * FROM job_cards) TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM invoices) TO STDOUT WITH CSV HEADER;
```

Run via Supabase SQL Editor and save the output.

---

## 9. Applying Migrations Across Environments

```
Develop locally → test migration on dev Supabase
↓
Commit migration file to repo (supabase/migration_xxx.sql)
↓
Apply to staging Supabase → test staging app
↓
Get approval → backup production
↓
Apply to production Supabase → smoke test
```

---

## 10. Environment Variables Per Supabase Project

Each project has unique values — get them from Supabase → **Settings → API**:

| Variable | Where to find |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role key |

Set each set in the corresponding Vercel environment (staging vars for staging, production vars for production).
