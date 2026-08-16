-- M1 — domain foundation: organizations tier + append-only audit trail.
--
-- RUN AGAINST redlined1. Reviewable, reversible, and additive only: no
-- existing table is altered except `shops`, which gains one nullable column.
-- Nothing in the application depends on that column yet.
--
-- BEFORE RUNNING: see the verification block at the foot of this file. The
-- SECURITY DEFINER function here must be executed in a rolled-back transaction
-- before it is trusted — a clean CREATE FUNCTION proves only that PL/pgSQL
-- parsed, which is how a trigger once blocked every invoice payment for three
-- days.

BEGIN;

-- ── 1. Organizations ────────────────────────────────────────────────────────
--
-- Redlined1 has had shops and no tier above them. Two locations are currently
-- expressed as peer shops that mirror each other (`shop_mirrors`), which works
-- for visibility but cannot answer "how many people does D1 Imports employ"
-- without double-counting a person who works at both.
--
-- The column is NULLABLE and back-filled. It stays nullable through M1
-- deliberately: making it NOT NULL would mean a shop created by a code path
-- that has not been updated yet fails to insert, and provisioning a new
-- customer is not something this milestone should be able to break.

CREATE TABLE IF NOT EXISTS public.organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS shops_organization_id_idx ON public.shops (organization_id);

-- Back-fill: one organization per existing shop, same name. That is the
-- truthful starting point — the database does not know which shops belong
-- together, and guessing (by owner, by name prefix) would silently merge two
-- unrelated businesses. Grouping D1's two shops under one organization is a
-- deliberate, reviewable UPDATE, shown in the notes at the foot of this file.
INSERT INTO public.organizations (name, slug)
SELECT s.name, s.slug
FROM public.shops s
WHERE s.organization_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.slug = s.slug);

UPDATE public.shops s
SET organization_id = o.id
FROM public.organizations o
WHERE s.organization_id IS NULL
  AND o.slug IS NOT DISTINCT FROM s.slug;

-- A shop whose slug was null or duplicated gets its own organization by name.
INSERT INTO public.organizations (name)
SELECT s.name FROM public.shops s WHERE s.organization_id IS NULL;

UPDATE public.shops s
SET organization_id = o.id
FROM public.organizations o
WHERE s.organization_id IS NULL AND o.name = s.name;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Readable only by people who are in one of the organization's shops.
DROP POLICY IF EXISTS organizations_select_members ON public.organizations;
CREATE POLICY organizations_select_members ON public.organizations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.shops s
    JOIN public.shop_users su ON su.shop_id = s.id
    WHERE s.organization_id = organizations.id
      AND su.user_id = auth.uid()
  ));

-- No INSERT/UPDATE/DELETE policy: organizations are created by provisioning,
-- which runs with the service role. An ordinary session cannot create or
-- rename one.

GRANT SELECT ON public.organizations TO authenticated;


-- ── 2. Audit events ─────────────────────────────────────────────────────────
--
-- The existing `audit_logs` table is left completely untouched. It is a stub
-- (`action, "user" text, entity, time text`) with zero rows and nothing
-- writing to it; repurposing it would mean either living with columns that
-- cannot express an actor, or rewriting a table while claiming to be additive.
-- It is deprecated by this migration and dropped in a later one, once a
-- release has confirmed nothing reads it.

CREATE TABLE IF NOT EXISTS public.audit_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES public.organizations(id),
  shop_id          UUID NOT NULL REFERENCES public.shops(id),
  actor_user_id    UUID,
  actor_type       TEXT NOT NULL DEFAULT 'user',
  actor_role       TEXT,
  action           TEXT NOT NULL,
  entity_type      TEXT NOT NULL,
  entity_id        TEXT NOT NULL,
  before_data      JSONB,
  after_data       JSONB,
  metadata         JSONB,
  request_id       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constrained text rather than an enum: adding a value to an enum in
  -- Postgres is a migration with locking implications, and this list will grow
  -- as API, MCP and AI callers arrive. A CHECK is cheaper to extend and just
  -- as strict.
  CONSTRAINT audit_events_actor_type_check
    CHECK (actor_type IN ('user', 'system', 'api', 'mcp', 'ai', 'webhook'))
);

