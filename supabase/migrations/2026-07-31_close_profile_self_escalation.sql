-- ============================================================================
-- SECURITY: close self-escalation via public.profiles
--
-- FINDING (confirmed exploitable in production 2026-07-31, not theoretical):
-- the profiles RLS policy lets a user update their OWN row, and no column
-- restriction exists, so any signed-in customer can run this from the browser
-- console and unlock every paid module for free:
--
--     supabase.from('profiles').update({ plan: 'pro' }).eq('id', <own id>)
--
-- Verified writable by a plain authenticated user: plan, trial_ends_at, role,
-- shop_id. Each is an escalation primitive:
--
--   plan / trial_ends_at
--     Read by lib/usePlan.ts -> getPlanStatus(). Setting plan='pro' (or a
--     future trial_ends_at) grants Parts, Reports, AI, technicians, payments —
--     everything gated by lib/planGate.ts.
--
--   shop_id
--     lib/usePlan.ts treats a profile whose shop_id is one of the D1 internal
--     shops as unconditionally 'pro'. Setting that single field bypasses
--     billing entirely, without even touching `plan`.
--
--   role
--     app/api/test-results/route.ts gates on profiles.role === 'owner'.
--     Previously documented in
--     docs/staging-bootstrap/09_close_profiles_role_escalation_gap.sql, which
--     covered `role` alone; this supersedes it by closing all four.
--
-- FIX: column-level privileges, which are enforced at the grant layer before
-- RLS is evaluated. Note the ordering below — in PostgreSQL a table-level
-- GRANT UPDATE covers every column, and you cannot carve out an exception with
-- REVOKE UPDATE (col). The table-level grant must be revoked first, then
-- re-granted only on the columns users may legitimately edit.
--
-- service_role is unaffected: it bypasses RLS and column grants, so the
-- legitimate server-side writers keep working —
--   app/api/billing/webhook/creem/route.ts   (sets plan after payment)
--   commercial/onboarding/ShopProvisioningService.ts (grants Free Forever)
--   app/api/invite/route.ts                  (profile upsert)
--
-- Safe to rerun.
-- ============================================================================

BEGIN;

-- 1. Drop the blanket table-level UPDATE, which implicitly covers all columns.
REVOKE UPDATE ON public.profiles FROM authenticated;

-- 2. Re-grant UPDATE only where a user editing their own row is legitimate.
--    Deliberately NOT granted: plan, trial_ends_at, role, shop_id,
--    billing_status, id, created_at.
GRANT UPDATE (email, shop_name) ON public.profiles TO authenticated;

-- Row scoping is unchanged — the existing RLS policy still restricts a user to
-- their own row. This only limits WHICH COLUMNS of that row they may write.

COMMIT;


-- ── Verification ────────────────────────────────────────────────────────────

-- 1. Expect exactly two rows: email and shop_name.
SELECT column_name
FROM information_schema.column_privileges
WHERE grantee = 'authenticated'
  AND table_schema = 'public'
  AND table_name = 'profiles'
  AND privilege_type = 'UPDATE'
ORDER BY column_name;

-- 2. Expect NO row for profiles/UPDATE (the table-level grant must be gone).
SELECT privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'authenticated'
  AND table_schema = 'public'
  AND table_name = 'profiles'
  AND privilege_type = 'UPDATE';

-- 3. Plans must be unchanged by this migration.
SELECT plan, count(*) FROM public.profiles GROUP BY plan ORDER BY count DESC;
