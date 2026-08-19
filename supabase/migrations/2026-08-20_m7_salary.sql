-- M7 — Salary (versioned) and advances
--
-- `technicians.pay_rate` is one column holding one number. It cannot answer
-- "what were they paid in March", which is the question payroll asks every
-- time it runs, and it is why the M0 audit called salary PARTIAL rather than
-- done. Overwriting it also destroys the only evidence of what somebody used
-- to earn — the record a person reaches for when they dispute a payslip.
--
-- So salary becomes a series of rows, each valid from a date. The current
-- salary is the most recent row not in the future; March's salary is the most
-- recent row before April. Nothing is ever overwritten.
--
-- `technicians.pay_type` and `pay_rate` are left in place and untouched. They
-- are read by the technician directory and by the performance report; moving
-- those is a separate change with its own risk, and nothing here depends on
-- it. The two will disagree for a while, and salary_records is the one payroll
-- reads.
--
-- Additive only. No existing table is altered and nothing is dropped.

BEGIN;

-- ── Salary, versioned ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.salary_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,

  -- The date this rate starts applying. There is deliberately no end date:
  -- a row ends when the next one begins, so two rows cannot disagree about
  -- what someone earned on a given day, and nothing has to be updated when
  -- pay changes — only inserted.
  effective_from   DATE NOT NULL,

  pay_type         TEXT NOT NULL,
  amount           NUMERIC(14,2) NOT NULL,
  -- Pay is agreed in a currency and it is not always the shop's default. A
  -- rate stored without one is the same class of bug as the parts quotations
  -- that recorded THB while every line was priced in USD.
  currency         TEXT NOT NULL DEFAULT 'USD',

  notes            TEXT,
  recorded_by      UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT salary_pay_type_check
    CHECK (pay_type IN ('Monthly', 'Daily', 'Hourly', 'Per job')),
  -- Zero is allowed — unpaid leave of absence, a director drawing nothing —
  -- but negative pay is always a typo.
  CONSTRAINT salary_amount_not_negative CHECK (amount >= 0)
);

-- One rate per person per start date. A second row for the same day is a
-- correction being entered twice, and payroll would have no way to choose.
CREATE UNIQUE INDEX IF NOT EXISTS salary_one_per_person_per_date
  ON public.salary_records (employee_id, effective_from);

CREATE INDEX IF NOT EXISTS salary_employee_history_idx
  ON public.salary_records (employee_id, effective_from DESC);

-- ── Advances ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.salary_advances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,

  amount           NUMERIC(14,2) NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  requested_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  reason           TEXT,

  status           TEXT NOT NULL DEFAULT 'Pending',

  -- Money actually handed over, and when. Separate from approval: an advance
  -- can be agreed on Monday and paid on Friday, and payroll must deduct what
  -- was PAID, not what was promised.
  paid_on          DATE,
  -- How much has been recovered from later pay. Payroll (M8) writes this.
  repaid_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,

  requested_by     UUID,
  decided_by       UUID,
  decided_at       TIMESTAMPTZ,
  decision_note    TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT advance_status_check
    CHECK (status IN ('Pending', 'Approved', 'Paid', 'Rejected', 'Cancelled')),
  CONSTRAINT advance_amount_positive CHECK (amount > 0),
  -- Recovering more than was lent is how an advance quietly becomes a
  -- deduction nobody agreed to.
  CONSTRAINT advance_repaid_within_amount
    CHECK (repaid_amount >= 0 AND repaid_amount <= amount),
  CONSTRAINT advance_decision_has_an_owner
    CHECK (status IN ('Pending', 'Cancelled') OR decided_by IS NOT NULL),
  CONSTRAINT advance_paid_has_a_date
    CHECK (status <> 'Paid' OR paid_on IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS advances_org_status_idx
  ON public.salary_advances (organization_id, status, requested_on DESC);

CREATE INDEX IF NOT EXISTS advances_employee_idx
  ON public.salary_advances (employee_id, requested_on DESC);

-- Outstanding advances, the number payroll needs and the one a person asking
-- for another advance should be shown. A view rather than a column, because a
-- stored balance is a second copy of a sum that can drift from its parts.
--
-- security_invoker is NOT optional here. A Postgres view runs with the rights
-- of whoever DEFINED it unless told otherwise, which would make this view a
-- hole straight through the policies above: any signed-in user could read
-- every person's outstanding balance by querying the view instead of the
-- table. With it, the underlying RLS applies to whoever is asking.
CREATE OR REPLACE VIEW public.salary_advances_outstanding
WITH (security_invoker = true) AS
SELECT
  a.organization_id,
  a.employee_id,
  a.currency,
  sum(a.amount - a.repaid_amount) AS outstanding
FROM public.salary_advances a
WHERE a.status = 'Paid'
  AND a.repaid_amount < a.amount
GROUP BY a.organization_id, a.employee_id, a.currency;

DROP TRIGGER IF EXISTS salary_advances_touch ON public.salary_advances;
CREATE TRIGGER salary_advances_touch
  BEFORE UPDATE ON public.salary_advances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;

-- ── Row level security ──────────────────────────────────────────────────────
--
-- Pay is the most sensitive thing in this database. Two rules:
--
--   * a person may always read their OWN pay and their own advances
--   * everyone else needs salary.read_all, which only the owner has
--
-- Managers are deliberately excluded. They run the shop day to day and now
-- hold attendance and leave, but what each person earns is not needed for any
-- of that, and the audit narrowed them to employees.read for exactly this
-- reason.

BEGIN;

ALTER TABLE public.salary_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_advances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS salary_records_select ON public.salary_records;
CREATE POLICY salary_records_select ON public.salary_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shops s
      JOIN public.shop_users su ON su.shop_id = s.id
      WHERE s.organization_id = salary_records.organization_id
        AND su.user_id = auth.uid()
        AND public.has_capability(s.id, 'salary.read_all')
    )
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = salary_records.employee_id
        AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS salary_records_write ON public.salary_records;
