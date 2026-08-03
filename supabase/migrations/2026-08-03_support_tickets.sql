-- In-app support: customer↔operator threads and bug reports.
--
-- One table pair serves both the "Message Support" chat and the "Report a Bug"
-- form, because they are the same object with a different label: a thread with
-- messages on it. Splitting them would duplicate the RLS, the read model and
-- the operator's inbox for no gain.
--
-- The AI assistant does NOT write here. It answers immediately and stores
-- nothing unless the customer escalates, at which point the transcript is
-- posted as the opening message of a real thread.
--
-- ── Tenant isolation ───────────────────────────────────────────────────────
--
-- Every policy is scoped through shop_users, matching the pattern established
-- on 31 July. A shop sees only its own threads. Note support staff read these
-- with service_role from server routes, which bypasses RLS by design — there is
-- deliberately no "platform owner" policy here, because that would mean
-- encoding an operator identity into customer-facing RLS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'chat',      -- 'chat' | 'bug'
  subject      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open',      -- 'open' | 'answered' | 'closed'
  severity     TEXT,                              -- bug reports only
  -- Page, plan, browser, app version. Captured automatically: a bug report
  -- without it is a guess, and asking a shop owner for their browser version
  -- is how a report never gets filed.
  context      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  -- Denormalised so a message can be RLS-scoped without joining its ticket.
  shop_id      UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  author_id    UUID,                              -- null for 'support' and 'ai'
  author_role  TEXT NOT NULL,                     -- 'customer' | 'support' | 'ai'
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_shop_idx    ON public.support_tickets(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON public.support_messages(ticket_id, created_at);

ALTER TABLE public.support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- RLS is inert unless relrowsecurity is true — an appointments table with
-- policies and RLS switched off was found unprotected on 2 August. Asserted
-- rather than assumed:
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.support_tickets'::regclass)
  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.support_messages'::regclass) THEN
    RAISE EXCEPTION 'RLS did not enable on the support tables';
  END IF;
END $$;

-- ── Policies ───────────────────────────────────────────────────────────────
-- Permissive policies are OR'd together, so each one must be independently
-- safe: a single loose policy defeats every strict one on the table.

DROP POLICY IF EXISTS support_tickets_select ON public.support_tickets;
CREATE POLICY support_tickets_select ON public.support_tickets
  FOR SELECT TO authenticated
  USING (shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS support_tickets_insert ON public.support_tickets;
CREATE POLICY support_tickets_insert ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid())
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS support_messages_select ON public.support_messages;
CREATE POLICY support_messages_select ON public.support_messages
  FOR SELECT TO authenticated
  USING (shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid()));

-- Customers may only post AS a customer. Without the author_role check a
-- customer could insert a message attributed to 'support' and manufacture an
-- official-looking reply in their own thread.
DROP POLICY IF EXISTS support_messages_insert ON public.support_messages;
CREATE POLICY support_messages_insert ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    shop_id IN (SELECT shop_id FROM public.shop_users WHERE user_id = auth.uid())
    AND author_id = auth.uid()
    AND author_role = 'customer'
  );

-- Deliberately no UPDATE or DELETE policy for either table. A support thread is
-- a record of what was said; editing history is not a customer capability.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_messages TO service_role;
GRANT SELECT, INSERT ON public.support_tickets  TO authenticated;
GRANT SELECT, INSERT ON public.support_messages TO authenticated;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
--
-- Policies present and RLS live:
--
--   SELECT c.relname, c.relrowsecurity, count(p.polname) AS policies
--   FROM pg_class c
--   LEFT JOIN pg_policy p ON p.polrelid = c.oid
--   WHERE c.relname IN ('support_tickets','support_messages')
--   GROUP BY c.relname, c.relrowsecurity;
--
-- Expect relrowsecurity = true and 2 policies each.
--
-- anon must have nothing:
--
--   SELECT grantee, table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_name IN ('support_tickets','support_messages')
--     AND grantee = 'anon';
--
-- Expect zero rows.