-- The three questions this table gets asked: what happened to this record,
-- what did this person do, and what happened in this shop recently.
CREATE INDEX IF NOT EXISTS audit_events_entity_idx
  ON public.audit_events (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx
  ON public.audit_events (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_shop_time_idx
  ON public.audit_events (shop_id, created_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- ── 3. Immutability ─────────────────────────────────────────────────────────
--
-- Two locks, because either alone is insufficient. The GRANT stops the ordinary
-- path; the trigger stops anything that arrives with more privilege than
-- expected — including a future service-role script that means well. An audit
-- trail an administrator can quietly edit is not an audit trail.

REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_events FROM authenticated, anon, service_role;
GRANT SELECT ON public.audit_events TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_events_are_append_only()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (attempted %)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $fn$;

DROP TRIGGER IF EXISTS audit_events_no_update ON public.audit_events;
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_are_append_only();

-- No INSERT policy either. Rows arrive only through record_audit_event below,
-- so a client cannot write a row claiming to be somebody else — the whole
-- value of the table depends on that.

-- ── 4. The only way in ──────────────────────────────────────────────────────
--
-- SECURITY DEFINER, so it can insert where the caller cannot. Three things it
-- refuses to take the caller's word for:
--
--   actor_user_id    stamped from auth.uid(), never from an argument
--   shop membership  verified against shop_users before anything is written
--   organization_id  derived from the shop, not supplied
--
-- Without the membership check, any signed-in user could write audit rows into
-- another shop's history — which would make the log worse than useless, since
-- it would be both incomplete and forgeable.

CREATE OR REPLACE FUNCTION public.record_audit_event(
  p_shop_id      UUID,
  p_actor_type   TEXT,
  p_actor_role   TEXT,
  p_action       TEXT,
  p_entity_type  TEXT,
  p_entity_id    TEXT,
  p_before       JSONB DEFAULT NULL,
  p_after        JSONB DEFAULT NULL,
  p_metadata     JSONB DEFAULT NULL,
  p_request_id   TEXT  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_actor  UUID := auth.uid();
  v_org    UUID;
  v_id     UUID;
BEGIN
  IF p_shop_id IS NULL OR p_action IS NULL OR p_entity_type IS NULL OR p_entity_id IS NULL THEN
    RAISE EXCEPTION 'record_audit_event requires shop, action, entity type and entity id';
  END IF;

  -- A session must be writing about a shop it belongs to. auth.uid() is NULL
  -- for the service role, which is how trusted server-side callers (webhooks,
  -- jobs, back-fills) are allowed through — they have already been authorized
  -- by the route that reached them.
  IF v_actor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shop_users su
    WHERE su.user_id = v_actor AND su.shop_id = p_shop_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this shop'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT s.organization_id INTO v_org FROM public.shops s WHERE s.id = p_shop_id;

  INSERT INTO public.audit_events (
    organization_id, shop_id, actor_user_id, actor_type, actor_role,
    action, entity_type, entity_id, before_data, after_data, metadata, request_id
  ) VALUES (
    v_org, p_shop_id, v_actor,
    COALESCE(NULLIF(p_actor_type, ''), 'user'), p_actor_role,
    p_action, p_entity_type, p_entity_id, p_before, p_after, p_metadata, p_request_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $fn$;

-- Postgres grants EXECUTE to PUBLIC by default, which would let an anonymous
-- caller write audit rows for any shop. Revoke first, then grant narrowly.
REVOKE ALL ON FUNCTION public.record_audit_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_audit_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT) TO authenticated, service_role;

-- ── 5. Reading the log ──────────────────────────────────────────────────────
--
-- Owners and managers only. An audit trail contains before/after snapshots of
-- financial records; a technician has no reason to read the history of every
-- payment in the shop, and once payroll arrives this policy is the seam that
-- keeps salary changes out of general view.

DROP POLICY IF EXISTS audit_events_select_managers ON public.audit_events;
CREATE POLICY audit_events_select_managers ON public.audit_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.shop_users su
    WHERE su.user_id = auth.uid()
      AND su.shop_id = audit_events.shop_id
      AND su.role IN ('owner', 'manager')
  ));

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
--
-- 1. Prove the function BODY runs, and leave nothing behind. PL/pgSQL is not
--    type-checked at CREATE time, so "Success. No rows returned" above means
--    it parsed and nothing more.
--
--   BEGIN;
--   SELECT public.record_audit_event(
--     (SELECT id FROM public.shops LIMIT 1),
--     'system', 'owner', 'test.ran', 'test', 'T-1',
--     '{"a":1}'::jsonb, '{"a":2}'::jsonb, NULL, NULL);
--   SELECT action, entity_id, actor_type, organization_id IS NOT NULL AS org_set
--     FROM public.audit_events WHERE entity_type = 'test';
--   ROLLBACK;
--
--   Expect one row, org_set = true.
--
-- 2. Prove it is append-only (both must FAIL):
--
--   BEGIN;
--   SELECT public.record_audit_event((SELECT id FROM public.shops LIMIT 1),
--     'system', NULL, 'test.ran', 'test', 'T-2', NULL, NULL, NULL, NULL);
--   UPDATE public.audit_events SET action = 'tampered' WHERE entity_type = 'test';
--   ROLLBACK;
--
--   BEGIN;
--   DELETE FROM public.audit_events WHERE entity_type = 'test';
--   ROLLBACK;
--
-- 3. Every shop has an organization:
--
--   SELECT count(*) FROM public.shops WHERE organization_id IS NULL;   -- expect 0
--
-- ── Grouping D1's two shops (OPTIONAL, run only when you want it) ────────────
--
-- The back-fill gives every shop its own organization, which is the honest
-- default. To put both D1 locations under one:
--
--   UPDATE public.shops SET organization_id =
--     (SELECT organization_id FROM public.shops WHERE id = '<shop 1 id>')
--   WHERE id = '<shop 2 id>';
--
-- Nothing reads organization_id in M1, so this is safe to defer.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.record_audit_event(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB,JSONB,TEXT);
--   DROP TRIGGER IF EXISTS audit_events_no_update ON public.audit_events;
--   DROP FUNCTION IF EXISTS public.audit_events_are_append_only();
--   DROP TABLE IF EXISTS public.audit_events;
--   ALTER TABLE public.shops DROP COLUMN IF EXISTS organization_id;
--   DROP TABLE IF EXISTS public.organizations;
