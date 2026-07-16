# C-3 Migration Runbook

**Date:** 2026-07-16  
**Applies to:** `feature/commercial-signup-subscription-flow`  
**DO NOT run any SQL on Production without explicit owner approval.**

---

## Existing Tables Used (No Migration Required)

| Table | Usage |
|-------|-------|
| `profiles` | plan, trial_ends_at — already exists |
| `shop_users` | role, shop_id — already exists |
| `subscriptions` | plan_key, status, trial dates — already exists |
| `shops` | name, currency — already exists |
| `billing_events` | idempotency — already exists |

---

## New Table Required: `onboarding_sessions`

Required by `ShopProvisioningService.ts`.

### Migration (additive, idempotent)

```sql
-- supabase/migrations/20260716000000_add_onboarding_sessions.sql

CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id         uuid REFERENCES public.shops(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','shop_created','trial_created','completed')),
  intent          text,
  plan_key        text,
  period          text CHECK (period IN ('monthly','annual') OR period IS NULL),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One active session per user (non-completed)
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_sessions_user_active_idx
  ON public.onboarding_sessions (user_id)
  WHERE status != 'completed';

CREATE INDEX IF NOT EXISTS onboarding_sessions_user_id_idx
  ON public.onboarding_sessions (user_id);

-- RLS: users can only read their own session; service role has full access
ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_session" ON public.onboarding_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- No INSERT/UPDATE via RLS — server uses service role only
```

### Rollback

```sql
-- supabase/migrations/20260716000000_rollback_onboarding_sessions.sql
DROP TABLE IF EXISTS public.onboarding_sessions CASCADE;
```

---

## Optional Enhancement: `subscriptions` Table Columns

If `selected_paid_plan` column is not yet present:

```sql
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS selected_paid_plan text,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;
```

Rollback:
```sql
ALTER TABLE public.subscriptions
  DROP COLUMN IF EXISTS selected_paid_plan,
  DROP COLUMN IF EXISTS trial_started_at,
  DROP COLUMN IF EXISTS converted_at;
```

---

## Execution Order (Preview Only)

1. Verify current table schemas match expectations.
2. Run `onboarding_sessions` migration in Supabase SQL Editor (preview project).
3. Run `subscriptions` column additions if needed.
4. Run `ShopProvisioningService` integration tests.
5. Verify RLS policies block cross-user access.

---

## Production Migration (NOT YET)

Production migration must be run only after:
- [ ] Preview environment verified
- [ ] Creem sandbox UAT complete
- [ ] Explicit owner approval
- [ ] Tested rollback procedure
