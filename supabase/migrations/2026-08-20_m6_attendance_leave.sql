-- M6 — Attendance and leave
--
-- Sits on the employees record from M5. Deliberately does NOT touch
-- time_entries: that table is job-linked labour costing — how long a job took,
-- for pricing and technician performance — and attendance is a different
-- question, whether a person was at work that day. Merging them would mean a
-- technician who spent the morning cleaning the workshop reads as absent, and
-- an attendance correction would silently rewrite what a customer was charged.
--
-- Three tables:
--   attendance_days   one row per person per day
--   leave_types       what kinds of leave this business gives
--   leave_requests    a request, its decision, and who made it
--
-- Additive only. No existing table is altered, nothing is dropped, and no
-- production row is modified except the seeded default leave types.

BEGIN;

-- Needed for the overlap constraint on leave_requests. Without it, `EXCLUDE`
-- cannot mix an equality test on employee_id with an overlap test on a range.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Attendance ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.attendance_days (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  -- Which location they worked at. The row belongs to the person, not the
  -- shop, which is why the unique index below is not scoped by shop.
  shop_id          UUID NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
  employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  work_date        DATE NOT NULL,

  status           TEXT NOT NULL DEFAULT 'Present',

  -- Nullable on purpose. A day marked Absent or Leave has no clock times, and
  -- storing 00:00 to mean "did not come in" is how an absence later reads as a
  -- midnight shift.
  first_in         TIMESTAMPTZ,
  last_out         TIMESTAMPTZ,
  minutes_worked   INTEGER,

  notes            TEXT,
  -- Who recorded it. Attendance decides pay, so "the system says so" is not an
  -- acceptable answer to a person disputing their own record.
  recorded_by      UUID,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT attendance_status_check
    CHECK (status IN ('Present', 'Late', 'Half day', 'Absent', 'Leave', 'Holiday', 'Rest day')),
  CONSTRAINT attendance_minutes_sane
    CHECK (minutes_worked IS NULL OR (minutes_worked >= 0 AND minutes_worked <= 1440)),
  CONSTRAINT attendance_out_after_in
    CHECK (last_out IS NULL OR first_in IS NULL OR last_out >= first_in)
);

-- One working day per person per day, across every location.
--
-- Not scoped by shop: a person who helped at both branches on a Tuesday still
-- worked one Tuesday, and two rows would double-count them the moment payroll
-- reads this. Which shop is recorded on the row; it is not part of identity.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_one_day_per_person
  ON public.attendance_days (employee_id, work_date);

CREATE INDEX IF NOT EXISTS attendance_org_date_idx
  ON public.attendance_days (organization_id, work_date DESC);

CREATE INDEX IF NOT EXISTS attendance_shop_date_idx
  ON public.attendance_days (shop_id, work_date DESC);

-- ── Leave types ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leave_types (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  -- Whether a day of this counts as paid. Payroll (M7) reads this; nothing
  -- does yet, which is why it is recorded now rather than inferred later from
  -- a name someone typed.
  is_paid          BOOLEAN NOT NULL DEFAULT true,
  -- Days per year, where the business sets one. NULL means no fixed allowance.
  annual_days      NUMERIC(5,1),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS leave_types_name_per_org
  ON public.leave_types (organization_id, lower(name));

-- ── Leave requests ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  leave_type_id    UUID NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,

  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  -- A single half day off. Only meaningful when start and end are the same day.
  half_day         BOOLEAN NOT NULL DEFAULT false,

  reason           TEXT,
  status           TEXT NOT NULL DEFAULT 'Pending',

  requested_by     UUID,
  decided_by       UUID,
  decided_at       TIMESTAMPTZ,
  decision_note    TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT leave_status_check
    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  CONSTRAINT leave_dates_ordered
    CHECK (end_date >= start_date),
  CONSTRAINT leave_half_day_is_one_day
    CHECK (NOT half_day OR start_date = end_date),
  -- A decision must say who made it. A leave record that is approved by nobody
  -- is the one an argument later turns on.
  CONSTRAINT leave_decision_has_an_owner
    CHECK (status IN ('Pending', 'Cancelled') OR decided_by IS NOT NULL)
);

-- The same person cannot hold two live requests over the same dates.
--
-- Enforced here rather than in the application because the application is not
-- the only writer — imports, an API and AI callers are all on the roadmap, and
-- a double-booked week only becomes visible when payroll disagrees with the
-- rota. Rejected and cancelled rows are excluded: those are history, and a
-- rejected request must not block the corrected one that replaces it.
ALTER TABLE public.leave_requests
  DROP CONSTRAINT IF EXISTS leave_no_overlap;
ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  ) WHERE (status IN ('Pending', 'Approved'));

