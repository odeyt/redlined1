-- Internal reminders — "who needs to do what, and by when".
--
-- A shop's own to-do list: call the parts supplier back, chase an approval,
-- check the Camry's torque after 50 km. Created, assigned, due, done. Linked
-- to the customer, vehicle or job card it is about, when there is one.
--
-- ## What this is NOT
--
-- Nothing here sends anything. No SMS, email, call, WhatsApp, push or webhook
-- is triggered by a reminder, and no status in this schema means "sent" or
-- "contacted". Outbound customer communication belongs to a separate product
-- and is deliberately absent — a reminder records internal work only.
--
-- ## Enforced here, not in the browser
--
-- The app writes through the signed-in browser client, so the database is the
-- server-side boundary. Every rule a customer could get round by calling the
-- REST API directly lives in this file:
--
--   - tenancy        RLS: only members of the reminder's shop see it at all.
--   - visibility     owner/manager see every reminder in their shop; other
--                    staff see what they created or what is assigned to them.
--   - links          a linked customer, vehicle or job card must belong to the
--                    SAME shop as the reminder. Checked for every write, with
--                    one generic error for "does not exist" and "belongs to
--                    another shop", so the check cannot be used to probe.
--   - assignment     assignee must be a member of the same shop. Assigning to
--                    someone other than yourself needs owner/manager AND a
--                    plan with team assignment (Starter and above, or trial).
--   - Free Forever   at most 3 OPEN reminders per shop, race-safe (section 3).
--   - history        written by trigger with the caller stamped from auth.uid(),
--                    only when something actually changed — so a retried
--                    "complete" never appends a second row.
--   - feature flag   while internal_reminders is OFF for the caller and shop,
--                    RLS returns no reminders and no history, refuses every
--                    insert and matches no row for edit, complete, reopen or
--                    cancel. Records are kept, just unreachable. See section 2.
--   - shop           a reminder lives in exactly the shop it was created in.
--                    Linked records and the assignee must belong to that same
--                    shop; a mirrored location's record is refused, not used
--                    as a reason to file the reminder somewhere else.
--
-- ## Downgrades
--
-- Nothing is ever deleted or rewritten when a plan lapses. Existing reminders
-- stay readable, editable and completable. Only NEW actions beyond the plan
-- are refused: creating or reopening past the cap, or assigning to somebody
-- else. Re-saving a reminder that was assigned to a colleague while on a paid
-- plan is fine — the assignee is only checked when it changes.
--
-- ## Plan identity
--
-- Same source of truth as usePlan() and free_tier_usage_limits.sql: the shop
-- owner's profiles.plan and profiles.trial_ends_at, read the way
-- lib/planGate.ts getPlanStatus() reads them (paid plan first, then an
-- unexpired trial, otherwise free). No shop is special-cased: like the
-- existing free-tier trigger, entitlement comes from the owner's plan alone,
-- so an internal shop is entitled because its owner's plan says so. No
-- payment-provider column is read.
--
-- Additive only: two new tables, their functions, triggers and policies, and
-- one feature_flags row seeded DISABLED. No existing table, column, policy or
-- function is altered. Forward-only; see the rollback note at the end.
--
-- ## ONE TRANSACTION
--
-- Every object this file creates — tables, indexes, functions, triggers,
-- policies, grants and the disabled flag row — is created inside a single
-- BEGIN … COMMIT. If any statement fails, the whole migration rolls back and
-- the database is left exactly as it was: there is no partially installed
-- state to recover from. Run the file as one script, not section by section.
-- The five SECTION banners are for reading only.
--
-- After COMMIT come read-only checks (SELECTs only). They change nothing, and
-- if they are skipped nothing is lost.
--
-- ## Re-running
--
-- Re-running THIS EXACT FILE is harmless: every statement is guarded
-- (IF NOT EXISTS, CREATE OR REPLACE, DROP … IF EXISTS before CREATE,
-- ON CONFLICT DO NOTHING) and the result is the same. That is for a failed
-- attempt that rolled back, or a double paste — nothing more.
--
-- It is NOT a way to change the schema later. CREATE TABLE IF NOT EXISTS skips
-- a table that already exists, so a column added to this file would silently
-- not appear; and CREATE OR REPLACE / DROP-then-CREATE would overwrite any
-- hotfix made to these functions or policies since. Any later change is a new,
-- separately dated migration file, as everywhere else in supabase/migrations.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — tables and indexes
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shop_reminders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: a shop with reminders is not silently emptied by a shop delete.
  shop_id      UUID NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,

  title        TEXT NOT NULL,
  notes        TEXT,
  due_at       TIMESTAMPTZ NOT NULL,
  priority     TEXT NOT NULL DEFAULT 'normal',
  status       TEXT NOT NULL DEFAULT 'open',

  assigned_to  UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Links to the record a reminder is about. SET NULL, never CASCADE: deleting
  -- a customer must not quietly delete the work somebody still has to do.
  -- customers.id and job_cards.id are TEXT (job cards are 'JC-<epoch>'),
  -- vehicles.id is UUID.
  customer_id  TEXT REFERENCES public.customers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  vehicle_id   UUID REFERENCES public.vehicles(id)  ON DELETE SET NULL,
  job_card_id  TEXT REFERENCES public.job_cards(id) ON UPDATE CASCADE ON DELETE SET NULL,

  -- Stamped by trigger from auth.uid(); never taken from the client.
  created_by   UUID,
  updated_by   UUID,
  completed_by UUID,
  completed_at TIMESTAMPTZ,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT shop_reminders_title_length
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  CONSTRAINT shop_reminders_notes_length
    CHECK (notes IS NULL OR char_length(notes) <= 2000),
  CONSTRAINT shop_reminders_priority_check
    CHECK (priority IN ('low', 'normal', 'high')),
  CONSTRAINT shop_reminders_status_check
    CHECK (status IN ('open', 'completed', 'cancelled')),
  CONSTRAINT shop_reminders_completion_stamped
    CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

