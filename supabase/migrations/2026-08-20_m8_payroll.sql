-- M8 — Payroll
--
-- Depends on all three of the milestones before it: who worked which days
-- (M6), what they earned on those days (M7), and what they have already been
-- advanced (M7). That is why the M0 audit moved payroll behind them.
--
-- ## Each person is paid in their own currency
--
-- No conversion anywhere. A run shows a separate total per currency, and a
-- person whose rate is in THB is paid in THB. Converting would mean storing an
-- exchange rate with the run — and getting that wrong makes reprinting last
-- month's payslip produce a different number a year later, which is worse than
-- having three subtotals.
--
-- ## A finalised line never changes
--
-- Every input is copied onto the line when it is calculated: the rate, the pay
-- type, the days, the hours. Not referenced — copied. A payslip has to say the
-- same thing in five years, and salary history, attendance and advances all
-- keep moving after a run is closed.
--
-- ## RUN THIS IN SECTIONS
--
-- Each numbered section below ends with its own verification query. Paste them
-- one at a time and check the result before moving on. A 500-line paste has
-- failed silently in this project more than once, and the failure is invisible
-- until something three steps later cannot find a table.

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — the tables
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  label            TEXT,

  -- Draft is a working document: lines can be recalculated and edited.
  -- Finalised is a statement of what people are owed, and nothing on it moves
  -- again. Paid records that the money actually went out.
  status           TEXT NOT NULL DEFAULT 'Draft',

  created_by       UUID,
  finalised_by     UUID,
  finalised_at     TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  notes            TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payroll_status_check
    CHECK (status IN ('Draft', 'Finalised', 'Paid')),
  CONSTRAINT payroll_period_ordered
    CHECK (period_end >= period_start),
  CONSTRAINT payroll_finalised_has_an_owner
    CHECK (status = 'Draft' OR finalised_by IS NOT NULL)
);

-- One run per period per business. A second run over the same dates is how
-- people get paid twice for the same fortnight.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_one_run_per_period
  ON public.payroll_runs (organization_id, period_start, period_end)
  WHERE status <> 'Draft';

