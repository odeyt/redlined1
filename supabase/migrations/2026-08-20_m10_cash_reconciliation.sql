-- M10 — Daily cash reconciliation
--
-- Closing the day: count what is in the till, compare it to what the records
-- say should be there, and record the difference. The M0 audit called this
-- "needs a period/closing concept that does not exist" — this is that concept,
-- kept as small as it can be.
--
-- ## Per currency, because the till holds three
--
-- A drawer in this shop contains LAK, THB and USD. One combined figure would
-- be meaningless, so a day has one line per currency and each is counted,
-- compared and explained on its own.
--
-- ## A variance does not block closing
--
-- Requiring the count to match is how you get a count that has been made to
-- match. The whole value of this is an honest number, so a difference is
-- always allowed — but a non-zero variance must carry an explanation, which is
-- a control that improves the record instead of corrupting it.
--
-- ## Expected is a snapshot, not a live sum
--
-- Same rule as payroll lines. A payment entered tomorrow but dated today would
-- otherwise silently change what a closed day claims it expected, and a closed
-- day that keeps moving is not a record of anything.
--
-- ## RUN THIS IN SECTIONS
--
-- Four sections with line counts, each ending in its own check. Paste one at a
-- time and confirm before moving on.

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — tables        (about 85 lines)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.cash_days (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  -- A till belongs to a location. Two shops close their own days.
  shop_id          UUID NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
  business_date    DATE NOT NULL,

  status           TEXT NOT NULL DEFAULT 'Open',

  closed_by        UUID,
  closed_at        TIMESTAMPTZ,
  -- Set when a closed day is deliberately reopened to fix something. Kept
  -- rather than cleared: "this day was reopened once" is exactly the fact
  -- somebody will want later.
  reopened_by      UUID,
  reopened_at      TIMESTAMPTZ,
  reopen_reason    TEXT,

  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cash_day_status_check
    CHECK (status IN ('Open', 'Closed')),
  CONSTRAINT cash_day_closed_has_an_owner
    CHECK (status = 'Open' OR closed_by IS NOT NULL),
  CONSTRAINT cash_day_reopen_has_a_reason
    CHECK (reopened_at IS NULL OR (reopened_by IS NOT NULL AND reopen_reason IS NOT NULL))
);

-- One close per till per day. A second one is how the same takings get counted
-- twice.
CREATE UNIQUE INDEX IF NOT EXISTS cash_one_day_per_shop
  ON public.cash_days (shop_id, business_date);

CREATE INDEX IF NOT EXISTS cash_days_org_date_idx
  ON public.cash_days (organization_id, business_date DESC);