-- The list screen and the dashboard counts: one shop, by status, by due time.
CREATE INDEX IF NOT EXISTS shop_reminders_shop_status_due_idx
  ON public.shop_reminders (shop_id, status, due_at);

-- The Completed tab: closed reminders, most recently closed first, capped.
CREATE INDEX IF NOT EXISTS shop_reminders_shop_closed_idx
  ON public.shop_reminders (shop_id, updated_at DESC)
  WHERE status IN ('completed', 'cancelled');

-- "Assigned to me" for staff who cannot see the whole shop.
CREATE INDEX IF NOT EXISTS shop_reminders_assignee_status_due_idx
  ON public.shop_reminders (assigned_to, status, due_at)
  WHERE assigned_to IS NOT NULL;

-- "Created by me", the other half of what non-managers can see.
CREATE INDEX IF NOT EXISTS shop_reminders_creator_idx
  ON public.shop_reminders (created_by, status)
  WHERE created_by IS NOT NULL;

-- Per-record lookups from the customer, vehicle and job card screens. They
-- also keep ON DELETE SET NULL from scanning this table when a record goes.
CREATE INDEX IF NOT EXISTS shop_reminders_customer_idx
  ON public.shop_reminders (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shop_reminders_vehicle_idx
  ON public.shop_reminders (vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shop_reminders_job_card_idx
  ON public.shop_reminders (job_card_id) WHERE job_card_id IS NOT NULL;

-- History. Written only by the trigger in section 4. Holds stable ids and
-- field NAMES, never the title or notes themselves: history is kept longer
-- than the reminder is interesting, and notes can mention a customer.
CREATE TABLE IF NOT EXISTS public.shop_reminder_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL,
  reminder_id     UUID NOT NULL REFERENCES public.shop_reminders(id) ON DELETE RESTRICT,
  action          TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  changed_fields  TEXT[] NOT NULL DEFAULT '{}',
  assigned_to     UUID,
  actor_id        UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT shop_reminder_events_action_check
    CHECK (action IN ('created', 'updated', 'assigned', 'completed', 'reopened', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS shop_reminder_events_reminder_idx
  ON public.shop_reminder_events (reminder_id, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — who counts as a manager, and what the plan allows
-- ═══════════════════════════════════════════════════════════════════════════

-- Owner or manager of this shop. Named for this feature so it cannot collide
-- with, or be mistaken for, a general-purpose helper.
CREATE OR REPLACE FUNCTION public.reminders_can_manage_shop(p_shop_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_users su
    WHERE su.shop_id = p_shop_id
      AND su.user_id = auth.uid()
      AND su.role IN ('owner', 'manager')
  );
$fn$;

-- 'team' | 'solo' | 'free' — the reminder entitlement for a shop.
--
--   team  Starter, Professional, Business, Enterprise, legacy 'pro', or an
--         unexpired trial. Unlimited, team assignment.
--   solo  Solo. Unlimited, but only ever assigned to yourself.
--   free  Anything else — Free Forever, a lapsed trial, an unsettled NULL
--         plan — exactly as getPlanStatus() reads it. Self-assignment, 3 open.
--
-- Mirrors lib/reminders/entitlements.ts reminderTier(). Both are run against
-- the same scenario table (tests/db/reminders/planTierScenarios.json) —
-- Jest for the TypeScript, tests/db/run-reminders-db-tests.mjs for this — so
-- they cannot drift apart silently. If the shop has several owners the most
-- generous plan wins, so the answer does not depend on row order.
--
-- No shop id is special-cased. The existing free-tier trigger has no
-- exception either: an internal shop is entitled because its owner's plan
-- says so, and must be verified that way before this is enabled for it.
--
-- Entitlement that cannot be proven is not granted. A shop with no owner, an
-- owner with no profile row, or a NULL/unknown plan reads as 'free' — the
-- same answer getPlanStatus() gives for missing plan data. That keeps
-- personal reminders working (self-assigned, 3 open) and never unlocks team
-- assignment or unlimited reminders on the strength of a missing row. This is
-- deliberately stricter than free_tier_usage_limits.sql, which lets such a
-- shop through unlimited.
--
-- Returns NULL to a signed-in caller who is not a member of the shop, so it
-- cannot be used to learn another tenant's plan.
CREATE OR REPLACE FUNCTION public.reminder_plan_tier(p_shop_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_best   TEXT := NULL;
  v_owner  RECORD;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shop_users su
    WHERE su.shop_id = p_shop_id AND su.user_id = auth.uid()
  ) THEN
    RETURN NULL;
  END IF;

  FOR v_owner IN
    SELECT p.plan, p.trial_ends_at
    FROM public.shop_users su
    JOIN public.profiles p ON p.id = su.user_id
    WHERE su.shop_id = p_shop_id AND su.role = 'owner'
  LOOP
    IF v_owner.plan IN ('starter', 'professional', 'business', 'enterprise', 'pro') THEN
      RETURN 'team';
    ELSIF v_owner.plan = 'solo' THEN
      v_best := 'solo';
    ELSIF v_owner.trial_ends_at IS NOT NULL AND v_owner.trial_ends_at > now() THEN
      RETURN 'team';
    ELSIF v_best IS NULL THEN
      v_best := 'free';
    END IF;
  END LOOP;

  -- No owner, or no owner with a profile: nothing proves an entitlement.
  RETURN COALESCE(v_best, 'free');
END $fn$;

-- Whether internal_reminders is ON for the calling user in this shop.
--
-- The same feature_flags rows Settings → Feature Flags writes, read with the
-- same precedence as lib/featureFlags/featureFlagService.ts evaluateFlag():
-- user, then role, then shop, then environment, then global, else OFF. It is
-- an evaluator for the existing flag, not a second flag system.
--
-- It FAILS CLOSED wherever the database knows less than the app, so it can
-- only ever be OFF where the app would say ON, never the reverse:
--
--   environment   The database cannot tell production from staging. An
--                 environment row set OFF switches the feature off; one set ON
--                 cannot switch it on — enable with a global, shop, role or
--                 user row instead.
--   user / role   A row carrying a shop_id applies only to that shop here (the
--                 app ignores shop_id on these scopes).
--   ties          Two rows at the same level that disagree read as OFF.
--
-- The scenarios in tests/db/reminders/flagScenarios.json are run against
-- both evaluators and assert exactly that.
--
-- No signed-in user, or not a member of the shop: OFF.
CREATE OR REPLACE FUNCTION public.internal_reminders_enabled(p_shop_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid   UUID := auth.uid();
  v_role  TEXT;
  v_rows  INTEGER;
  v_on    BOOLEAN;
  v_here  BOOLEAN;
BEGIN
  IF v_uid IS NULL OR p_shop_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT su.role INTO v_role
  FROM public.shop_users su
  WHERE su.shop_id = p_shop_id AND su.user_id = v_uid;
  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1. user
  SELECT count(*), bool_and(f.enabled), bool_or(f.shop_id IS NULL OR f.shop_id = p_shop_id)
    INTO v_rows, v_on, v_here
  FROM public.feature_flags f
  WHERE f.flag_key = 'internal_reminders' AND f.scope = 'user' AND f.user_id = v_uid;
  IF v_rows > 0 THEN RETURN v_on AND v_here; END IF;

  -- 2. role
  SELECT count(*), bool_and(f.enabled), bool_or(f.shop_id IS NULL OR f.shop_id = p_shop_id)
    INTO v_rows, v_on, v_here
  FROM public.feature_flags f
  WHERE f.flag_key = 'internal_reminders' AND f.scope = 'role' AND f.role = v_role;
  IF v_rows > 0 THEN RETURN v_on AND v_here; END IF;

  -- 3. shop
  SELECT count(*), bool_and(f.enabled) INTO v_rows, v_on
  FROM public.feature_flags f
  WHERE f.flag_key = 'internal_reminders' AND f.scope = 'shop' AND f.shop_id = p_shop_id;
  IF v_rows > 0 THEN RETURN v_on; END IF;

  -- 4. environment: can only switch OFF (see above).
  IF EXISTS (SELECT 1 FROM public.feature_flags f
             WHERE f.flag_key = 'internal_reminders' AND f.scope = 'environment'
               AND NOT f.enabled) THEN
    RETURN FALSE;
  END IF;

  -- 5. global
  SELECT count(*), bool_and(f.enabled) INTO v_rows, v_on
  FROM public.feature_flags f
  WHERE f.flag_key = 'internal_reminders' AND f.scope = 'global';
  IF v_rows > 0 THEN RETURN v_on; END IF;

  RETURN FALSE;
END $fn$;

-- Needed by `authenticated`: RLS policies call these as the requesting user.
-- Never by anon.
REVOKE ALL ON FUNCTION public.reminders_can_manage_shop(UUID)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reminder_plan_tier(UUID)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.internal_reminders_enabled(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reminders_can_manage_shop(UUID)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reminder_plan_tier(UUID)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.internal_reminders_enabled(UUID) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — the write guard
-- ═══════════════════════════════════════════════════════════════════════════
--
-- One BEFORE trigger for every insert and update. It stamps who and when,
-- freezes what must not move, validates links and the assignee, and applies
-- the Free Forever cap.
--
-- ## Why the cap takes a lock
--
-- free_tier_usage_limits.sql counts and then inserts. Two requests arriving
-- together both count 2, both pass, and the shop ends up with 4. Here the
-- count happens only after taking a transaction-scoped advisory lock keyed on
-- the shop, so a second writer waits until the first commits and then counts
-- its row. Each statement in PL/pgSQL takes a fresh snapshot under READ
-- COMMITTED (what PostgREST uses), which is what makes the waiting writer see
-- the committed row. Only free shops take the lock; nobody else pays for it.
--
-- The cap applies to anything that makes a reminder OPEN: creating one, and
-- reopening a completed or cancelled one. Otherwise complete-then-reopen
-- would walk straight round it.

CREATE OR REPLACE FUNCTION public.shop_reminders_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid        UUID := auth.uid();
  v_open_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Flag OFF: refused with a readable code rather than the bare RLS error
    -- the insert policy would give. Only inserts are checked here — an edit
    -- of a row the flag hides never reaches this trigger, because the update
    -- policy matches nothing, while a customer or job card being deleted
    -- (ON DELETE SET NULL, which bypasses RLS) must never be blocked by it.
    -- Only a member of the shop is told the feature is off; anyone else gets
    -- the insert policy's ordinary refusal, as for any shop not theirs.
    IF v_uid IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.shop_users su
                   WHERE su.shop_id = NEW.shop_id AND su.user_id = v_uid)
       AND NOT public.internal_reminders_enabled(NEW.shop_id) THEN
      RAISE EXCEPTION 'REMINDERS_DISABLED' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.status IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'REMINDER_NEW_MUST_BE_OPEN' USING ERRCODE = 'P0001';
    END IF;
    IF v_uid IS NOT NULL THEN
      NEW.created_by := v_uid;
    END IF;
    NEW.created_at   := now();
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
  ELSE
    IF NEW.shop_id    IS DISTINCT FROM OLD.shop_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'REMINDER_IMMUTABLE' USING ERRCODE = 'P0001';
    END IF;

    -- Completion is stamped here, never accepted from the client, so nobody
    -- can back-date it or put it in someone else's name.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'completed' THEN
        NEW.completed_at := now();
        NEW.completed_by := v_uid;
      ELSE
        NEW.completed_at := NULL;
        NEW.completed_by := NULL;
      END IF;
    ELSE
      NEW.completed_at := OLD.completed_at;
      NEW.completed_by := OLD.completed_by;
    END IF;
  END IF;

  NEW.title := btrim(NEW.title);

  -- Nothing that matters changed: keep the row exactly as it was. A retried
  -- "complete" on a completed reminder is a no-op, so it neither bumps
  -- updated_at nor produces a history row.
  IF TG_OP = 'UPDATE'
     AND NEW.title       IS NOT DISTINCT FROM OLD.title
     AND NEW.notes       IS NOT DISTINCT FROM OLD.notes
     AND NEW.due_at      IS NOT DISTINCT FROM OLD.due_at
     AND NEW.priority    IS NOT DISTINCT FROM OLD.priority
     AND NEW.status      IS NOT DISTINCT FROM OLD.status
     AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to
     AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
     AND NEW.vehicle_id  IS NOT DISTINCT FROM OLD.vehicle_id
     AND NEW.job_card_id IS NOT DISTINCT FROM OLD.job_card_id THEN
    RETURN OLD;
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := COALESCE(v_uid, NEW.updated_by);

  -- ── Links: same shop, or it does not exist. One message for both. ──────
  -- Clearing a link is always allowed; that is also what ON DELETE SET NULL
  -- does when the linked record is removed.
  IF NEW.customer_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.customer_id IS DISTINCT FROM OLD.customer_id)
     AND NOT EXISTS (SELECT 1 FROM public.customers c
                     WHERE c.id = NEW.customer_id AND c.shop_id = NEW.shop_id) THEN
    RAISE EXCEPTION 'REMINDER_LINK_INVALID:customer' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.vehicle_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id)
     AND NOT EXISTS (SELECT 1 FROM public.vehicles v
                     WHERE v.id = NEW.vehicle_id AND v.shop_id = NEW.shop_id) THEN
    RAISE EXCEPTION 'REMINDER_LINK_INVALID:vehicle' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.job_card_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.job_card_id IS DISTINCT FROM OLD.job_card_id)
     AND NOT EXISTS (SELECT 1 FROM public.job_cards j
                     WHERE j.id = NEW.job_card_id AND j.shop_id = NEW.shop_id) THEN
    RAISE EXCEPTION 'REMINDER_LINK_INVALID:job_card' USING ERRCODE = 'P0001';
  END IF;

  -- ── Assignee: checked only when it changes, so downgrades keep working. ─
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    IF NOT EXISTS (SELECT 1 FROM public.shop_users su
                   WHERE su.shop_id = NEW.shop_id AND su.user_id = NEW.assigned_to) THEN
      RAISE EXCEPTION 'REMINDER_ASSIGNEE_INVALID' USING ERRCODE = 'P0001';
    END IF;

    IF v_uid IS NULL OR NEW.assigned_to <> v_uid THEN
      IF v_uid IS NOT NULL AND NOT public.reminders_can_manage_shop(NEW.shop_id) THEN
        RAISE EXCEPTION 'REMINDER_ASSIGN_FORBIDDEN' USING ERRCODE = 'P0001';
      END IF;
      IF public.reminder_plan_tier(NEW.shop_id) IS DISTINCT FROM 'team' THEN
        RAISE EXCEPTION 'REMINDER_TEAM_PLAN' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- ── Free Forever: 3 open at a time, race-safe. ─────────────────────────
  IF NEW.status = 'open'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'open')
     AND public.reminder_plan_tier(NEW.shop_id) = 'free' THEN
    PERFORM pg_advisory_xact_lock(hashtext('shop_reminders.open_cap'),
                                  hashtext(NEW.shop_id::text));
    SELECT count(*) INTO v_open_count
    FROM public.shop_reminders r
    WHERE r.shop_id = NEW.shop_id
      AND r.status = 'open'
      AND r.id <> NEW.id;
    IF v_open_count >= 3 THEN
      RAISE EXCEPTION 'REMINDER_LIMIT:3'
        USING ERRCODE = 'P0001',
              HINT = 'Complete a reminder or upgrade your plan to add more.';
    END IF;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS shop_reminders_guard ON public.shop_reminders;
CREATE TRIGGER shop_reminders_guard
  BEFORE INSERT OR UPDATE ON public.shop_reminders
  FOR EACH ROW EXECUTE FUNCTION public.shop_reminders_guard();

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — history
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.shop_reminders_record_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_changed TEXT[] := '{}';
  v_action  TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.shop_reminder_events
      (shop_id, reminder_id, action, from_status, to_status, assigned_to, actor_id)
    VALUES
      (NEW.shop_id, NEW.id, 'created', NULL, NEW.status, NEW.assigned_to, auth.uid());
    RETURN NULL;
  END IF;

  IF NEW.title       IS DISTINCT FROM OLD.title       THEN v_changed := v_changed || 'title'::text;       END IF;
  IF NEW.notes       IS DISTINCT FROM OLD.notes       THEN v_changed := v_changed || 'notes'::text;       END IF;
  IF NEW.due_at      IS DISTINCT FROM OLD.due_at      THEN v_changed := v_changed || 'due_at'::text;      END IF;
  IF NEW.priority    IS DISTINCT FROM OLD.priority    THEN v_changed := v_changed || 'priority'::text;    END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN v_changed := v_changed || 'assigned_to'::text; END IF;
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN v_changed := v_changed || 'customer_id'::text; END IF;
  IF NEW.vehicle_id  IS DISTINCT FROM OLD.vehicle_id  THEN v_changed := v_changed || 'vehicle_id'::text;  END IF;
  IF NEW.job_card_id IS DISTINCT FROM OLD.job_card_id THEN v_changed := v_changed || 'job_card_id'::text; END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status
                  WHEN 'completed' THEN 'completed'
                  WHEN 'cancelled' THEN 'cancelled'
                  ELSE 'reopened'
                END;
  ELSIF cardinality(v_changed) = 0 THEN
    RETURN NULL;   -- nothing happened; nothing to record
  ELSIF v_changed = ARRAY['assigned_to']::text[] THEN
    v_action := 'assigned';
  ELSE
    v_action := 'updated';
  END IF;

  INSERT INTO public.shop_reminder_events
    (shop_id, reminder_id, action, from_status, to_status, changed_fields, assigned_to, actor_id)
  VALUES
    (NEW.shop_id, NEW.id, v_action, OLD.status, NEW.status, v_changed,
     CASE WHEN 'assigned_to' = ANY(v_changed) THEN NEW.assigned_to END, auth.uid());
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS shop_reminders_record_event ON public.shop_reminders;
CREATE TRIGGER shop_reminders_record_event
  AFTER INSERT OR UPDATE ON public.shop_reminders
  FOR EACH ROW EXECUTE FUNCTION public.shop_reminders_record_event();

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — row level security, grants, feature flag
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.shop_reminders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_reminder_events ENABLE ROW LEVEL SECURITY;

-- Member of the shop, AND (manager, creator or assignee), AND the flag is on
-- for this user in this shop. A member of another shop matches nothing, so
-- cannot read, count or infer a reminder; with the flag off nobody matches
-- anything, and the rows are kept untouched until it is turned back on.
DROP POLICY IF EXISTS shop_reminders_select ON public.shop_reminders;
CREATE POLICY shop_reminders_select ON public.shop_reminders
  FOR SELECT TO authenticated
  USING (
    shop_id IN (SELECT su.shop_id FROM public.shop_users su WHERE su.user_id = auth.uid())
    AND (created_by = auth.uid()
         OR assigned_to = auth.uid()
         OR public.reminders_can_manage_shop(shop_id))
    AND public.internal_reminders_enabled(shop_id)
  );

-- Anyone in the shop may create one, in their own name, as open. Assigning it
-- to somebody else needs a manager (and the plan check in the guard).
DROP POLICY IF EXISTS shop_reminders_insert ON public.shop_reminders;
CREATE POLICY shop_reminders_insert ON public.shop_reminders
  FOR INSERT TO authenticated
  WITH CHECK (
    shop_id IN (SELECT su.shop_id FROM public.shop_users su WHERE su.user_id = auth.uid())
    AND created_by = auth.uid()
    AND status = 'open'
    AND (assigned_to IS NULL
         OR assigned_to = auth.uid()
         OR public.reminders_can_manage_shop(shop_id))
    AND public.internal_reminders_enabled(shop_id)
  );

-- Edit, complete, reopen, cancel: whoever can see it. USING decides which rows
-- an update may touch; WITH CHECK decides what they may become. Both carry the
-- flag, so with it off an update matches no row at all.
DROP POLICY IF EXISTS shop_reminders_update ON public.shop_reminders;
CREATE POLICY shop_reminders_update ON public.shop_reminders
  FOR UPDATE TO authenticated
  USING (
    shop_id IN (SELECT su.shop_id FROM public.shop_users su WHERE su.user_id = auth.uid())
    AND (created_by = auth.uid()
         OR assigned_to = auth.uid()
         OR public.reminders_can_manage_shop(shop_id))
    AND public.internal_reminders_enabled(shop_id)
  )
  WITH CHECK (
    shop_id IN (SELECT su.shop_id FROM public.shop_users su WHERE su.user_id = auth.uid())
    AND (created_by = auth.uid()
         OR assigned_to = auth.uid()
         OR public.reminders_can_manage_shop(shop_id))
    AND public.internal_reminders_enabled(shop_id)
  );

-- No DELETE policy. A reminder is completed or cancelled; both keep the row.

-- History is visible exactly where its reminder is: the subquery runs under
-- the caller's own RLS on shop_reminders.
DROP POLICY IF EXISTS shop_reminder_events_select ON public.shop_reminder_events;
CREATE POLICY shop_reminder_events_select ON public.shop_reminder_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shop_reminders r
                 WHERE r.id = shop_reminder_events.reminder_id));