CREATE POLICY salary_records_write ON public.salary_records
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = salary_records.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'salary.manage')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = salary_records.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'salary.manage')
  ));

DROP POLICY IF EXISTS salary_advances_select ON public.salary_advances;
CREATE POLICY salary_advances_select ON public.salary_advances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shops s
      JOIN public.shop_users su ON su.shop_id = s.id
      WHERE s.organization_id = salary_advances.organization_id
        AND su.user_id = auth.uid()
        AND public.has_capability(s.id, 'salary_advances.approve')
    )
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = salary_advances.employee_id
        AND e.user_id = auth.uid()
    )
  );

-- Asking is not deciding. A person may raise their own request, and only an
-- approver may change one — the same split as leave, for the same reason.
DROP POLICY IF EXISTS salary_advances_insert ON public.salary_advances;
CREATE POLICY salary_advances_insert ON public.salary_advances
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'Pending'
    AND (
      EXISTS (
        SELECT 1 FROM public.shops s
        JOIN public.shop_users su ON su.shop_id = s.id
        WHERE s.organization_id = salary_advances.organization_id
          AND su.user_id = auth.uid()
          AND public.has_capability(s.id, 'salary_advances.approve')
      )
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = salary_advances.employee_id
          AND e.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS salary_advances_update ON public.salary_advances;
CREATE POLICY salary_advances_update ON public.salary_advances
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = salary_advances.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'salary_advances.approve')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = salary_advances.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'salary_advances.approve')
  ));

-- ── Grants ──────────────────────────────────────────────────────────────────
--
-- No DELETE and no UPDATE on salary_records. A salary row is a historical
-- fact: pay changed on a date. Correcting a mistake means inserting the right
-- row, and a wrong one that was never used is harmless next to a history that
-- can be rewritten. Postgres grants to PUBLIC by default, so the revoke
-- matters as much as the grant.

REVOKE ALL ON public.salary_records  FROM PUBLIC;
REVOKE ALL ON public.salary_advances FROM PUBLIC;
REVOKE ALL ON public.salary_advances_outstanding FROM PUBLIC;

GRANT SELECT, INSERT         ON public.salary_records  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.salary_advances TO authenticated;
GRANT SELECT                 ON public.salary_advances_outstanding TO authenticated;

COMMIT;

-- ── Capabilities become enforced ────────────────────────────────────────────
--
-- The five Pay capabilities move from 'planned' to enforced. Same duplication
-- as before — the defaults live here and in lib/auth/capabilities.ts, because
-- a policy cannot call TypeScript — and capabilities.test.ts parses this
-- function and fails if the two disagree.
--
-- salary.read_own is given to every role and salary.read_all to nobody but the
-- owner. The split matters: read_own is not what lets a person see their own
-- pay — the RLS policy does that, by matching employees.user_id to auth.uid().
-- The capability only gates whether the screen offers to ask.

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
      'reports.read','audit.read','members.manage','settings.manage','billing.manage',
      'employees.read','employees.manage',
      'attendance.read','attendance.manage',
      'leave.read','leave.request','leave.approve',
      'salary.read_own','salary.read_all','salary.manage',
      'salary_advances.request','salary_advances.approve']
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

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
--
-- After COMMIT, deliberately. Four migrations in this project have "run"
-- without committing: the statements execute, the session ends, nothing
-- persists, and the report says success.

SELECT 'tables' AS check_name,
       coalesce(string_agg(tablename, ', ' ORDER BY tablename), 'NONE — did not commit') AS result
  FROM pg_tables WHERE schemaname = 'public'
   AND tablename IN ('salary_records', 'salary_advances')

UNION ALL
SELECT 'policies (expect 5)', count(*)::text
  FROM pg_policies WHERE schemaname = 'public'
   AND tablename IN ('salary_records', 'salary_advances')

UNION ALL
-- The one that matters most. Without security_invoker this view reads with the
-- definer's rights and hands every salary balance to anyone who asks.
SELECT 'outstanding view respects RLS (expect true)',
       (reloptions::text LIKE '%security_invoker=true%')::text
  FROM pg_class WHERE relname = 'salary_advances_outstanding'

UNION ALL
-- Salary history cannot be rewritten: correcting a rate means inserting a new
-- row, not editing the old one.
SELECT 'can update salary history (expect false)',
       has_table_privilege('authenticated', 'public.salary_records', 'UPDATE')::text

UNION ALL
SELECT 'can delete salary history (expect false)',
       has_table_privilege('authenticated', 'public.salary_records', 'DELETE')::text

UNION ALL
SELECT 'manager cannot read all pay (expect true)',
       (split_part(prosrc, 'WHEN ''manager'' THEN ARRAY[', 2) NOT LIKE '%salary.read_all%')::text
  FROM pg_proc WHERE proname = 'has_capability'

UNION ALL
SELECT 'technician cannot set pay (expect true)',
       (split_part(prosrc, 'WHEN ''technician'' THEN ARRAY[', 2) NOT LIKE '%salary.manage%')::text
  FROM pg_proc WHERE proname = 'has_capability';