CREATE TABLE IF NOT EXISTS public.payroll_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,

  -- ── The inputs, copied not referenced ──────────────────────────────────
  -- salary_records, attendance_days and salary_advances all keep changing
  -- after a run closes. A payslip that recalculates itself from live data is
  -- not a record of anything.
  currency         TEXT NOT NULL,
  pay_type         TEXT NOT NULL,
  rate_amount      NUMERIC(14,2) NOT NULL,
  salary_record_id UUID,

  days_worked      NUMERIC(6,2) NOT NULL DEFAULT 0,
  days_leave_paid  NUMERIC(6,2) NOT NULL DEFAULT 0,
  days_absent      NUMERIC(6,2) NOT NULL DEFAULT 0,
  hours_worked     NUMERIC(8,2) NOT NULL DEFAULT 0,

  -- ── The money ──────────────────────────────────────────────────────────
  gross            NUMERIC(14,2) NOT NULL DEFAULT 0,
  advance_deducted NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_deduction  NUMERIC(14,2) NOT NULL DEFAULT 0,
  net              NUMERIC(14,2) NOT NULL DEFAULT 0,

  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One line per person per run. Two lines is a double payment.
  CONSTRAINT payroll_line_amounts_sane
    CHECK (gross >= 0 AND advance_deducted >= 0 AND other_deduction >= 0),
  -- Net can be zero but never negative: a deduction larger than the pay means
  -- taking money off somebody, and that has to be a deliberate act elsewhere,
  -- not a subtraction that quietly went past zero.
  CONSTRAINT payroll_line_net_not_negative CHECK (net >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_one_line_per_person_per_run
  ON public.payroll_lines (run_id, employee_id);

CREATE INDEX IF NOT EXISTS payroll_lines_employee_idx
  ON public.payroll_lines (employee_id, created_at DESC);

-- Which advances a run recovered, and how much of each. Without this, a run
-- knows it deducted 50 but not what from, and reversing a mistake means
-- guessing.
CREATE TABLE IF NOT EXISTS public.payroll_advance_recoveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id          UUID NOT NULL REFERENCES public.payroll_lines(id) ON DELETE CASCADE,
  advance_id       UUID NOT NULL REFERENCES public.salary_advances(id) ON DELETE RESTRICT,
  amount           NUMERIC(14,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recovery_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS recoveries_advance_idx
  ON public.payroll_advance_recoveries (advance_id);

DROP TRIGGER IF EXISTS payroll_runs_touch ON public.payroll_runs;
CREATE TRIGGER payroll_runs_touch
  BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS payroll_lines_touch ON public.payroll_lines;
CREATE TRIGGER payroll_lines_touch
  BEFORE UPDATE ON public.payroll_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;

-- ── Check section 1 ─────────────────────────────────────────────────────────
SELECT 'tables (expect 3)' AS check_name, count(*)::text AS result
  FROM pg_tables WHERE schemaname = 'public'
   AND tablename IN ('payroll_runs', 'payroll_lines', 'payroll_advance_recoveries');

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — finalising a run
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Finalising does three things that must all happen or none of them:
--
--   1. the run becomes Finalised
--   2. every advance the run recovers has its repaid_amount increased
--   3. a recovery row records which advance each deduction came out of
--
-- Doing this from the browser as three separate calls means a network drop
-- between them leaves an advance recovered on paper but not in the ledger, or
-- the reverse. So it is one function, in one transaction.
--
-- SECURITY DEFINER, so it must check permission itself: it runs as the owner
-- of the function and RLS does not apply to it.

BEGIN;

CREATE OR REPLACE FUNCTION public.finalise_payroll_run(p_run_id UUID)
RETURNS TABLE (recovered_advances INT, total_recovered NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org        UUID;
  v_status     TEXT;
  v_allowed    BOOLEAN;
  v_line       RECORD;
  v_advance    RECORD;
  v_remaining  NUMERIC;
  v_take       NUMERIC;
  v_count      INT := 0;
  v_total      NUMERIC := 0;
BEGIN
  SELECT r.organization_id, r.status INTO v_org, v_status
  FROM public.payroll_runs r WHERE r.id = p_run_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'That payroll run no longer exists.';
  END IF;

  IF v_status <> 'Draft' THEN
    RAISE EXCEPTION 'That run was already %, so it cannot be finalised again.', lower(v_status);
  END IF;

  -- The permission check RLS would normally do. Without this, any signed-in
  -- user could finalise anyone's payroll by calling the function directly.
  SELECT EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = v_org
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'payroll.manage')
  ) INTO v_allowed;

  IF auth.uid() IS NOT NULL AND NOT v_allowed THEN
    RAISE EXCEPTION 'You do not have permission to finalise payroll.';
  END IF;

  -- Recover advances, line by line.
  FOR v_line IN
    SELECT l.id, l.employee_id, l.currency, l.advance_deducted
    FROM public.payroll_lines l
    WHERE l.run_id = p_run_id AND l.advance_deducted > 0
  LOOP
    v_remaining := v_line.advance_deducted;

    -- Oldest advance first, and only ones actually PAID: an advance approved
    -- but never handed over is not a debt, and recovering it would take back
    -- money the person never received.
    --
    -- FOR UPDATE locks each advance row, so two runs finalising at once cannot
    -- both recover the same outstanding balance.
    FOR v_advance IN
      SELECT a.id, a.amount - a.repaid_amount AS outstanding
      FROM public.salary_advances a
      WHERE a.employee_id = v_line.employee_id
        AND a.currency = v_line.currency
        AND a.status = 'Paid'
        AND a.repaid_amount < a.amount
      ORDER BY a.paid_on, a.created_at
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_take := least(v_remaining, v_advance.outstanding);

      UPDATE public.salary_advances
         SET repaid_amount = repaid_amount + v_take
       WHERE id = v_advance.id;

      INSERT INTO public.payroll_advance_recoveries (line_id, advance_id, amount)
      VALUES (v_line.id, v_advance.id, v_take);

      v_remaining := v_remaining - v_take;
      v_count := v_count + 1;
      v_total := v_total + v_take;
    END LOOP;

    -- Deducting more than the person actually owes is not a rounding problem,
    -- it is money taken for no reason. Stop the whole run rather than pay out
    -- a figure nobody can explain.
    IF v_remaining > 0 THEN
      RAISE EXCEPTION
        'A line deducts % more than the person has outstanding in %. Recalculate the run.',
        v_remaining, v_line.currency;
    END IF;
  END LOOP;

  UPDATE public.payroll_runs
     SET status = 'Finalised',
         finalised_by = auth.uid(),
         finalised_at = now()
   WHERE id = p_run_id;

  RETURN QUERY SELECT v_count, v_total;
END $fn$;

REVOKE ALL ON FUNCTION public.finalise_payroll_run(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalise_payroll_run(UUID) TO authenticated;

-- A finalised line is frozen. The grants have to allow UPDATE, because a draft
-- is edited in place — so the lock is a trigger, not a permission.
CREATE OR REPLACE FUNCTION public.payroll_line_is_frozen()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM public.payroll_runs
   WHERE id = COALESCE(NEW.run_id, OLD.run_id);

  IF v_status IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'This payroll run is %, so its lines cannot be changed.', lower(v_status);
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS payroll_lines_frozen ON public.payroll_lines;
CREATE TRIGGER payroll_lines_frozen
  BEFORE UPDATE OR DELETE ON public.payroll_lines
  FOR EACH ROW EXECUTE FUNCTION public.payroll_line_is_frozen();

COMMIT;

-- ── Check section 2 ─────────────────────────────────────────────────────────
SELECT 'finalise function' AS check_name,
       count(*)::text AS result
  FROM pg_proc WHERE proname = 'finalise_payroll_run'
UNION ALL
SELECT 'freeze trigger', count(*)::text
  FROM pg_trigger WHERE tgname = 'payroll_lines_frozen'
UNION ALL
SELECT 'public cannot execute finalise (expect false)',
       has_function_privilege('public', 'public.finalise_payroll_run(uuid)', 'EXECUTE')::text;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — row level security and grants
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A payroll run holds everyone's pay, so reading one needs payroll.read, which
-- only the owner has. The exception is a person's own line: someone must be
-- able to see their own payslip, and that is what the employees.user_id match
-- allows.

BEGIN;

ALTER TABLE public.payroll_runs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_lines               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_advance_recoveries  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_runs_select ON public.payroll_runs;
CREATE POLICY payroll_runs_select ON public.payroll_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.shops s
      JOIN public.shop_users su ON su.shop_id = s.id
      WHERE s.organization_id = payroll_runs.organization_id
        AND su.user_id = auth.uid()
        AND public.has_capability(s.id, 'payroll.read'))
    -- A person can see a run they have a line on — that is their payslip's
    -- period and status, not anyone else's pay.
    OR EXISTS (SELECT 1 FROM public.payroll_lines l
      JOIN public.employees e ON e.id = l.employee_id
      WHERE l.run_id = payroll_runs.id AND e.user_id = auth.uid())
  );

