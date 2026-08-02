-- ============================================================
-- Verified Live RLS Remediation — 2026-07-21
-- Source: verified live Supabase audit results (not migration history)
-- Branch: feat/platform-foundation
-- DO NOT APPLY TO PRODUCTION — staging only until approved
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- SECTION 1: Pin search_path on SECURITY DEFINER functions
--
-- Both my_shop_ids() and my_role() are SECURITY DEFINER with no
-- search_path pin. An attacker who can create objects in a
-- schema earlier on the search_path can intercept these calls.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.my_shop_ids()
RETURNS UUID[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT ARRAY(
    SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.my_shop_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_shop_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_role() TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- SECTION 2: Shop membership helper functions (SECURITY INVOKER)
-- Safe to call with caller's own privileges.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_is_shop_member(p_shop_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_users
    WHERE user_id = auth.uid() AND shop_id = p_shop_id
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_shop_role(p_shop_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_users
    WHERE user_id = auth.uid()
      AND shop_id = p_shop_id
      AND role = ANY(p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_read_financials(p_shop_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.current_user_has_shop_role(p_shop_id, ARRAY['owner','manager','advisor']);
$$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_staff(p_shop_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.current_user_has_shop_role(p_shop_id, ARRAY['owner','manager']);
$$;

REVOKE ALL ON FUNCTION public.current_user_is_shop_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_has_shop_role(UUID, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_can_read_financials(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_can_manage_staff(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_shop_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_shop_role(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_read_financials(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_staff(UUID) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- SECTION 3: Revoke anon from business tables
--
-- Default Supabase grant gives anon SELECT on all tables in
-- the public schema. Remove it for every business table.
-- service_role is BYPASSRLS — no grant needed.
-- ──────────────────────────────────────────────────────────────

REVOKE ALL ON public.appointments         FROM anon;
REVOKE ALL ON public.audit_logs           FROM anon;
REVOKE ALL ON public.campaigns            FROM anon;
REVOKE ALL ON public.closed_jobs          FROM anon;
REVOKE ALL ON public.customers            FROM anon;
REVOKE ALL ON public.entity_images        FROM anon;
REVOKE ALL ON public.estimate_followups   FROM anon;
REVOKE ALL ON public.estimates            FROM anon;
REVOKE ALL ON public.inspections          FROM anon;
REVOKE ALL ON public.invoices             FROM anon;
REVOKE ALL ON public.job_cards            FROM anon;
REVOKE ALL ON public.maintenance_schedules FROM anon;
REVOKE ALL ON public.messages             FROM anon;
REVOKE ALL ON public.parts                FROM anon;
REVOKE ALL ON public.payments             FROM anon;
REVOKE ALL ON public.profiles             FROM anon;
REVOKE ALL ON public.technician_tasks     FROM anon;
REVOKE ALL ON public.vehicle_images       FROM anon;

-- ──────────────────────────────────────────────────────────────
-- SECTION 4: Enable RLS on tables where it is currently disabled
-- All done with FORCE to cover table owner connections too.
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.appointments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments         FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs           FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages             FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.technician_tasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_tasks     FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.vehicle_images       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_images       FORCE  ROW LEVEL SECURITY;

-- FORCE on tables that already have RLS (adds owner restriction)
ALTER TABLE public.campaigns            FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.closed_jobs          FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.customers            FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.entity_images        FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.estimate_followups   FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.estimates            FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.inspections          FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.invoices             FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.job_cards            FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_schedules FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.parts                FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.payments             FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.profiles             FORCE  ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────
-- SECTION 5: Drop all USING(true) policies
--
-- Permissive policies combine with OR in PostgreSQL, so a
-- USING(true) policy defeats every shop-scoped policy on the
-- same table. DROP them all before adding correct ones.
-- ──────────────────────────────────────────────────────────────

-- appointments (2 dangerous policies, plus old-format policies)
DROP POLICY IF EXISTS "allow all for authenticated"    ON public.appointments;
DROP POLICY IF EXISTS "appointments_all"               ON public.appointments;
-- Drop ANY pre-existing shop-scoped appointments policies to replace cleanly
DROP POLICY IF EXISTS "appointments_shop_scoped"       ON public.appointments;
DROP POLICY IF EXISTS "appointments_shop_scoped_read"  ON public.appointments;
DROP POLICY IF EXISTS "appointments_shop_scoped_write" ON public.appointments;

-- campaigns
DROP POLICY IF EXISTS "auth_all_campaigns"             ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_shop_scoped"          ON public.campaigns;

-- closed_jobs
DROP POLICY IF EXISTS "auth_all_closed_jobs"           ON public.closed_jobs;
DROP POLICY IF EXISTS "closed_jobs_shop_scoped"        ON public.closed_jobs;

-- customers — drop all_customers but KEEP portal_read (intentional anon)
DROP POLICY IF EXISTS "auth_all_customers"             ON public.customers;

-- entity_images
DROP POLICY IF EXISTS "authenticated users can manage entity images" ON public.entity_images;
DROP POLICY IF EXISTS "entity_images_shop_scoped"      ON public.entity_images;

-- estimate_followups
DROP POLICY IF EXISTS "auth_all_estimate_followups"    ON public.estimate_followups;
DROP POLICY IF EXISTS "estimate_followups_shop_scoped" ON public.estimate_followups;

-- estimates — keep estimates_portal_update (intentional anon approve/decline)
DROP POLICY IF EXISTS "auth_all_estimates"             ON public.estimates;

-- inspections
DROP POLICY IF EXISTS "auth_all_inspections"           ON public.inspections;

-- invoices
DROP POLICY IF EXISTS "auth_all_invoices"              ON public.invoices;

-- job_cards
DROP POLICY IF EXISTS "auth_all_job_cards"             ON public.job_cards;

-- maintenance_schedules
DROP POLICY IF EXISTS "auth_all_maintenance_schedules" ON public.maintenance_schedules;

-- parts
DROP POLICY IF EXISTS "auth_all_parts"                 ON public.parts;

-- payments
DROP POLICY IF EXISTS "auth_all_payments"              ON public.payments;
DROP POLICY IF EXISTS "payments_shop_scoped"           ON public.payments;

-- profiles — drop both dangerous variants, keep portal-specific policies
DROP POLICY IF EXISTS "auth_all_profiles"              ON public.profiles;
DROP POLICY IF EXISTS "profiles_read"                  ON public.profiles;
DROP POLICY IF EXISTS "profiles_owner_manage"          ON public.profiles;
DROP POLICY IF EXISTS "profiles_shop_scoped_read"      ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update"           ON public.profiles;

-- ──────────────────────────────────────────────────────────────
-- SECTION 6: Add correct shop-scoped policies
-- ──────────────────────────────────────────────────────────────

-- ── 6a: appointments ──────────────────────────────────────────

CREATE POLICY appointments_shop_member_read
  ON public.appointments FOR SELECT TO authenticated
  USING (shop_id = ANY(public.my_shop_ids()));

CREATE POLICY appointments_shop_member_insert
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

CREATE POLICY appointments_shop_member_update
  ON public.appointments FOR UPDATE TO authenticated
  USING  (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Only owner/manager can delete appointments
-- (technicians are excluded; advisors can manage their own)
CREATE POLICY appointments_manager_delete
  ON public.appointments FOR DELETE TO authenticated
  USING (
    public.current_user_has_shop_role(shop_id, ARRAY['owner','manager'])
  );

-- ── 6b: campaigns (no technician access) ──────────────────────

CREATE POLICY campaigns_non_tech_all
  ON public.campaigns FOR ALL TO authenticated
  USING  (
    shop_id = ANY(public.my_shop_ids())
    AND public.current_user_has_shop_role(shop_id, ARRAY['owner','manager','advisor'])
  )
  WITH CHECK (
    shop_id = ANY(public.my_shop_ids())
    AND public.current_user_has_shop_role(shop_id, ARRAY['owner','manager','advisor'])
  );

-- ── 6c: closed_jobs (read-only for all shop members) ─────────

CREATE POLICY closed_jobs_shop_member_read
  ON public.closed_jobs FOR SELECT TO authenticated
  USING (shop_id = ANY(public.my_shop_ids()));

-- closed_jobs are inserted via service_role (job close API) — no
-- INSERT/UPDATE/DELETE policies for authenticated needed.

-- ── 6d: entity_images (via shop_id TEXT column, needs cast) ───

CREATE POLICY entity_images_shop_member_read
  ON public.entity_images FOR SELECT TO authenticated
  USING (
    shop_id IS NOT NULL
    AND shop_id::uuid = ANY(public.my_shop_ids())
  );

CREATE POLICY entity_images_shop_member_insert
  ON public.entity_images FOR INSERT TO authenticated
  WITH CHECK (
    shop_id IS NOT NULL
    AND shop_id::uuid = ANY(public.my_shop_ids())
  );

CREATE POLICY entity_images_shop_member_update
  ON public.entity_images FOR UPDATE TO authenticated
  USING  (shop_id IS NOT NULL AND shop_id::uuid = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id IS NOT NULL AND shop_id::uuid = ANY(public.my_shop_ids()));

-- Owner/manager can delete; technicians can only add
CREATE POLICY entity_images_manager_delete
  ON public.entity_images FOR DELETE TO authenticated
  USING (
    shop_id IS NOT NULL
    AND public.current_user_has_shop_role(shop_id::uuid, ARRAY['owner','manager','advisor'])
  );

-- ── 6e: estimate_followups ────────────────────────────────────

CREATE POLICY estimate_followups_shop_member
  ON public.estimate_followups FOR ALL TO authenticated
  USING  (shop_id = ANY(public.my_shop_ids()))
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- ── 6f: profiles ──────────────────────────────────────────────
-- Only allow users to read profiles of people in their own shop(s)
-- AND their own profile row.
-- No client-side role changes. Self-update covers safe columns only.

CREATE POLICY profiles_self_read
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR id IN (
      SELECT user_id FROM public.shop_users
      WHERE shop_id = ANY(public.my_shop_ids())
    )
  );

-- Allow users to update their own non-role fields.
-- The role column is explicitly excluded by adding a CHECK CONSTRAINT below.
CREATE POLICY profiles_self_update
  ON public.profiles FOR UPDATE TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── 6g: vehicle_images (no shop_id — join via vehicles) ───────

CREATE POLICY vehicle_images_shop_member_read
  ON public.vehicle_images FOR SELECT TO authenticated
  USING (
    vehicle_id IN (
      SELECT id FROM public.vehicles
      WHERE shop_id = ANY(public.my_shop_ids())
    )
  );

CREATE POLICY vehicle_images_shop_member_insert
  ON public.vehicle_images FOR INSERT TO authenticated
  WITH CHECK (
    vehicle_id IN (
      SELECT id FROM public.vehicles
      WHERE shop_id = ANY(public.my_shop_ids())
    )
  );

CREATE POLICY vehicle_images_shop_member_update
  ON public.vehicle_images FOR UPDATE TO authenticated
  USING (
    vehicle_id IN (
      SELECT id FROM public.vehicles WHERE shop_id = ANY(public.my_shop_ids())
    )
  )
  WITH CHECK (
    vehicle_id IN (
      SELECT id FROM public.vehicles WHERE shop_id = ANY(public.my_shop_ids())
    )
  );

-- Only owner/manager/advisor can delete vehicle images
CREATE POLICY vehicle_images_manager_delete
  ON public.vehicle_images FOR DELETE TO authenticated
  USING (
    vehicle_id IN (
      SELECT v.id FROM public.vehicles v
      JOIN public.shop_users su ON su.shop_id = v.shop_id
      WHERE su.user_id = auth.uid()
        AND su.role IN ('owner','manager','advisor')
    )
  );

-- ── 6h: payments (financial role gate) ────────────────────────
-- Following existing application behavior: owner+manager+advisor
-- have access. Technicians are denied. Pending explicit product
-- sign-off to restrict further to owner+manager only.

CREATE POLICY payments_financial_roles
  ON public.payments FOR ALL TO authenticated
  USING  (
    shop_id = ANY(public.my_shop_ids())
    AND public.current_user_can_read_financials(shop_id)
  )
  WITH CHECK (
    shop_id = ANY(public.my_shop_ids())
    AND public.current_user_can_read_financials(shop_id)
  );

-- ──────────────────────────────────────────────────────────────
-- SECTION 7: Protect profiles.role from client-side mutation
--
-- The self_update policy above allows update of own row. This
-- CHECK CONSTRAINT prevents any UPDATE from changing the role
-- column via the client path (even service_role via RLS bypasses
-- this if it reaches here, but service_role bypasses RLS so the
-- constraint is the last line of defense).
-- ──────────────────────────────────────────────────────────────

-- Add constraint only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'profiles'
      AND constraint_name = 'profiles_role_values_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_values_check
      CHECK (role IN ('Owner', 'Advisor', 'Technician', 'Manager', NULL));
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- SECTION 8: Tables with no client-side queries — deny all
-- (RLS enabled in Section 4; adding no policy = deny all for
-- authenticated role; service_role bypasses via BYPASSRLS)
-- audit_logs, messages, technician_tasks: no policy = safe.
-- ──────────────────────────────────────────────────────────────

-- No policies added intentionally.
-- verified: services layer does not query these tables client-side.

-- ──────────────────────────────────────────────────────────────
-- SECTION 9: Subscriptions
-- ──────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subscriptions FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON public.subscriptions FROM anon;

-- Users can read their own subscription
CREATE POLICY subscriptions_self_read
  ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR shop_id = ANY(public.my_shop_ids()));

-- ──────────────────────────────────────────────────────────────
-- SECTION 10: Verification markers
-- After applying, re-run the Phase 2 verification query from
-- docs/VERIFIED_LIVE_RLS_REMEDIATION_PLAN.md Section 4.
-- Expected results:
--   - All 18 listed tables: rls_enabled = true
--   - Zero rows with using_expr = 'true' (except estimates_portal_update
--     which is an intentional anon-scoped policy, not USING(true))
--   - anon has no INSERT/UPDATE/DELETE on any business table
--   - my_shop_ids() and my_role() show search_path_setting IS NOT NULL
-- ──────────────────────────────────────────────────────────────

COMMIT;