CREATE INDEX IF NOT EXISTS leave_requests_org_status_idx
  ON public.leave_requests (organization_id, status, start_date DESC);

CREATE INDEX IF NOT EXISTS leave_requests_employee_idx
  ON public.leave_requests (employee_id, start_date DESC);

-- ── updated_at ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS attendance_days_touch ON public.attendance_days;
CREATE TRIGGER attendance_days_touch
  BEFORE UPDATE ON public.attendance_days
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS leave_requests_touch ON public.leave_requests;
CREATE TRIGGER leave_requests_touch
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;

-- ── Row level security ──────────────────────────────────────────────────────
--
-- Same shape as employees in M5: scoped by organization, reached through shop
-- membership, gated on a capability. An attendance row is readable by anyone
-- with attendance.read in ANY shop of that organization, which is what lets
-- one person's record follow them across both locations.

BEGIN;

ALTER TABLE public.attendance_days  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests   ENABLE ROW LEVEL SECURITY;

-- attendance_days ------------------------------------------------------------

DROP POLICY IF EXISTS attendance_select ON public.attendance_days;
CREATE POLICY attendance_select ON public.attendance_days
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shops s
      JOIN public.shop_users su ON su.shop_id = s.id
      WHERE s.organization_id = attendance_days.organization_id
        AND su.user_id = auth.uid()
        AND public.has_capability(s.id, 'attendance.read')
    )
    -- A person can always see their own attendance, whatever their role.
    -- Withholding someone's own record of when they worked, from them, is not
    -- a defensible default when it is what their pay is calculated from.
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = attendance_days.employee_id
        AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS attendance_write ON public.attendance_days;
CREATE POLICY attendance_write ON public.attendance_days
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = attendance_days.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'attendance.manage')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = attendance_days.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'attendance.manage')
  ));

-- leave_types ----------------------------------------------------------------
--
-- Readable by anyone who can see leave at all: a person choosing a leave type
-- to request has to be able to read the list.

DROP POLICY IF EXISTS leave_types_select ON public.leave_types;
CREATE POLICY leave_types_select ON public.leave_types
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = leave_types.organization_id
      AND su.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS leave_types_write ON public.leave_types;
CREATE POLICY leave_types_write ON public.leave_types
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = leave_types.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'leave.approve')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = leave_types.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'leave.approve')
  ));

-- leave_requests -------------------------------------------------------------

DROP POLICY IF EXISTS leave_requests_select ON public.leave_requests;
CREATE POLICY leave_requests_select ON public.leave_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shops s
      JOIN public.shop_users su ON su.shop_id = s.id
      WHERE s.organization_id = leave_requests.organization_id
        AND su.user_id = auth.uid()
        AND public.has_capability(s.id, 'leave.read')
    )
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = leave_requests.employee_id
        AND e.user_id = auth.uid()
    )
  );

-- Requesting and deciding are separate rights, so they are separate policies.
-- A technician may raise their own request; only an approver may change one.
DROP POLICY IF EXISTS leave_requests_insert ON public.leave_requests;
CREATE POLICY leave_requests_insert ON public.leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'Pending'
    AND (
      EXISTS (
        SELECT 1 FROM public.shops s
        JOIN public.shop_users su ON su.shop_id = s.id
        WHERE s.organization_id = leave_requests.organization_id
          AND su.user_id = auth.uid()
          AND public.has_capability(s.id, 'leave.approve')
      )
      -- Their own request, for themselves, starting as Pending. The status
      -- check above is what stops this from being a way to self-approve.
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = leave_requests.employee_id
          AND e.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS leave_requests_update ON public.leave_requests;
CREATE POLICY leave_requests_update ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = leave_requests.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'leave.approve')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = leave_requests.organization_id
      AND su.user_id = auth.uid()
      AND public.has_capability(s.id, 'leave.approve')
  ));

-- ── Grants ──────────────────────────────────────────────────────────────────
--
-- No DELETE anywhere. Attendance and leave are employment history: a day is
-- corrected, a request is cancelled or rejected. Both leave a row behind,
-- because the question later is not only what the record says but what it used
-- to say. Postgres grants to PUBLIC by default, so the revoke is not optional.

REVOKE ALL ON public.attendance_days FROM PUBLIC;
REVOKE ALL ON public.leave_types     FROM PUBLIC;
REVOKE ALL ON public.leave_requests  FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON public.attendance_days TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.leave_types     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.leave_requests  TO authenticated;

COMMIT;

