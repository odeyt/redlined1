-- ============================================================
-- Resolve conflicts between the 20260720_* migration set (this
-- session's prior work) and 20260721_01_verified_live_remediation.sql
-- (a separate Claude session's work, based on live audit findings the
-- user supplied directly). Both sets create policies on `payments` and
-- `subscriptions` — applying both as originally written would leave
-- TWO permissive policies active on each table simultaneously, and
-- PostgreSQL combines permissive policies with OR, meaning the LESS
-- restrictive one silently wins. This is the exact bug class this whole
-- remediation exists to fix, reintroduced in miniature by having two
-- independently-authored migration sets touch the same tables.
--
-- Run AFTER both 20260720_05_financial_table_role_gate.sql and
-- 20260721_01_verified_live_remediation.sql. See
-- docs/STAGING_MIGRATION_MANIFEST.md for the full conflict analysis.
--
-- DO NOT APPLY TO PRODUCTION — staging only until approved, same as
-- every other migration in this file's numbered series.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- payments: 20260721_01's payments_financial_roles is canonical.
--
-- 20260720_05 additionally created a STRICTER delete-only-for-
-- owner/manager policy (payments_owner_manager_delete), excluding
-- advisor from deletes specifically. 20260721_01's own plan doc
-- (docs/VERIFIED_LIVE_RLS_REMEDIATION_PLAN.md) explicitly reasons
-- through this and deliberately keeps advisor included for ALL
-- payments operations (including delete), to match the existing
-- production paymentService.ts behavior rather than break a live
-- workflow without product sign-off. That is the more current,
-- more carefully product-reasoned decision — drop 20260720_05's
-- stricter, less-informed policies so only one payments policy
-- set is ever active.
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "payments_financial_read"      ON public.payments;
DROP POLICY IF EXISTS "payments_financial_insert"     ON public.payments;
DROP POLICY IF EXISTS "payments_financial_update"     ON public.payments;
DROP POLICY IF EXISTS "payments_owner_manager_delete" ON public.payments;

-- ──────────────────────────────────────────────────────────────
-- subscriptions: 20260720_05's role-gated read is canonical, NOT
-- 20260721_01's subscriptions_self_read.
--
-- 20260721_01's subscriptions_self_read policy is
-- `USING (user_id = auth.uid() OR shop_id = ANY(my_shop_ids()))` —
-- this grants read access to EVERY member of a shop, INCLUDING
-- technicians, with no role check at all. This directly
-- contradicts this task's own explicit requirement ("technician
-- access to payments or subscriptions" is named as a CRITICAL
-- finding trigger) and 20260720_05's subscriptions_financial_read
-- policy (owner/manager/advisor only, via
-- current_user_can_read_financials(), technician excluded) is the
-- one that actually satisfies it. Drop the less-restrictive one.
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "subscriptions_self_read" ON public.subscriptions;

-- Defensive: confirm the canonical policy actually exists after
-- both migrations have run. If 20260720_05 was skipped for any
-- reason, subscriptions would now have RLS enabled with NO read
-- policy at all (safe — deny-all — but likely not the intended
-- end state). This does not create anything; it only raises a
-- clear, loud notice so a human notices the gap immediately rather
-- than discovering it as an unexplained empty-results bug later.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions'
      AND policyname = 'subscriptions_financial_read'
  ) THEN
    RAISE WARNING 'subscriptions_financial_read policy not found — apply 20260720_05_financial_table_role_gate.sql before this migration, or subscriptions will be unreadable by any authenticated role (deny-all, not broken, but likely not intended).';
  END IF;
END $$;

COMMIT;
