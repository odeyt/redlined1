-- M9 — Expenses
--
-- What the business spends that is not inventory. `parts_orders` already
-- records money going to suppliers for parts, and that is stock, not cost:
-- it comes back as revenue when the part is fitted. Rent, fuel, tools, meals,
-- government fees and workshop supplies do not, and nothing has recorded them
-- until now.
--
-- ## Same currency rule as payroll
--
-- An expense is recorded in the currency it was actually paid in. No
-- conversion anywhere; totals are per currency. A shop buying parts in THB,
-- paying rent in LAK and billing some customers in USD has three real numbers,
-- and averaging them into one would be a made-up figure.
--
-- ## Submitting is not approving
--
-- Anyone may submit an expense — a technician who bought fuel out of pocket
-- needs to. Approving it is separate, and an approved expense is frozen: its
-- amount, date, category and currency cannot change afterwards, because it has
-- become a figure somebody signed off.
--
-- ## RUN THIS IN SECTIONS
--
-- Four sections, each ending in its own check. Paste one at a time and confirm
-- the result before moving on. Section line counts are given so you can tell a
-- truncated paste from a complete one — a paste cut mid-statement produces a
-- syntax error that looks like a bug in the SQL rather than a short clipboard.

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — tables and default categories        (about 90 lines)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_name_per_org
  ON public.expense_categories (organization_id, lower(name));

CREATE TABLE IF NOT EXISTS public.expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  -- Which location spent it. Rent belongs to a building, fuel to whoever was
  -- driving; an expense with no location cannot be reported on per shop, which
  -- is most of what an owner with two branches wants to know.
  shop_id          UUID NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
  category_id      UUID REFERENCES public.expense_categories(id) ON DELETE RESTRICT,

  amount           NUMERIC(14,2) NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  spent_on         DATE NOT NULL DEFAULT CURRENT_DATE,

  payee            TEXT,
  description      TEXT,
  payment_method   TEXT,

  status           TEXT NOT NULL DEFAULT 'Pending',

  -- Who is out of pocket, when it is somebody's own money. Null means the
  -- business paid it directly.
  paid_by_employee UUID REFERENCES public.employees(id) ON DELETE RESTRICT,
  reimbursed_on    DATE,

  submitted_by     UUID,
  decided_by       UUID,
  decided_at       TIMESTAMPTZ,
  decision_note    TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT expense_status_check
    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  CONSTRAINT expense_amount_positive CHECK (amount > 0),
  CONSTRAINT expense_decision_has_an_owner
    CHECK (status IN ('Pending', 'Cancelled') OR decided_by IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS expenses_org_date_idx
  ON public.expenses (organization_id, spent_on DESC);

CREATE INDEX IF NOT EXISTS expenses_shop_date_idx
  ON public.expenses (shop_id, spent_on DESC);

CREATE INDEX IF NOT EXISTS expenses_status_idx
  ON public.expenses (organization_id, status);

DROP TRIGGER IF EXISTS expenses_touch ON public.expenses;
CREATE TRIGGER expenses_touch
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Default categories, per organization, so the module is usable immediately.
-- A business renames or deactivates what it does not use; an empty list just
-- means nobody can file the first expense.
INSERT INTO public.expense_categories (organization_id, name)
SELECT o.id, c.name
FROM public.organizations o
CROSS JOIN (VALUES
  ('Rent'), ('Utilities'), ('Fuel'), ('Tools and equipment'),
  ('Workshop supplies'), ('Transport'), ('Meals'), ('Government fees'),
  ('Marketing'), ('Repairs and maintenance'), ('Other')
) AS c(name)
ON CONFLICT DO NOTHING;

COMMIT;

-- ── Check section 1 ─────────────────────────────────────────────────────────
SELECT 'tables (expect 2)' AS check_name, count(*)::text AS result
  FROM pg_tables WHERE schemaname = 'public'
   AND tablename IN ('expenses', 'expense_categories')
UNION ALL
SELECT 'categories seeded (expect 11 per business)', count(*)::text
  FROM public.expense_categories;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — freezing an approved expense        (about 45 lines)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Once approved, the figures are settled. What may still change afterwards is
-- the reimbursement date — money can go back to the person who paid days
-- later — so this is not a blanket lock on updates. It names the fields that
-- are frozen rather than freezing the row, which is the difference between a
-- rule and an obstruction.

BEGIN;

CREATE OR REPLACE FUNCTION public.expense_is_settled()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF OLD.status IN ('Approved', 'Rejected') THEN
    IF NEW.amount      IS DISTINCT FROM OLD.amount
    OR NEW.currency    IS DISTINCT FROM OLD.currency
    OR NEW.spent_on    IS DISTINCT FROM OLD.spent_on
    OR NEW.category_id IS DISTINCT FROM OLD.category_id
    OR NEW.shop_id     IS DISTINCT FROM OLD.shop_id THEN
      RAISE EXCEPTION
        'This expense was already %, so its amount, date, category and location cannot change.',
        lower(OLD.status);
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS expenses_settled ON public.expenses;
CREATE TRIGGER expenses_settled
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expense_is_settled();

COMMIT;

-- ── Check section 2 ─────────────────────────────────────────────────────────
SELECT 'freeze trigger (expect 1)' AS check_name, count(*)::text AS result
  FROM pg_trigger WHERE tgname = 'expenses_settled';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — row level security and grants        (about 95 lines)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Three ways to see an expense: expenses.read for anyone running the shop,
-- their own submission for whoever filed it, and their own reimbursement for
-- whoever is out of pocket. A technician who paid for fuel has to be able to
-- see whether it was approved.

BEGIN;

ALTER TABLE public.expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_categories_select ON public.expense_categories;
CREATE POLICY expense_categories_select ON public.expense_categories
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = expense_categories.organization_id
      AND su.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS expense_categories_write ON public.expense_categories;
CREATE POLICY expense_categories_write ON public.expense_categories
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = expense_categories.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'expenses.approve')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = expense_categories.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'expenses.approve')));

DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select ON public.expenses
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.shops s
      JOIN public.shop_users su ON su.shop_id = s.id
      WHERE s.organization_id = expenses.organization_id
        AND su.user_id = auth.uid()
        AND public.has_capability(s.id, 'expenses.read'))
    OR expenses.submitted_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.employees e
      WHERE e.id = expenses.paid_by_employee AND e.user_id = auth.uid())
  );

-- Submitting: anyone with expenses.create, and only ever as Pending. There is
-- no path here that files an already-approved expense.
DROP POLICY IF EXISTS expenses_insert ON public.expenses;
CREATE POLICY expenses_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'Pending'
    AND EXISTS (SELECT 1 FROM public.shops s
      JOIN public.shop_users su ON su.shop_id = s.id
      WHERE s.organization_id = expenses.organization_id
        AND su.user_id = auth.uid()
        AND public.has_capability(s.id, 'expenses.create'))
  );

DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = expenses.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'expenses.approve')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = expenses.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'expenses.approve')));

-- No DELETE. A submitted expense is cancelled or rejected, both of which leave
-- the row — otherwise the only trace of a rejected claim is that it stopped
-- being there.
REVOKE ALL ON public.expenses           FROM PUBLIC;
REVOKE ALL ON public.expense_categories FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON public.expenses           TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.expense_categories TO authenticated;

COMMIT;

-- ── Check section 3 ─────────────────────────────────────────────────────────
SELECT 'policies (expect 5)' AS check_name, count(*)::text AS result
  FROM pg_policies WHERE schemaname = 'public'
   AND tablename IN ('expenses', 'expense_categories')