-- ── Default leave types ─────────────────────────────────────────────────────
--
-- Seeded per organization so the module is usable the moment it appears. A
-- business with different categories renames or deactivates these; an empty
-- list would just mean nobody can file the first request.
--
-- ON CONFLICT DO NOTHING against the per-org unique name index, so re-running
-- this migration adds nothing and changes nothing.

BEGIN;

INSERT INTO public.leave_types (organization_id, name, is_paid, annual_days)
SELECT o.id, t.name, t.is_paid, t.annual_days
FROM public.organizations o
CROSS JOIN (VALUES
  ('Annual leave',    true,  NULL::NUMERIC(5,1)),
  ('Sick leave',      true,  NULL),
  ('Unpaid leave',    false, NULL),
  ('Public holiday',  true,  NULL)
) AS t(name, is_paid, annual_days)
ON CONFLICT DO NOTHING;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
--
-- After COMMIT, deliberately. Four migrations in this project have "run"
-- without committing — the statements execute, the session ends, nothing
-- persists, and the report says success. A SELECT inside the transaction shows
-- the intended state either way and proves nothing.

SELECT 'tables' AS check_name, string_agg(tablename, ', ' ORDER BY tablename) AS result
  FROM pg_tables
 WHERE schemaname = 'public'
   AND tablename IN ('attendance_days', 'leave_types', 'leave_requests')

UNION ALL
SELECT 'rls enabled', string_agg(c.relname || '=' || c.relrowsecurity::text, ', ' ORDER BY c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('attendance_days', 'leave_types', 'leave_requests')

UNION ALL
SELECT 'policies', count(*)::text
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('attendance_days', 'leave_types', 'leave_requests')

UNION ALL
SELECT 'overlap constraint', count(*)::text
  FROM pg_constraint WHERE conname = 'leave_no_overlap'

UNION ALL
SELECT 'authenticated can delete',
       has_table_privilege('authenticated', 'public.attendance_days', 'DELETE')::text

UNION ALL
SELECT 'leave types seeded', count(*)::text FROM public.leave_types;

-- Expected:
--   tables                    attendance_days, leave_requests, leave_types
--   rls enabled               attendance_days=true, leave_requests=true, leave_types=true
--   policies                  7
--   overlap constraint        1
--   authenticated can delete  false
--   leave types seeded        4 per organization

-- ── Capabilities become enforced ────────────────────────────────────────────
--
-- attendance.read and attendance.manage move from 'planned' to enforced, and
-- the three leave capabilities are new. The role defaults live in two places —
-- here and lib/auth/capabilities.ts — because a policy cannot call TypeScript,
-- and routing every policy through the application would make RLS decorative.
-- `capabilities.test.ts` parses this function and fails if the two disagree,
-- which is the price of that duplication and the reason it is safe.
--
-- Requesting leave is given to every role. Approving it is not: a technician
-- who could approve their own request is the whole control gone.

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
      'leave.read','leave.request','leave.approve']
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
      'leave.read','leave.request','leave.approve']
    WHEN 'advisor' THEN ARRAY[
      'customers.read','customers.manage','customers.archive',
      'vehicles.read','vehicles.manage',
      'jobs.read','jobs.manage',
      'inspections.read','inspections.manage',
      'estimates.read','estimates.manage',
      'parts.read',
      'appointments.read','appointments.manage',
      'leave.request']
    WHEN 'technician' THEN ARRAY[
      'jobs.read','jobs.manage',
      'repair_orders.read','repair_orders.manage',
      'inspections.read','inspections.manage',
      'parts.read','parts.manage',
      'leave.request']
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

-- Verification, after COMMIT. All three expect TRUE: the function grants
-- leave.approve and attendance.manage, and does not give a technician
-- approval over their own leave.
SELECT
  'has_capability grants leave.approve' AS check_name,
  prosrc LIKE '%leave.approve%'         AS ok
FROM pg_proc WHERE proname = 'has_capability'
UNION ALL
SELECT 'has_capability grants attendance.manage', prosrc LIKE '%attendance.manage%'
FROM pg_proc WHERE proname = 'has_capability'
UNION ALL
-- A technician must NOT get leave.approve. Only the text AFTER the technician
-- branch is searched: looking for the string anywhere in the function would
-- match the owner branch and pass while the control was gone. split_part
-- rather than a regex, because the bracket escaping is the kind of detail
-- that silently turns a check into a tautology.
SELECT 'technician cannot approve leave',
  split_part(prosrc, 'WHEN ''technician'' THEN ARRAY[', 2) NOT LIKE '%leave.approve%'
FROM pg_proc WHERE proname = 'has_capability';
