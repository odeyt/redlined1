-- One shop per signup, even when two requests arrive together.
--
-- RUN AGAINST redlined1 BEFORE deploying the matching application change: the
-- code claims a row in this table, and cannot claim a row in a table that does
-- not exist.
--
-- ## The bug
--
-- getOrCreatePrimaryShop reads a user's memberships, and creates a shop when
-- there are none. Two concurrent calls both read "none" and both create — a
-- textbook check-then-act race.
--
-- Observed, not theorised: an E2E run on 2026-08-17 produced FIVE shops named
-- "E2E Audit Shop" for one account, all created within one second, because
-- Playwright opened several pages at once and each raced to provision. The
-- same path is reachable by a real customer who opens two tabs during signup,
-- or reloads while the first request is in flight. They end up with two shops,
-- their work lands in whichever one the app happens to pick, and untangling it
-- afterwards means moving records between tenants by hand.
--
-- ## Why a table rather than a constraint
--
-- The obvious fix — a unique index on shop_users(user_id) WHERE role='owner' —
-- is wrong. Owning more than one shop is legitimate and already true here: D1
-- Imports has two locations under one owner. The thing that must happen at
-- most once is not "own a shop", it is "be provisioned an initial shop".
--
-- So the claim is its own fact, with the user as the primary key. The first
-- caller to insert wins; every other caller gets a conflict, waits, and reads
-- back the shop the winner made. No advisory locks, no polling the shops
-- table, and the mutual exclusion is a primary key rather than something
-- clever.

BEGIN;

CREATE TABLE IF NOT EXISTS public.shop_provisioning_claims (
  user_id     UUID PRIMARY KEY,
  /**
   * Filled in once the shop exists. NULL means "a claim is in flight" — a
   * caller that sees NULL knows to wait rather than to create.
   */
  shop_id     UUID REFERENCES public.shops(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service role only. Provisioning runs with the admin client; nothing a
-- signed-in user does should touch this table directly, and an RLS-enabled
-- table with no policies denies everyone by default.
ALTER TABLE public.shop_provisioning_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_provisioning_claims FROM authenticated, anon;

-- Back-fill, so existing accounts are not treated as unprovisioned. Their
-- oldest membership is the shop they were given at signup.
INSERT INTO public.shop_provisioning_claims (user_id, shop_id, created_at)
SELECT DISTINCT ON (su.user_id) su.user_id, su.shop_id, su.created_at
FROM public.shop_users su
ORDER BY su.user_id, su.created_at
ON CONFLICT (user_id) DO NOTHING;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
--
-- 1. Every existing member has a claim, so nobody is re-provisioned:
--
--   SELECT
--     (SELECT count(DISTINCT user_id) FROM public.shop_users)              AS members,
--     (SELECT count(*) FROM public.shop_provisioning_claims)               AS claims,
--     (SELECT count(*) FROM public.shop_provisioning_claims WHERE shop_id IS NULL) AS in_flight;
--
--   members and claims should match; in_flight should be 0.
--
-- 2. The key really is the user, so a second claim cannot be inserted:
--
--   BEGIN;
--   INSERT INTO public.shop_provisioning_claims (user_id, shop_id)
--   SELECT user_id, shop_id FROM public.shop_provisioning_claims LIMIT 1;
--   ROLLBACK;
--
--   MUST fail with a duplicate key violation. That failure is the entire
--   mechanism — if it succeeds, concurrent signups can still double-provision.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.shop_provisioning_claims;
--
--   Safe: the application treats a missing claim as "not yet provisioned" and
--   falls back to the membership check it used before, which is the current
--   behaviour including its race.