-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated. Revoke explicitly, then grant only what is used.
REVOKE ALL ON public.shop_reminders       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.shop_reminder_events FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.shop_reminders       TO authenticated;
GRANT SELECT                 ON public.shop_reminder_events TO authenticated;
GRANT ALL ON public.shop_reminders       TO service_role;
GRANT ALL ON public.shop_reminder_events TO service_role;

-- Trigger functions run as their owner whatever the caller's privileges, and
-- Postgres refuses to call them directly anyway; revoking EXECUTE removes them
-- from the Data API's reach entirely rather than relying on that.
REVOKE ALL ON FUNCTION public.shop_reminders_guard()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shop_reminders_record_event() FROM PUBLIC, anon, authenticated;

-- The feature flag, DISABLED. Same pattern as 2026-09-26_intent_intake_flag.sql:
-- Settings → Feature Flags lists existing rows but cannot create one.
INSERT INTO public.feature_flags (flag_key, enabled, description)
VALUES
  ('internal_reminders', false, 'Internal shop reminders: create, assign and complete to-dos linked to customers, vehicles and job cards. Sends nothing.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Checks — read-only, run after COMMIT
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Check section 1 ─────────────────────────────────────────────────────────
SELECT 'tables (expect 2)' AS check_name, count(*)::text AS result
  FROM pg_tables WHERE schemaname = 'public'
   AND tablename IN ('shop_reminders', 'shop_reminder_events');

-- ── Check section 2 ─────────────────────────────────────────────────────────
SELECT 'functions (expect 3)' AS check_name, count(*)::text AS result
  FROM pg_proc WHERE proname IN ('reminders_can_manage_shop', 'reminder_plan_tier', 'internal_reminders_enabled')
UNION ALL
SELECT 'anon can call none of them (expect false)',
       (has_function_privilege('anon', 'public.reminders_can_manage_shop(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reminder_plan_tier(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.internal_reminders_enabled(uuid)', 'EXECUTE'))::text;

-- ── Check section 3 ─────────────────────────────────────────────────────────
SELECT 'guard trigger (expect 1)' AS check_name, count(*)::text AS result
  FROM pg_trigger WHERE tgname = 'shop_reminders_guard' AND NOT tgisinternal;

-- ── Check section 4 ─────────────────────────────────────────────────────────
SELECT 'history trigger (expect 1)' AS check_name, count(*)::text AS result
  FROM pg_trigger WHERE tgname = 'shop_reminders_record_event' AND NOT tgisinternal;

-- ── Check section 5 ─────────────────────────────────────────────────────────
SELECT 'policies (expect 4)' AS check_name, count(*)::text AS result
  FROM pg_policies WHERE schemaname = 'public'
   AND tablename IN ('shop_reminders', 'shop_reminder_events')
UNION ALL
SELECT 'rls on', string_agg(c.relname || '=' || c.relrowsecurity::text, ', ' ORDER BY c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('shop_reminders', 'shop_reminder_events')
UNION ALL
SELECT 'anon can read reminders (expect false)',
       has_table_privilege('anon', 'public.shop_reminders', 'SELECT')::text
UNION ALL
SELECT 'nobody deletes a reminder (expect false)',
       has_table_privilege('authenticated', 'public.shop_reminders', 'DELETE')::text
UNION ALL
SELECT 'history is read-only (expect false)',
       has_table_privilege('authenticated', 'public.shop_reminder_events', 'INSERT')::text
UNION ALL
SELECT 'update policy has USING and WITH CHECK (expect true)',
       (SELECT qual IS NOT NULL AND with_check IS NOT NULL FROM pg_policies
         WHERE tablename = 'shop_reminders' AND policyname = 'shop_reminders_update')::text
UNION ALL
SELECT 'every reminder policy checks the flag (expect 3)',
       (SELECT count(*) FROM pg_policies WHERE tablename = 'shop_reminders'
         AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%internal_reminders_enabled%')::text
UNION ALL
SELECT 'API roles can call a trigger function (expect false)',
       (has_function_privilege('authenticated', 'public.shop_reminders_guard()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.shop_reminders_record_event()', 'EXECUTE'))::text
UNION ALL
SELECT 'flag seeded disabled (expect false)',
       COALESCE((SELECT bool_or(enabled) FROM public.feature_flags
                 WHERE flag_key = 'internal_reminders'), true)::text;

-- ── Before enabling for any shop (read-only; run it, change nothing) ────────
--
-- Reminder limits follow the owner's plan with no per-shop exception. Confirm
-- each shop you intend to enable is on the plan you expect — a NULL or 'free'
-- plan here means Free Forever limits (3 open, self-assignment only):
--
--   SELECT su.shop_id, p.plan, p.trial_ends_at, public.reminder_plan_tier(su.shop_id) AS tier
--   FROM public.shop_users su JOIN public.profiles p ON p.id = su.user_id
--   WHERE su.role = 'owner' AND su.shop_id IN ('<shop id>', '<shop id>');

-- ── Rollback (only if this feature is withdrawn, and only after review) ─────
--
-- Turning the feature off needs no SQL: leave the flag disabled. Removing it
-- entirely is destructive to any reminders written, so it is not scripted
-- here — it needs explicit approval and an export first. The objects this
-- migration adds are exactly:
--
--   tables     shop_reminder_events, shop_reminders
--   triggers   shop_reminders_record_event, shop_reminders_guard
--   functions  shop_reminders_record_event(), shop_reminders_guard(),
--              reminder_plan_tier(uuid), reminders_can_manage_shop(uuid),
--              internal_reminders_enabled(uuid)
--   flag row   feature_flags where flag_key = 'internal_reminders'