CREATE TABLE IF NOT EXISTS public.cash_day_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id           UUID NOT NULL REFERENCES public.cash_days(id) ON DELETE CASCADE,
  currency         TEXT NOT NULL,

  -- What was in the drawer at the start. Usually yesterday's closing count.
  opening_float    NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- ── Snapshotted when the day is closed ─────────────────────────────────
  -- Cash taken in, cash paid out, and the figure they imply. Copied rather
  -- than recomputed, so a backdated payment cannot rewrite a closed day.
  cash_in          NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_out         NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_cash    NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- What a person actually counted. NULL until somebody counts it, which is
  -- the difference between "no cash" and "not counted yet".
  counted_cash     NUMERIC(14,2),

  -- counted − expected. Stored rather than derived so a closed day keeps the
  -- number it was closed on, whatever anything else does afterwards.
  variance         NUMERIC(14,2),

  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cash_line_counted_not_negative
    CHECK (counted_cash IS NULL OR counted_cash >= 0),
  CONSTRAINT cash_line_float_not_negative
    CHECK (opening_float >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS cash_one_line_per_currency
  ON public.cash_day_lines (day_id, currency);

DROP TRIGGER IF EXISTS cash_days_touch ON public.cash_days;
CREATE TRIGGER cash_days_touch
  BEFORE UPDATE ON public.cash_days
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS cash_day_lines_touch ON public.cash_day_lines;
CREATE TRIGGER cash_day_lines_touch
  BEFORE UPDATE ON public.cash_day_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;

-- ── Check section 1 ─────────────────────────────────────────────────────────
SELECT 'tables (expect 2)' AS check_name, count(*)::text AS result
  FROM pg_tables WHERE schemaname = 'public'
   AND tablename IN ('cash_days', 'cash_day_lines');

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — closing and reopening        (about 110 lines)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Closing checks three things and then freezes the day:
--
--   1. every line has actually been counted
--   2. every line with a difference carries an explanation
--   3. the variance recorded matches counted minus expected
--
-- The third exists because the variance is stored rather than derived, and a
-- stored number that disagrees with its own inputs is worse than no number.
--
-- SECURITY DEFINER, so it checks permission itself — RLS does not apply inside
-- it, and without the check any signed-in user could close anyone's till.

BEGIN;

CREATE OR REPLACE FUNCTION public.close_cash_day(p_day_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS TABLE (currencies INT, total_variance NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org      UUID;
  v_shop     UUID;
  v_status   TEXT;
  v_allowed  BOOLEAN;
  v_line     RECORD;
  v_count    INT := 0;
  v_variance NUMERIC := 0;
BEGIN
  SELECT d.organization_id, d.shop_id, d.status INTO v_org, v_shop, v_status
  FROM public.cash_days d WHERE d.id = p_day_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'That day no longer exists.';
  END IF;

  IF v_status <> 'Open' THEN
    RAISE EXCEPTION 'That day is already closed.';
  END IF;

  SELECT public.has_capability(v_shop, 'reconciliation.manage') INTO v_allowed;
  IF auth.uid() IS NOT NULL AND NOT v_allowed THEN
    RAISE EXCEPTION 'You do not have permission to close the day.';
  END IF;

  FOR v_line IN
    SELECT l.currency, l.counted_cash, l.expected_cash, l.variance, l.notes
    FROM public.cash_day_lines l WHERE l.day_id = p_day_id
  LOOP
    IF v_line.counted_cash IS NULL THEN
      RAISE EXCEPTION 'The % cash has not been counted yet.', v_line.currency;
    END IF;

    -- The variance must agree with its own inputs. Recomputed here rather than
    -- trusted, because it arrives from a browser.
    IF v_line.variance IS DISTINCT FROM (v_line.counted_cash - v_line.expected_cash) THEN
      RAISE EXCEPTION
        'The % variance does not match the count. Recalculate before closing.', v_line.currency;
    END IF;

    -- A difference is allowed — insisting on a perfect match is how counts get
    -- made to match — but it has to be explained.
    IF v_line.variance <> 0 AND (v_line.notes IS NULL OR length(trim(v_line.notes)) = 0) THEN
      RAISE EXCEPTION
        'The % count is out by %. Say why before closing.', v_line.currency, v_line.variance;
    END IF;

    v_count := v_count + 1;
    v_variance := v_variance + abs(v_line.variance);
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'There is nothing to close — no currencies have been counted.';
  END IF;

  UPDATE public.cash_days
     SET status = 'Closed',
         closed_by = auth.uid(),
         closed_at = now(),
         notes = COALESCE(p_notes, notes)
   WHERE id = p_day_id;

  RETURN QUERY SELECT v_count, v_variance;
END $fn$;

REVOKE ALL ON FUNCTION public.close_cash_day(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_cash_day(UUID, TEXT) TO authenticated;

-- Reopening is allowed, and deliberately noisy: it needs a reason, it keeps
-- the original closing details, and it is audited. Shops do make mistakes, and
-- a system that cannot correct one gets worked around instead.
CREATE OR REPLACE FUNCTION public.reopen_cash_day(p_day_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_shop    UUID;
  v_status  TEXT;
  v_allowed BOOLEAN;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Reopening a closed day needs a reason.';
  END IF;

  SELECT d.shop_id, d.status INTO v_shop, v_status
  FROM public.cash_days d WHERE d.id = p_day_id;

  IF v_shop IS NULL THEN
    RAISE EXCEPTION 'That day no longer exists.';
  END IF;

  IF v_status <> 'Closed' THEN
    RAISE EXCEPTION 'That day is not closed.';
  END IF;

  SELECT public.has_capability(v_shop, 'reconciliation.manage') INTO v_allowed;
  IF auth.uid() IS NOT NULL AND NOT v_allowed THEN
    RAISE EXCEPTION 'You do not have permission to reopen a closed day.';
  END IF;

  -- closed_by and closed_at are NOT cleared: who closed it and when is still
  -- true, and is the more interesting half of the story once it was reopened.
  UPDATE public.cash_days
     SET status = 'Open',
         reopened_by = auth.uid(),
         reopened_at = now(),
         reopen_reason = p_reason
   WHERE id = p_day_id;
END $fn$;

REVOKE ALL ON FUNCTION public.reopen_cash_day(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_cash_day(UUID, TEXT) TO authenticated;

-- A closed day's lines are frozen. Reopening is the only way back in, which is
-- what makes the reopen record meaningful.
CREATE OR REPLACE FUNCTION public.cash_line_is_frozen()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM public.cash_days
   WHERE id = COALESCE(NEW.day_id, OLD.day_id);

  IF v_status = 'Closed' THEN
    RAISE EXCEPTION 'That day is closed. Reopen it first, with a reason.';
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS cash_day_lines_frozen ON public.cash_day_lines;
CREATE TRIGGER cash_day_lines_frozen
  BEFORE UPDATE OR DELETE ON public.cash_day_lines
  FOR EACH ROW EXECUTE FUNCTION public.cash_line_is_frozen();

COMMIT;

-- ── Check section 2 ─────────────────────────────────────────────────────────
SELECT 'close function (expect 1)' AS check_name, count(*)::text AS result
  FROM pg_proc WHERE proname = 'close_cash_day'
UNION ALL
SELECT 'reopen function (expect 1)', count(*)::text
  FROM pg_proc WHERE proname = 'reopen_cash_day'
UNION ALL
SELECT 'freeze trigger (expect 1)', count(*)::text
  FROM pg_trigger WHERE tgname = 'cash_day_lines_frozen'
UNION ALL
SELECT 'public cannot close a day (expect false)',
       has_function_privilege('public', 'public.close_cash_day(uuid,text)', 'EXECUTE')::text;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — row level security and grants        (about 65 lines)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.cash_days      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_day_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_days_all ON public.cash_days;
CREATE POLICY cash_days_all ON public.cash_days
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shop_users su
    WHERE su.shop_id = cash_days.shop_id
      AND su.user_id = auth.uid()
      AND public.has_capability(cash_days.shop_id, 'reconciliation.manage')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.shop_users su
    WHERE su.shop_id = cash_days.shop_id
      AND su.user_id = auth.uid()
      AND public.has_capability(cash_days.shop_id, 'reconciliation.manage')));

-- Lines are reached through their day, so the check is on the day's shop.
DROP POLICY IF EXISTS cash_day_lines_all ON public.cash_day_lines;
CREATE POLICY cash_day_lines_all ON public.cash_day_lines
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cash_days d
    JOIN public.shop_users su ON su.shop_id = d.shop_id
    WHERE d.id = cash_day_lines.day_id
      AND su.user_id = auth.uid()
      AND public.has_capability(d.shop_id, 'reconciliation.manage')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.cash_days d
    JOIN public.shop_users su ON su.shop_id = d.shop_id
    WHERE d.id = cash_day_lines.day_id
      AND su.user_id = auth.uid()
      AND public.has_capability(d.shop_id, 'reconciliation.manage')));

-- DELETE is granted on days so an Open day created by mistake can be thrown
-- away. A CLOSED day cannot be deleted: the policy allows it, but a closed
-- day's lines are frozen by the trigger and the cascade would fire that
-- trigger, so the delete fails. That is deliberate — the record of a day that
-- was counted and closed should not be removable at all.
REVOKE ALL ON public.cash_days      FROM PUBLIC;
REVOKE ALL ON public.cash_day_lines FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_days      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_day_lines TO authenticated;

COMMIT;

-- ── Check section 3 ─────────────────────────────────────────────────────────
SELECT 'policies (expect 2)' AS check_name, count(*)::text AS result
  FROM pg_policies WHERE schemaname = 'public'
   AND tablename IN ('cash_days', 'cash_day_lines')
UNION ALL
SELECT 'rls on', string_agg(c.relname || '=' || c.relrowsecurity::text, ', ' ORDER BY c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('cash_days', 'cash_day_lines');

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — capabilities        (about 110 lines)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- reconciliation.manage becomes enforced, for the owner AND the manager.
--
-- Counting the till at the end of the day is a manager's job in any shop this
-- size — withholding it would mean the owner has to be present every evening,
-- and a control nobody can follow gets worked around. What a manager still
-- cannot see is pay, payroll and expense approval.

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
      'expenses.read','expenses.create','expenses.approve',
      'reconciliation.manage']
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
      'expenses.read','expenses.create',
      'reconciliation.manage']
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
SELECT 'manager can close the day (expect true)' AS check_name,
       (split_part(prosrc, 'WHEN ''manager'' THEN ARRAY[', 2) LIKE '%reconciliation.manage%')::text AS result
  FROM pg_proc WHERE proname = 'has_capability'
UNION ALL
SELECT 'technician cannot (expect true)',
       (split_part(prosrc, 'WHEN ''technician'' THEN ARRAY[', 2) NOT LIKE '%reconciliation.manage%')::text
  FROM pg_proc WHERE proname = 'has_capability'
UNION ALL
SELECT 'attendance still enforced (expect true)',
       (prosrc LIKE '%attendance.manage%')::text FROM pg_proc WHERE proname = 'has_capability'
UNION ALL
SELECT 'salary still enforced (expect true)',
       (prosrc LIKE '%salary.manage%')::text FROM pg_proc WHERE proname = 'has_capability'
UNION ALL
SELECT 'payroll still enforced (expect true)',
       (prosrc LIKE '%payroll.manage%')::text FROM pg_proc WHERE proname = 'has_capability'
UNION ALL
SELECT 'expenses still enforced (expect true)',
       (prosrc LIKE '%expenses.approve%')::text FROM pg_proc WHERE proname = 'has_capability';
