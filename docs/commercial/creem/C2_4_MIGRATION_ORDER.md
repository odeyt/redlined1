# C-2.4 Migration Order
**Epic:** C-2.4 — Creem Sandbox Certification
**Status:** Migrations pending — do not run without confirmation

---

## RULE: Never run SQL automatically. Require user confirmation after each migration.

---

## Migration 1 — Subscriptions Table (Core Billing)

**Purpose:** Stores normalized subscription records written by webhook, checkout, and portal routes.

**Path:** `supabase/migrations/001_subscriptions.sql` (or equivalent — verify exact filename)

**Target environment:** Staging/Preview first, then Production

**Status:** Uncertain — may or may not already be applied. **Verify before proceeding.**

**Verification query (run in Supabase SQL editor):**
```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'subscriptions'
) AS subscriptions_exists;
```

**Transaction instructions:**
```sql
BEGIN;
-- (contents of subscriptions migration)
COMMIT;
```

**Rollback:**
```sql
DROP TABLE IF EXISTS subscriptions;
```

**Required before sandbox UAT:** YES — webhook cannot write subscription state without this table.

---

## Migration 2 — Payment Events Table (Webhook Idempotency)

**Purpose:** Records every received webhook event with `processed` flag. Prevents duplicate processing via `provider_event_id` uniqueness constraint.

**Path:** `supabase/migrations/002_payment_events.sql` (or equivalent)

**Target environment:** Staging/Preview first, then Production

**Status:** Uncertain — verify before running.

**Verification query:**
```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'payment_events'
) AS payment_events_exists;
```

**Key constraint that must exist:**
```sql
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'payment_events'
AND constraint_type = 'UNIQUE';
-- Should return a unique constraint on provider_event_id
```

**Rollback:**
```sql
DROP TABLE IF EXISTS payment_events;
```

**Required before sandbox UAT:** YES — idempotency test (S-4) requires this table.

---

## Migration 3 — Billing Analytics Tables (billing_events + shop_subscriptions)

**Purpose:** Provides platform-owner billing metrics shown in the Billing Health Dashboard (C-2.2).

**Path:** `supabase/migrations/003_billing_analytics.sql`

**Target environment:** Production (Supabase SQL Editor)

**Status:** NOT APPLIED — confirmed blocked in prior session because the tables don't exist yet.

**Verification query:**
```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'billing_events'
) AS billing_events_exists,
EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'shop_subscriptions'
) AS shop_subscriptions_exists;
```

**Rollback:**
```sql
DROP TABLE IF EXISTS billing_events;
DROP TABLE IF EXISTS shop_subscriptions;
```

**Required before sandbox UAT:** Not strictly — the billing health dashboard will show empty/zero state without it, but UAT can proceed.

**Required before live:** YES — MRR/ARR analytics need these tables.

---

## Migration Order for UAT

Execute in this order:

1. Verify Migration 1 (subscriptions) is applied
2. If not: share SQL → wait for Odey confirmation → run → verify
3. Verify Migration 2 (payment_events) is applied
4. If not: share SQL → wait for Odey confirmation → run → verify
5. Migration 3 (billing_analytics) can be deferred until after UAT

---

## Pre-Migration Checklist (per migration)

- [ ] Backup exists or point-in-time recovery is enabled (Supabase Pro has this)
- [ ] Migration reviewed and approved by Odey
- [ ] Run in Supabase SQL Editor (not via application code)
- [ ] `BEGIN; ... COMMIT;` wrapping confirmed for transaction safety
- [ ] Verification query confirms success
- [ ] Application tested after each migration

---

## Required SQL to Verify Current State

Run this in the Supabase SQL editor to check what's already applied:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('subscriptions', 'payment_events', 'billing_events', 'shop_subscriptions')
ORDER BY table_name;
```

Share the result with the engineering team before proceeding.
