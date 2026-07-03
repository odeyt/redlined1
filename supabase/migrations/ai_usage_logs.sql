-- AI Usage Logs
-- Tracks every AI API call per shop for cost monitoring and rate limiting.
-- Run this in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL,
  user_id         uuid NOT NULL,
  feature         text NOT NULL,
  model           text,
  input_tokens    integer DEFAULT 0,
  output_tokens   integer DEFAULT 0,
  estimated_cost  numeric(10, 6) DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- Indexes for usage queries and billing aggregation
CREATE INDEX IF NOT EXISTS ai_usage_logs_shop_id_idx    ON public.ai_usage_logs (shop_id);
CREATE INDEX IF NOT EXISTS ai_usage_logs_user_id_idx    ON public.ai_usage_logs (user_id);
CREATE INDEX IF NOT EXISTS ai_usage_logs_feature_idx    ON public.ai_usage_logs (feature);
CREATE INDEX IF NOT EXISTS ai_usage_logs_created_at_idx ON public.ai_usage_logs (created_at DESC);

-- RLS: shop-scoped (same pattern as all other tables)
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_logs_shop_select" ON public.ai_usage_logs;
CREATE POLICY "ai_usage_logs_shop_select"
  ON public.ai_usage_logs FOR SELECT
  USING (shop_id = ANY(public.my_shop_ids()));

DROP POLICY IF EXISTS "ai_usage_logs_shop_insert" ON public.ai_usage_logs;
CREATE POLICY "ai_usage_logs_shop_insert"
  ON public.ai_usage_logs FOR INSERT
  WITH CHECK (shop_id = ANY(public.my_shop_ids()));

-- Helper view: daily cost per shop
CREATE OR REPLACE VIEW public.ai_usage_daily AS
SELECT
  shop_id,
  feature,
  DATE(created_at) AS day,
  COUNT(*)           AS requests,
  SUM(input_tokens)  AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(estimated_cost)::numeric(10,4) AS total_cost_usd
FROM public.ai_usage_logs
GROUP BY shop_id, feature, DATE(created_at);
