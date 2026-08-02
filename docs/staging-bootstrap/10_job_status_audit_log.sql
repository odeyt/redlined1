-- Job-status transition audit trail — additive only, NOT yet executed
-- against production (drafted alongside app/api/job-status hardening; see
-- docs/JOB_STATUS_SECURITY_AUDIT.md). Run in Supabase SQL Editor when ready
-- to deploy the hardened /api/job-status route.
--
-- Why a new table instead of the existing public.audit_logs: that table's
-- schema (id, action, "user" text, entity, time, created_at) has no
-- shop_id, no structured old/new-value columns, and "user" is free text,
-- not a uuid FK — it cannot represent "who changed what job from which
-- stage to which stage, in which shop, for which request" without a
-- reshape. This table is purpose-built for that instead.
--
-- Never stores VIN, customer name, or any other PII — only opaque IDs and
-- stage strings, per this task's Requirement 4.
CREATE TABLE IF NOT EXISTS public.job_status_transitions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     text        NOT NULL REFERENCES public.job_cards(id) ON DELETE CASCADE,
  shop_id    uuid        NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL,
  from_stage text        NOT NULL,
  to_stage   text        NOT NULL,
  request_id text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_status_transitions_request_id_key UNIQUE (request_id)
);

-- request_id is server-generated via crypto.randomUUID() per request
-- (app/api/job-status/route.ts), never client-supplied, so a genuine
-- collision is not expected — the UNIQUE constraint (and its implicit
-- index, used for the lookups below) is a data-integrity guarantee that
-- one HTTP request can never produce two audit rows, not a defense
-- against an adversarial client.
CREATE INDEX IF NOT EXISTS job_status_transitions_job_idx
  ON public.job_status_transitions (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_status_transitions_shop_idx
  ON public.job_status_transitions (shop_id, created_at DESC);

ALTER TABLE public.job_status_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_status_transitions FORCE ROW LEVEL SECURITY;

-- Read: shop members can see their own shop's transition history. Depends
-- on public.my_shop_ids() — confirm (via docs/MOBILE_RLS_AUDIT.sql) that
-- function's search_path and EXECUTE grants are already hardened per
-- docs/PRODUCTION_SECURITY_REMEDIATION.sql before relying on this policy.
CREATE POLICY "job_status_transitions_shop_read" ON public.job_status_transitions
  FOR SELECT
  TO authenticated
  USING (shop_id = ANY (public.my_shop_ids()));

-- No INSERT/UPDATE/DELETE policy is created for `authenticated` or `anon`,
-- and no GRANT is issued to either role in this script. Combined with
-- FORCE ROW LEVEL SECURITY, this makes the table effectively append-only
-- and only reachable for writes via the service-role client (which
-- bypasses RLS) — i.e. only app/api/job-status itself can write a row,
-- exactly mirroring how job_cards writes already work today. Do not add a
-- broader grant here; if a legitimate client-side write path is ever
-- needed, it must go through a reviewed API route, not a direct table
-- grant (see docs/LIVE_RLS_VERIFICATION.md for why blanket anon/authenticated
-- GRANTs on this schema have already caused a confirmed production
-- exposure once).