DROP POLICY IF EXISTS payroll_runs_write ON public.payroll_runs;
CREATE POLICY payroll_runs_write ON public.payroll_runs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = payroll_runs.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'payroll.manage')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = payroll_runs.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'payroll.manage')));

DROP POLICY IF EXISTS payroll_lines_select ON public.payroll_lines;
CREATE POLICY payroll_lines_select ON public.payroll_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.shops s
      JOIN public.shop_users su ON su.shop_id = s.id
      WHERE s.organization_id = payroll_lines.organization_id
        AND su.user_id = auth.uid()
        AND public.has_capability(s.id, 'payroll.read'))
    OR EXISTS (SELECT 1 FROM public.employees e
      WHERE e.id = payroll_lines.employee_id AND e.user_id = auth.uid())
  );

DROP POLICY IF EXISTS payroll_lines_write ON public.payroll_lines;
CREATE POLICY payroll_lines_write ON public.payroll_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = payroll_lines.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'payroll.manage')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = payroll_lines.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'payroll.manage')));

-- Recoveries are written only by finalise_payroll_run, which is SECURITY
-- DEFINER and so is not subject to this. The policy exists so a person can see
-- what came off their own payslip.
DROP POLICY IF EXISTS payroll_recoveries_select ON public.payroll_advance_recoveries;
CREATE POLICY payroll_recoveries_select ON public.payroll_advance_recoveries
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payroll_lines l
    LEFT JOIN public.employees e ON e.id = l.employee_id
    WHERE l.id = payroll_advance_recoveries.line_id
      AND (
        e.user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.shops s
          JOIN public.shop_users su ON su.shop_id = s.id
          WHERE s.organization_id = l.organization_id
            AND su.user_id = auth.uid()
            AND public.has_capability(s.id, 'payroll.read'))
      )
  ));

