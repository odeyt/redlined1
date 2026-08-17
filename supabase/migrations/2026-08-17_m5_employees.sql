-- M5 — one record per person, per business.
--
-- RUN AGAINST redlined1 BEFORE deploying the M5 application change: the app
-- reads employees, and cannot read a table that does not exist.
--
-- PREREQUISITE, already done: D1's two shops share one organization. Without
-- that this migration produces two employees for every person and the
-- double-count it exists to prevent survives into payroll.
--
-- ## The problem
--
-- `technicians` is a per-SHOP directory. D1 has 25 technician rows for 13
-- people — 12 of them appear once in each location. That is correct for a
-- shop-floor roster ("who works here") and wrong for anything about the
-- person: pay them twice, count their attendance twice, give them two
-- employment histories.
--
-- ## The shape
--
--   organizations
--        └── employees            one row per PERSON        ← new
--                 ▲
--                 │ employee_id
--        shops ── technicians     one row per person PER SHOP  (unchanged)
--
-- `technicians` is deliberately left alone. Job cards store technician NAMES
-- and match them per shop; rewriting that is a separate, riskier change with
-- no benefit to this milestone. The directory stays the shop-facing view and
-- gains a pointer to the person it describes.
--
-- ## What is NOT here
--
-- No pay, no attendance, no leave. `technicians.pay_type` and `pay_rate` stay
-- where they are. Salary belongs on an employee and needs to be versioned —
-- "what were they paid in March" is a question a single column cannot answer —
-- and versioned salary with the capability checks to protect it is its own
-- milestone. Moving pay here now would mean an unversioned salary column
-- readable by anyone who can read an employee.

BEGIN;

CREATE TABLE IF NOT EXISTS public.employees (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  full_name         TEXT NOT NULL,
  email             TEXT,
  phone             TEXT,
  /** The login, where they have one. Most staff do not. */
  user_id           UUID,
  employment_status TEXT NOT NULL DEFAULT 'Active',
  hire_date         DATE,
  end_date          DATE,
  notes             TEXT,
  archived_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT employees_status_check
    CHECK (employment_status IN ('Active', 'On leave', 'Suspended', 'Left'))
);

-- One person, one record. Two employees sharing a login inside one business is
-- the double-count coming back by another route.
CREATE UNIQUE INDEX IF NOT EXISTS employees_one_per_login
  ON public.employees (organization_id, user_id)
  WHERE user_id IS NOT NULL;

-- Names are not unique in general — two people really can be called Kham — so
-- this is an index for lookup, NOT a constraint. The back-fill below dedupes
-- on name deliberately and says so; a genuine namesake would have to be split
-- by hand, which is the right way round: merging by accident is worse than
-- separating by hand.
CREATE INDEX IF NOT EXISTS employees_org_name_idx
  ON public.employees (organization_id, lower(full_name));

CREATE INDEX IF NOT EXISTS employees_active_idx
  ON public.employees (organization_id)
  WHERE archived_at IS NULL;

-- ── The link back to the shop-floor directory ───────────────────────────────

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS technicians_employee_idx ON public.technicians (employee_id);

-- ── Back-fill ───────────────────────────────────────────────────────────────
--
-- One employee per distinct name per organization. Case- and
-- whitespace-insensitive, because "John" and "john " are the same person in a
-- roster typed by hand.
--
-- Earliest row wins for the details: the first time somebody was entered is
-- more likely to be their real hire date than a later copy made when a second
-- location opened.

INSERT INTO public.employees (organization_id, full_name, email, phone, user_id, hire_date, employment_status, notes)
SELECT DISTINCT ON (s.organization_id, lower(trim(t.name)))
  s.organization_id,
  trim(t.name),
  NULLIF(trim(COALESCE(t.email, '')), ''),
  NULLIF(trim(COALESCE(t.phone, '')), ''),
  -- If ANY of their rows is linked to a login, the person has one.
  (SELECT t2.user_id FROM public.technicians t2
   JOIN public.shops s2 ON s2.id = t2.shop_id
   WHERE s2.organization_id = s.organization_id
     AND lower(trim(t2.name)) = lower(trim(t.name))
     AND t2.user_id IS NOT NULL
   LIMIT 1),
  t.hire_date,
  CASE WHEN COALESCE(t.status, 'Active') IN ('Active', 'On leave', 'Suspended', 'Left')
       THEN COALESCE(t.status, 'Active') ELSE 'Active' END,
  t.notes
