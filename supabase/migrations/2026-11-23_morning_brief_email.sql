-- Morning-brief email — a once-per-shop-per-day send ledger, plus the one
-- place a shop's timezone can be stored.
--
-- Every morning at 05:00 shop-local time, shops with Redline AI access
-- (the redline_ai flag OR a Professional/Business/Enterprise plan — see
-- lib/redline-ai/access.ts) are emailed the deterministic morning brief
-- from lib/redline-ai. One scheduled job (.github/workflows/morning-brief.yml)
-- runs hourly and decides per shop, in the shop's own timezone, whether
-- that shop's 05:00 brief is due.
--
-- ## Once per shop per local day
--
-- morning_brief_sends has one row per (shop, local_date). Claiming a send
-- is an INSERT against that unique key, so two overlapping runs cannot
-- both win: the loser gets the unique violation and skips. A row whose
-- status is 'failed' (Resend definitely rejected it — a 4xx) may be
-- re-claimed by a later run inside the same 05:00 hour; 'sent', 'claimed'
-- and 'uncertain' rows are never re-sent. A brief is never sent late: the
-- job only sends while the shop's local time is inside the 05:00 hour.
--
-- Retries of a send that MIGHT have gone out ('uncertain' — network error,
-- 5xx) are not attempted at all: the next run sees the row and skips, and
-- the row stays visible for a person to check in Resend's logs. That is
-- stricter than trial-tips on purpose — a duplicate "your morning brief"
-- in an owner's inbox every day would kill the feature's credibility, and
-- the brief is regenerated fresh tomorrow anyway.
--
-- ## The timezone column
--
-- Shops carry no timezone today (shops has no country/timezone columns;
-- location lives only in shop_settings.address, free text). This adds a
-- nullable IANA timezone to shop_settings so a shop can be given an exact
-- zone; the job's resolution order is stored timezone → state parsed from
-- shop_settings.address → America/New_York (lib/morningBrief/timezone.ts).
-- Nothing writes the column yet — it exists so the stored value, when a
-- settings UI or an operator sets one, wins over the address heuristic.
--
-- ## Access
--
-- RLS is on and there are NO policies: only the service role (the
-- scheduled job) reads or writes morning_brief_sends, matching
-- trial_tip_sends. shop_settings keeps its existing policies; this file
-- only adds the column.
--
-- ## One transaction; re-running
--
-- Everything is created inside one BEGIN … COMMIT, so a failure leaves
-- nothing behind. Re-running this exact file is harmless; changing it
-- later is not supported — use a new migration.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stored timezone (additive; nullable; nothing is backfilled)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS timezone TEXT;

COMMENT ON COLUMN public.shop_settings.timezone IS
  'IANA timezone for the shop (e.g. America/Chicago). Used by the Redline AI morning-brief job; NULL means derive from the address state, then default America/New_York.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Send ledger — one row per shop per local day
-- ═══════════════════════════════════════════════════════════════════════════
-- status
--   claimed    reserved by a run; the provider may or may not have been
--              contacted yet (a crashed run leaves this — never re-sent)
--   sent       Resend accepted it (final)
--   failed     Resend definitely rejected it (a 4xx): nothing was sent;
--              may be re-claimed inside the same 05:00 local hour
--   uncertain  the outcome is unknown (network error, 5xx): it may have
--              been sent — never retried automatically
CREATE TABLE IF NOT EXISTS public.morning_brief_sends (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  -- The shop's local calendar date the brief was for (in `timezone`).
  local_date      DATE NOT NULL,
  -- The IANA timezone the local date was computed in, recorded so a later
  -- timezone change never rewrites what a past brief meant.
  timezone        TEXT NOT NULL,
  status          TEXT NOT NULL,
  resend_email_id TEXT,
  last_error      TEXT,
  claimed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT morning_brief_sends_shop_day_unique UNIQUE (shop_id, local_date),
  CONSTRAINT morning_brief_sends_status_check
    CHECK (status IN ('claimed', 'sent', 'failed', 'uncertain')),
  CONSTRAINT morning_brief_sends_error_length
    CHECK (last_error IS NULL OR char_length(last_error) <= 500)
);

-- Webhooks or a person investigating a delivery map back by provider id.
CREATE INDEX IF NOT EXISTS morning_brief_sends_email_id_idx
  ON public.morning_brief_sends (resend_email_id) WHERE resend_email_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Access — service role only, exactly like trial_tip_sends
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.morning_brief_sends ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.morning_brief_sends FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.morning_brief_sends TO service_role;

COMMIT;

-- Post-COMMIT checks (read-only; run manually after applying):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'shop_settings' AND column_name = 'timezone';
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'morning_brief_sends';
