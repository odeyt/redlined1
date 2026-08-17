-- Let the E2E harness delete the throwaway shops it creates.
--
-- RUN AGAINST redlined1. Adds one function; changes two triggers to recognise
-- a purge in progress. No data is touched.
--
-- ## What broke
--
-- The local E2E suite provisions its own shop, works inside it, and deletes it
-- afterwards — which is what makes it safe to run against a real project. M2
-- and M1 made that impossible without anyone noticing:
--
--   * `payments` and `audit_events` are append-only. DELETE is revoked from
--     every application role AND blocked by a trigger.
--   * Both carry a foreign key to `shops`.
--
-- So a run that recorded a payment, or simply edited a customer, left a shop
-- that can never be removed. `payments` and `maintenance_schedules` were not
-- even in the harness's table list.
--
-- ## The escape hatch, and why it is narrow
--
-- Append-only is worth keeping. So rather than weakening it, this adds one
-- SECURITY DEFINER function that:
--
--   1. REFUSES unless the shop's name starts with the synthetic marker '[E2E]'.
--      A real shop cannot be purged by it, whatever the caller intends.
--   2. Is granted to service_role ONLY. No signed-in user can reach it.
--   3. Sets a session flag the append-only triggers recognise, so the
--      exemption is visible in the trigger body rather than hidden in a role.
--
-- The flag is not a security boundary on its own — anyone who could set it
-- would still need the DELETE that only this function has. It exists so that
-- somebody reading the trigger can see the one case where deletion is allowed,
-- instead of wondering why the rule has a hole.

BEGIN;

-- ── 1. Teach the append-only triggers about a purge ─────────────────────────

CREATE OR REPLACE FUNCTION public.audit_events_are_append_only()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  -- The single exemption: purge_synthetic_shop, tearing down an E2E tenant.
  IF current_setting('redlined1.purging_synthetic_shop', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only (attempted %)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $fn$;

CREATE OR REPLACE FUNCTION public.payments_are_append_only()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_setting('redlined1.purging_synthetic_shop', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    'payments is an append-only ledger (attempted %). Reverse the entry instead.', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $fn$;

-- ── 2. The purge ────────────────────────────────────────────────────────────
--
-- Every table carrying a shop_id is discovered from the catalogue rather than
-- listed here. A hand-maintained list is what left payments and
-- maintenance_schedules behind, and it would fall behind again the next time a
-- table is added.
--
-- Deletion order is not computed. Rows are deleted in repeated passes, and a
-- foreign-key violation simply means "not yet" — the pass that clears the
-- child makes the parent deletable next time round. Cheaper and more robust
-- than encoding a dependency graph that would itself go stale.

CREATE OR REPLACE FUNCTION public.purge_synthetic_shop(p_shop_id UUID)
RETURNS TABLE (table_name TEXT, rows_deleted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_name     TEXT;
  v_org      UUID;
  v_table    TEXT;
  v_deleted  BIGINT;
  v_pass     INT;
  v_progress BOOLEAN;
  v_pending  TEXT[];
BEGIN
  SELECT s.name, s.organization_id INTO v_name, v_org
  FROM public.shops s WHERE s.id = p_shop_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'No such shop';
  END IF;

  -- The guard. Everything else in this function is destructive, so this is the
  -- only line that matters for safety.
  IF v_name NOT LIKE '[E2E]%' THEN
    RAISE EXCEPTION 'Refusing to purge %: not a synthetic E2E shop', v_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM set_config('redlined1.purging_synthetic_shop', 'on', true);

  SELECT array_agg(c.table_name::TEXT) INTO v_pending
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = 'public'
    AND c.column_name = 'shop_id'
    AND t.table_type = 'BASE TABLE'
    AND c.table_name <> 'shops';

  FOR v_pass IN 1..6 LOOP
    v_progress := FALSE;
    FOREACH v_table IN ARRAY COALESCE(v_pending, ARRAY[]::TEXT[]) LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE shop_id = $1', v_table)
          USING p_shop_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        IF v_deleted > 0 THEN
          v_progress := TRUE;
          table_name := v_table; rows_deleted := v_deleted; RETURN NEXT;
        END IF;
      EXCEPTION
        WHEN foreign_key_violation THEN
          -- A child still references these rows. The pass that clears the
          -- child makes this one succeed next time round.
          NULL;
      END;
    END LOOP;
    EXIT WHEN NOT v_progress;
  END LOOP;

  -- Employees hang off the organization, not the shop.
  IF v_org IS NOT NULL THEN
    DELETE FROM public.employees WHERE organization_id = v_org;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted > 0 THEN
      table_name := 'employees'; rows_deleted := v_deleted; RETURN NEXT;
    END IF;
  END IF;

  DELETE FROM public.shops WHERE id = p_shop_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  table_name := 'shops'; rows_deleted := v_deleted; RETURN NEXT;

  -- An organization left with no shops was created for this run and has no
  -- other purpose.
  IF v_org IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shops WHERE organization_id = v_org
  ) THEN
    DELETE FROM public.organizations WHERE id = v_org;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    table_name := 'organizations'; rows_deleted := v_deleted; RETURN NEXT;
  END IF;

  RETURN;
END $fn$;

-- service_role only. A signed-in user must never reach this, whatever their
-- capabilities say — the harness runs with the service key, nothing else does.
REVOKE ALL ON FUNCTION public.purge_synthetic_shop(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_synthetic_shop(UUID) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.purge_synthetic_shop(UUID) TO service_role;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
--
-- 1. It refuses a real shop. MUST fail with "not a synthetic E2E shop":
--
--   SELECT * FROM public.purge_synthetic_shop(
--     (SELECT id FROM public.shops WHERE name = 'D1 Imports'));
--
--   Run this FIRST. It is the only line in the function that protects
--   production data, and it is worth watching it refuse.
--
-- 2. Append-only still holds for everything else. MUST fail:
--
--   BEGIN; DELETE FROM public.audit_events; ROLLBACK;
--   BEGIN; DELETE FROM public.payments;     ROLLBACK;
--
-- 3. A synthetic shop is removable — inside a rolled-back transaction so it
--    proves the mechanism without destroying a real test fixture:
--
--   BEGIN;
--   INSERT INTO public.shops (id, name) VALUES (gen_random_uuid(), '[E2E] purge probe')
--     RETURNING id;
--   SELECT * FROM public.purge_synthetic_shop('<the id above>');
--   ROLLBACK;
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.purge_synthetic_shop(UUID);
--   -- then restore the two trigger bodies from
--   -- 2026-08-16_m1_domain_foundation.sql and 2026-08-17_m2_payment_ledger.sql
--   -- (they simply drop the current_setting exemption).
