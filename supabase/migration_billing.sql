-- ─────────────────────────────────────────────────────────────────────────────
-- Redlined1 — Billing & Subscription Migration
-- Safe to run on production: all statements use IF NOT EXISTS / IF EXISTS
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add billing columns to profiles ───────────────────────────────────────
-- Fixes schema mismatch where seed SQL referenced columns not in schema.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan            text    DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS billing_status  text    DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS trial_ends_at   timestamptz;

-- ── 2. subscriptions table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Internal references
  user_id                   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id           uuid,

  -- Provider info (no FK — provider-agnostic)
  provider                  text        NOT NULL,                  -- 'creem' | 'stripe'
  provider_customer_id      text        NOT NULL,
  provider_subscription_id  text        NOT NULL UNIQUE,
  provider_price_id         text,

  -- Redlined1 plan (source of truth for feature gates)
  plan_id                   text        NOT NULL DEFAULT 'starter',
  billing_interval          text        NOT NULL DEFAULT 'monthly', -- 'monthly' | 'annual'

  -- Normalized status
  status                    text        NOT NULL DEFAULT 'unknown',
  -- CHECK (status IN ('trialing','active','past_due','canceled','unpaid','incomplete','expired','unknown'))

  -- Periods
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  trial_start               timestamptz,
  trial_end                 timestamptz,

  -- Cancellation
  cancel_at_period_end      boolean     NOT NULL DEFAULT false,
  canceled_at               timestamptz,

  -- Audit
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx
  ON public.subscriptions (user_id);

CREATE INDEX IF NOT EXISTS subscriptions_status_idx
  ON public.subscriptions (status);

CREATE INDEX IF NOT EXISTS subscriptions_provider_customer_idx
  ON public.subscriptions (provider_customer_id);

-- ── 3. payment_events table ───────────────────────────────────────────────────
-- Records every incoming webhook event for idempotency and audit.

CREATE TABLE IF NOT EXISTS public.payment_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text        NOT NULL,           -- 'creem' | 'stripe'
  provider_event_id text        NOT NULL,           -- provider's event ID (dedup key)
  event_type        text        NOT NULL,
  processed         boolean     NOT NULL DEFAULT false,
  payload           jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz
);

-- Unique index for idempotency: same event from same provider processed once only
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_event_uniq
  ON public.payment_events (provider, provider_event_id);

CREATE INDEX IF NOT EXISTS payment_events_processed_idx
  ON public.payment_events (processed);

-- ── 4. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
DROP POLICY IF EXISTS "subscriptions_read_own" ON public.subscriptions;
CREATE POLICY "subscriptions_read_own"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- Service role only can write subscriptions (webhooks use service role)
DROP POLICY IF EXISTS "subscriptions_service_write" ON public.subscriptions;
CREATE POLICY "subscriptions_service_write"
  ON public.subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- payment_events: service role only (webhooks, no user access)
DROP POLICY IF EXISTS "payment_events_service_only" ON public.payment_events;
CREATE POLICY "payment_events_service_only"
  ON public.payment_events FOR ALL
  USING (auth.role() = 'service_role');

-- ── 5. updated_at trigger for subscriptions ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_subscriptions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE PROCEDURE public.set_subscriptions_updated_at();
