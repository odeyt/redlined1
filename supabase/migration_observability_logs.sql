-- ─────────────────────────────────────────────────────────────────────────────
-- Redlined1 — Observability Logs Migration
-- Safe to run: all statements use IF NOT EXISTS / OR REPLACE
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. observability_logs table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.observability_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      uuid,
  user_id      uuid,
  environment  text        NOT NULL DEFAULT 'production',
  level        text        NOT NULL DEFAULT 'info',   -- 'debug'|'info'|'warn'|'error'
  event_type   text        NOT NULL,                  -- 'api_error'|'ui_crash'|'flag_toggle'|etc.
  message      text        NOT NULL,
  route        text,
  method       text,
  status_code  integer,
  duration_ms  integer,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS obs_logs_shop_idx      ON public.observability_logs (shop_id)     WHERE shop_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS obs_logs_user_idx      ON public.observability_logs (user_id)     WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS obs_logs_level_idx     ON public.observability_logs (level);
CREATE INDEX IF NOT EXISTS obs_logs_event_idx     ON public.observability_logs (event_type);
CREATE INDEX IF NOT EXISTS obs_logs_env_idx       ON public.observability_logs (environment);
CREATE INDEX IF NOT EXISTS obs_logs_created_idx   ON public.observability_logs (created_at DESC);

-- ── 3. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.observability_logs ENABLE ROW LEVEL SECURITY;

-- Owner and manager can read their shop's logs
DROP POLICY IF EXISTS "obs_logs_shop_read" ON public.observability_logs;
CREATE POLICY "obs_logs_shop_read"
  ON public.observability_logs FOR SELECT
  USING (
    shop_id IS NOT NULL
    AND shop_id = ANY (public.my_shop_ids())
  );

-- Service role inserts logs (API routes use service key)
DROP POLICY IF EXISTS "obs_logs_service_write" ON public.observability_logs;
CREATE POLICY "obs_logs_service_write"
  ON public.observability_logs FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ── 4. Auto-prune: keep only 90 days of logs ─────────────────────────────────
-- Run manually or via pg_cron if needed:
-- DELETE FROM public.observability_logs WHERE created_at < now() - interval '90 days';