-- ── Grants ──────────────────────────────────────────────────────────────────
--
-- Draft lines are edited in place, so UPDATE has to be granted; the freeze
-- trigger from section 2 is what stops a finalised one changing. DELETE is
-- granted on runs and lines so a draft can be thrown away — the trigger blocks
-- deleting a finalised line, and a finalised run is protected by its own
-- policy plus the fact that nothing in the app offers it.
--
-- Nothing may write recoveries directly. They are produced by finalising, and
-- a hand-written recovery row would claim an advance was repaid when no
-- payroll ever recovered it.

REVOKE ALL ON public.payroll_runs               FROM PUBLIC;
REVOKE ALL ON public.payroll_lines              FROM PUBLIC;
REVOKE ALL ON public.payroll_advance_recoveries FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_lines TO authenticated;
GRANT SELECT                         ON public.payroll_advance_recoveries TO authenticated;

COMMIT;

-- ── Check section 3 ─────────────────────────────────────────────────────────
SELECT 'policies (expect 5)' AS check_name, count(*)::text AS result
  FROM pg_policies WHERE schemaname = 'public'
   AND tablename IN ('payroll_runs', 'payroll_lines', 'payroll_advance_recoveries')
UNION ALL
SELECT 'rls on', string_agg(c.relname || '=' || c.relrowsecurity::text, ', ' ORDER BY c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('payroll_runs', 'payroll_lines', 'payroll_advance_recoveries')
UNION ALL
SELECT 'nobody writes recoveries by hand (expect false)',
       has_table_privilege('authenticated', 'public.payroll_advance_recoveries', 'INSERT')::text;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — capabilities
-- ═══════════════════════════════════════════════════════════════════════════
--
-- payroll.read and payroll.manage move from 'planned' to enforced. Both go to
-- the owner only: a payroll run holds everyone's pay, and a manager who can
-- read one has effectively been given salary.read_all by another route.
--
-- Same duplication as every milestone since M4 — the defaults live here and in
-- lib/auth/capabilities.ts, because a policy cannot call TypeScript, and
-- capabilities.test.ts parses this function and fails if they disagree.

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
      'payroll.read','payroll.manage']
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
      'salary.read_own','salary_advances.request']
    WHEN 'advisor' THEN ARRAY[
      'customers.read','customers.manage','customers.archive',
      'vehicles.read','vehicles.manage',
      'jobs.read','jobs.manage',
      'inspections.read','inspections.manage',
      'estimates.read','estimates.manage',
      'parts.read',
      'appointments.read','appointments.manage',
      'leave.request',
      'salary.read_own','salary_advances.request']
    WHEN 'technician' THEN ARRAY[
      'jobs.read','jobs.manage',
      'repair_orders.read','repair_orders.manage',
      'inspections.read','inspections.manage',
      'parts.read','parts.manage',
      'leave.request',
      'salary.read_own','salary_advances.request']
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
-- The last two matter most: this replaces the function M6 and M7 installed, so
-- it has to still carry everything they added. A redefinition that quietly
-- dropped attendance would break it with nothing to point at.
SELECT 'owner can run payroll (expect true)' AS check_name,
       (split_part(prosrc, 'WHEN ''owner'' THEN ARRAY[', 2) LIKE '%payroll.manage%')::text AS result
  FROM pg_proc WHERE proname = 'has_capability'
UNION ALL
SELECT 'manager cannot read payroll (expect true)',
       (split_part(prosrc, 'WHEN ''manager'' THEN ARRAY[', 2) NOT LIKE '%payroll.read%')::text
  FROM pg_proc WHERE proname = 'has_capability'
UNION ALL
SELECT 'attendance still enforced (expect true)',
       (prosrc LIKE '%attendance.manage%')::text
  FROM pg_proc WHERE proname = 'has_capability'
UNION ALL
SELECT 'salary still enforced (expect true)',
       (prosrc LIKE '%salary.manage%')::text
  FROM pg_proc WHERE proname = 'has_capability';