UNION ALL
SELECT 'rls on', string_agg(c.relname || '=' || c.relrowsecurity::text, ', ' ORDER BY c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('expenses', 'expense_categories')
UNION ALL
SELECT 'nobody deletes an expense (expect false)',
       has_table_privilege('authenticated', 'public.expenses', 'DELETE')::text;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — capabilities        (about 105 lines)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- expenses.read, expenses.create and expenses.approve become enforced.
--
--   create   → everyone. A technician who paid for fuel has to be able to say so.
--   read     → owner and manager. A manager running the shop needs to see what
--              is being spent at it.
--   approve  → owner only. Approving is the moment an expense becomes a cost
--              the business accepts, and it is also the moment somebody gets
--              reimbursed.
--
-- A manager can submit and read but not approve, so nobody signs off their own
-- spending except the owner — who, being the owner, is signing off their own
-- money either way.

BEGIN;

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
      'employees.read','employees.manage',
      'attendance.read','attendance.manage',
      'leave.read','leave.request','leave.approve',
      'salary.read_own','salary.read_all','salary.manage',
      'salary_advances.request','salary_advances.approve',
      'payroll.read','payroll.manage',
      'expenses.read','expenses.create','expenses.approve']
    WHEN 'manager' THEN ARRAY[
      'customers.read','customers.manage','customers.archive',
      'vehicles.read','vehicles.manage',
      'jobs.read','jobs.manage',
      'repair_orders.read','repair_orders.manage',
      'inspections.read','inspections.manage',
      'estimates.read','estimates.manage',
      'parts.read','parts.manage',
      'appointments.read','appointments.manage',
      'employees.read',
      'attendance.read','attendance.manage',
      'leave.read','leave.request','leave.approve',
      'salary.read_own','salary_advances.request',
      'expenses.read','expenses.create']
    WHEN 'advisor' THEN ARRAY[
      'customers.read','customers.manage','customers.archive',
      'vehicles.read','vehicles.manage',
      'jobs.read','jobs.manage',
      'inspections.read','inspections.manage',
      'estimates.read','estimates.manage',
      'parts.read',
      'appointments.read','appointments.manage',
      'leave.request',
      'salary.read_own','salary_advances.request',
      'expenses.create']
    WHEN 'technician' THEN ARRAY[
      'jobs.read','jobs.manage',
      'repair_orders.read','repair_orders.manage',
      'inspections.read','inspections.manage',
      'parts.read','parts.manage',
      'leave.request',
      'salary.read_own','salary_advances.request',
      'expenses.create']
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

REVOKE ALL ON FUNCTION public.has_capability(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_capability(UUID, TEXT) TO authenticated, service_role;

COMMIT;

-- ── Check section 4 ─────────────────────────────────────────────────────────
--
-- The last three are the regression check. This replaces the function M6, M7
-- and M8 installed, and a redefinition that quietly dropped one of them would
-- break attendance, pay or payroll with nothing to point at.
SELECT 'technician can submit an expense (expect true)' AS check_name,
       (split_part(prosrc, 'WHEN ''technician'' THEN ARRAY[', 2) LIKE '%expenses.create%')::text AS result
  FROM pg_proc WHERE proname = 'has_capability'
UNION ALL
SELECT 'manager cannot approve expenses (expect true)',
       (split_part(prosrc, 'WHEN ''manager'' THEN ARRAY[', 2) NOT LIKE '%expenses.approve%')::text
  FROM pg_proc WHERE proname = 'has_capability'
UNION ALL
SELECT 'attendance still enforced (expect true)',
       (prosrc LIKE '%attendance.manage%')::text
  FROM pg_proc WHERE proname = 'has_capability'
UNION ALL
SELECT 'salary still enforced (expect true)',
       (prosrc LIKE '%salary.manage%')::text
  FROM pg_proc WHERE proname = 'has_capability'
UNION ALL
SELECT 'payroll still enforced (expect true)',
       (prosrc LIKE '%payroll.manage%')::text
  FROM pg_proc WHERE proname = 'has_capability';