FROM public.technicians t
JOIN public.shops s ON s.id = t.shop_id
WHERE s.organization_id IS NOT NULL
  AND trim(COALESCE(t.name, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.organization_id = s.organization_id
      AND lower(e.full_name) = lower(trim(t.name))
  )
ORDER BY s.organization_id, lower(trim(t.name)), t.created_at NULLS LAST;

UPDATE public.technicians t
SET employee_id = e.id
FROM public.shops s, public.employees e
WHERE t.shop_id = s.id
  AND e.organization_id = s.organization_id
  AND lower(e.full_name) = lower(trim(t.name))
  AND t.employee_id IS NULL;

-- ── Access ──────────────────────────────────────────────────────────────────

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Scoped by organization, through shop membership. An employee record is
-- readable by anyone with employees.read in ANY shop of that organization,
-- which is what makes one record per person work across two locations.
DROP POLICY IF EXISTS employees_select ON public.employees;
CREATE POLICY employees_select ON public.employees
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = employees.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'employees.read')
  ));

DROP POLICY IF EXISTS employees_write ON public.employees;
CREATE POLICY employees_write ON public.employees
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = employees.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'employees.manage')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = employees.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'employees.manage')
  ));

GRANT SELECT, INSERT, UPDATE ON public.employees TO authenticated;
-- No DELETE grant. An employee record is employment history; it is archived,
-- like a customer, for the same reason.

-- ── Capabilities become enforced ────────────────────────────────────────────
--
-- employees.read and employees.manage move from 'planned' to enforced, and
-- has_capability must agree with lib/auth/capabilities.ts — a test parses this
-- function and fails if they diverge.
--
-- Owner manages, owner and manager read. Deliberately NOT technicians, even
-- though they can open today's Technicians screen: an employee record is about
-- a person's employment, and it is where pay will live. Narrowing now, before
-- there is anything sensitive on it, is cheaper than narrowing later.

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
    RETURN TRUE;
  END IF;

  SELECT su.role INTO v_role
  FROM public.shop_users su
  WHERE su.user_id = auth.uid() AND su.shop_id = p_shop_id;

  IF v_role IS NULL THEN
    RETURN FALSE;
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
      'reports.read','audit.read','members.manage','settings.manage','billing.manage',
      'employees.read','employees.manage']
    WHEN 'manager' THEN ARRAY[
      'customers.read','customers.manage','customers.archive',
      'vehicles.read','vehicles.manage',
      'jobs.read','jobs.manage',
      'repair_orders.read','repair_orders.manage',
      'inspections.read','inspections.manage',
      'estimates.read','estimates.manage',
      'parts.read','parts.manage',
      'appointments.read','appointments.manage',
      'employees.read']
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

  IF v_overrides -> 'deny' -> v_role ? p_capability THEN
    RETURN FALSE;
  END IF;
  IF v_overrides -> 'grant' -> v_role ? p_capability THEN
    RETURN TRUE;
  END IF;

  RETURN p_capability = ANY(v_defaults);
END $fn$;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
--
-- 1. One employee per person, not per shop:
--
--   SELECT o.name AS organization, count(*) AS employees
--   FROM public.employees e JOIN public.organizations o ON o.id = e.organization_id
--   GROUP BY o.name ORDER BY o.name;
--
--   Expect 13 for D1 Imports — not 25, which is the technician row count.
--
-- 2. Every technician row points at a person:
--
--   SELECT count(*) AS unlinked FROM public.technicians WHERE employee_id IS NULL;
--   -- expect 0
--
-- 3. The two locations share their people:
--
--   SELECT e.full_name, count(DISTINCT t.shop_id) AS shops
--   FROM public.employees e JOIN public.technicians t ON t.employee_id = e.id
--   GROUP BY e.full_name HAVING count(DISTINCT t.shop_id) > 1
--   ORDER BY e.full_name;
--
--   Expect the 12 duplicated names, each now ONE employee working at 2 shops.
--
-- 4. John's login carried across from whichever row had it:
--
--   SELECT full_name, user_id IS NOT NULL AS has_login
--   FROM public.employees WHERE lower(full_name) = 'john';
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.technicians DROP COLUMN IF EXISTS employee_id;
--   DROP TABLE IF EXISTS public.employees;
--   -- then re-apply the has_capability body from 2026-08-17_m4_capabilities.sql
--
--   Nothing else references employees, and technicians is untouched apart from
--   the dropped column.
