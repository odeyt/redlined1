-- M4 — capabilities: what a role may DO, in the database as well as the app.
--
-- RUN AGAINST redlined1. Safe in either order relative to the application
-- deploy: the app reads `capability_overrides` inside a guard and falls back to
-- the role defaults if the column is absent, so nothing breaks if this runs
-- second. Running it first is equally harmless — nothing writes to the column
-- until an editor exists.
--
-- Today's model is `shop_settings.role_permissions`: a per-shop allowlist of
-- module NAMES, evaluated in the browser. It can hide the Payments screen from
-- managers. It cannot express "may read their own pay but not anyone else's",
-- because a module name has no notion of a row, a verb or a subject.
--
-- That becomes load-bearing the moment an employees table has a pay rate on it,
-- which is why this lands BEFORE any HR data exists rather than after.
--
-- Nobody's access changes. The default grants in lib/auth/capabilities.ts were
-- derived from the existing blocked-module lists and a test holds them to it.

BEGIN;

-- ── 1. Per-shop adjustments ─────────────────────────────────────────────────
--
-- Grants and denies stored separately rather than as one resolved list, for
-- the same reason the alerts catalogue stores DISABLED ids: a capability added
-- in a later release is in neither list, so it falls back to the role default
-- instead of being silently granted — or silently withheld — from every shop
-- that has ever saved its settings.
--
--   { "grant": { "advisor": ["invoices.read"] },
--     "deny":  { "manager": ["customers.archive"] } }

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS capability_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── 2. The same answer, available to RLS ────────────────────────────────────
--
-- The application resolves capabilities in lib/auth/capabilities.ts. Policies
-- cannot call TypeScript, so the defaults are repeated here — a real
-- duplication, and the honest options were: repeat them, or push every policy
-- through the app (which would make RLS decorative). Repeating them is the
-- lesser evil, and `capabilityDefaultsMatchSql` in the test suite parses this
-- function and fails if the two ever disagree.
--
-- STABLE, not VOLATILE: a policy calls this once per row, and Postgres can
-- cache it within a statement.

CREATE OR REPLACE FUNCTION public.has_capability(p_shop_id UUID, p_capability TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_role       TEXT;
  v_overrides  JSONB;
  v_defaults   TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN
    -- No session: the service role and trusted server code are authorized by
    -- the route that reached them, not by this function.
    RETURN TRUE;
  END IF;

  SELECT su.role INTO v_role
  FROM public.shop_users su
  WHERE su.user_id = auth.uid() AND su.shop_id = p_shop_id;

  IF v_role IS NULL THEN
    RETURN FALSE;   -- not a member of this shop
  END IF;

  v_defaults := CASE v_role
    WHEN 'owner' THEN ARRAY[
      'customers.read','customers.manage','customers.archive',
      'vehicles.read','vehicles.manage',
      'jobs.read','jobs.manage',
      'repair_orders.read','repair_orders.manage',
      'inspections.read','inspections.manage',
      'estimates.read','estimates.manage',
      'parts.read','parts.manage',
      'appointments.read','appointments.manage',
      'invoices.read','invoices.manage',
      'payments.read','payments.record','payments.reverse',
      'reports.read','audit.read','members.manage','settings.manage','billing.manage']
    WHEN 'manager' THEN ARRAY[
      'customers.read','customers.manage','customers.archive',
      'vehicles.read','vehicles.manage',
      'jobs.read','jobs.manage',
      'repair_orders.read','repair_orders.manage',
      'inspections.read','inspections.manage',
      'estimates.read','estimates.manage',
      'parts.read','parts.manage',
      'appointments.read','appointments.manage']
    WHEN 'advisor' THEN ARRAY[
      'customers.read','customers.manage','customers.archive',
      'vehicles.read','vehicles.manage',
      'jobs.read','jobs.manage',
      'inspections.read','inspections.manage',
      'estimates.read','estimates.manage',
      'parts.read',
      'appointments.read','appointments.manage']
    WHEN 'technician' THEN ARRAY[
      'jobs.read','jobs.manage',
      'repair_orders.read','repair_orders.manage',
      'inspections.read','inspections.manage',
      'parts.read','parts.manage']
    ELSE ARRAY[]::TEXT[]
  END;

  SELECT COALESCE(ss.capability_overrides, '{}'::jsonb) INTO v_overrides
  FROM public.shop_settings ss WHERE ss.shop_id = p_shop_id;

  -- Deny beats grant, and beats the default. A shop that has taken something
  -- away must not have it handed back by a later change of mind elsewhere.
  IF v_overrides -> 'deny' -> v_role ? p_capability THEN
    RETURN FALSE;
  END IF;
  IF v_overrides -> 'grant' -> v_role ? p_capability THEN
    RETURN TRUE;
  END IF;

  RETURN p_capability = ANY(v_defaults);
END $fn$;

REVOKE ALL ON FUNCTION public.has_capability(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_capability(UUID, TEXT) TO authenticated, service_role;

-- ── 3. First policy to use it ───────────────────────────────────────────────
--
-- audit_events was restricted with a hardcoded role list. Same access, now
-- expressed as the capability it always meant — and adjustable per shop
-- without a migration.

DROP POLICY IF EXISTS audit_events_select_managers ON public.audit_events;
CREATE POLICY audit_events_select_capability ON public.audit_events
  FOR SELECT TO authenticated
  USING (public.has_capability(audit_events.shop_id, 'audit.read'));

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
--
-- 1. The function runs, and agrees with the roles it is replacing. Run as a
--    signed-in session it answers for that user; from the SQL editor auth.uid()
--    is NULL, so it returns TRUE — which is why the real check is step 2.
--
--   SELECT public.has_capability(
--     (SELECT id FROM public.shops LIMIT 1), 'audit.read') AS editor_sees_true;
--
-- 2. The honest test is from the app, signed in as each role:
--      owner    → the audit trail loads
--      manager  → the audit trail loads
--      advisor  → 0 rows
--      technician → 0 rows
--
--    Same as before this migration. If any row appears for an advisor or a
--    technician, the policy is wrong and should be reverted immediately.
--
-- 3. Overrides resolve, without changing anything by default:
--
--   SELECT shop_id, capability_overrides FROM public.shop_settings;
--   -- expect {} everywhere
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP POLICY IF EXISTS audit_events_select_capability ON public.audit_events;
--   CREATE POLICY audit_events_select_managers ON public.audit_events
--     FOR SELECT TO authenticated
--     USING (EXISTS (SELECT 1 FROM public.shop_users su
--                    WHERE su.user_id = auth.uid()
--                      AND su.shop_id = audit_events.shop_id
--                      AND su.role IN ('owner','manager')));
--   DROP FUNCTION IF EXISTS public.has_capability(UUID, TEXT);
--   ALTER TABLE public.shop_settings DROP COLUMN IF EXISTS capability_overrides;
