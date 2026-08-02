-- ============================================================================
-- Phase 4/5/7 — replace permissive USING (true) policies with shop-scoped
-- ones, for tables whose relevant column layout was directly confirmed by
-- reading actual application code (not guessed) in this session.
-- DRAFTED, NOT YET APPLIED.
--
-- Each DROP POLICY IF EXISTS / CREATE POLICY pair here is idempotent and
-- safe to re-run. No data is modified, no table is dropped, no column is
-- removed. Every new policy enforces both USING and WITH CHECK where the
-- command supports it, per this task's Phase 4 requirement.
-- ============================================================================

-- ── PROFILES ─────────────────────────────────────────────────────────────
-- profiles.shop_id was added by supabase/migration_multitenant.sql /
-- _v2.sql (`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shop_id
-- UUID REFERENCES public.shops(id)`) — nullable, since it was backfilled
-- onto a pre-existing table, not guaranteed populated for every row.
-- Replaces `profiles_read` (rls_phase7.sql: `to authenticated using
-- (true)`, i.e. every authenticated user could read every profile
-- platform-wide) with: a caller can always read their own profile, and can
-- read another profile only if that profile has a populated shop_id the
-- caller also belongs to. A profile with a null shop_id is visible only to
-- its own owner under this policy — stricter than before, by design; a
-- profile that was never assigned a shop has no basis for anyone else to
-- see it.
DROP POLICY IF EXISTS "profiles_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_shop_scoped_read" ON public.profiles;
CREATE POLICY "profiles_shop_scoped_read" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR (shop_id IS NOT NULL AND shop_id = ANY (public.my_shop_ids()))
  );

-- profiles_self_update and profiles_owner_manage are left as-is here
-- deliberately — profiles_self_update (`id = auth.uid()`) is already
-- correctly scoped to the caller's own row and needs no change.
-- profiles_owner_manage (`my_role() = 'Owner'`, the OLD platform-wide
-- Title-Case role) is a genuine gap (see docs/DATABASE_SECURITY_FINDINGS.md
-- — a Shop A owner could satisfy this check while it's evaluated for a
-- Shop B row) but rewriting it safely requires confirming, live, whether
-- any current data or code path still depends on the OLD profiles.role
-- values at all — out of this migration's scope; flagged in
-- docs/PRODUCTION_SECURITY_RELEASE_PLAN.md as a required follow-up, not
-- silently left unresolved.


-- ── TECHNICIANS ──────────────────────────────────────────────────────────
-- shop_id confirmed via services/technicianService.ts's
-- `.in('shop_id', getShopIds())` read pattern and its insert payload
-- (`shop_id: getShopId()`). Replaces `technicians_read` (`USING (true)`)
-- and `technicians_write` (old role system) with one shop-scoped `FOR ALL`
-- policy, matching the pattern already used for customers/vehicles/etc. in
-- supabase/migration_multitenant_fix.sql.
DROP POLICY IF EXISTS "technicians_read" ON public.technicians;
DROP POLICY IF EXISTS "technicians_write" ON public.technicians;
DROP POLICY IF EXISTS "technicians_shop_scoped" ON public.technicians;
CREATE POLICY "technicians_shop_scoped" ON public.technicians
  FOR ALL
  TO authenticated
  USING (shop_id = ANY (public.my_shop_ids()))
  WITH CHECK (shop_id = ANY (public.my_shop_ids()));


-- ── CAMPAIGNS ────────────────────────────────────────────────────────────
-- shop_id confirmed via services/campaignService.ts.
DROP POLICY IF EXISTS "campaigns_staff_all" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_shop_scoped" ON public.campaigns;
CREATE POLICY "campaigns_shop_scoped" ON public.campaigns
  FOR ALL
  TO authenticated
  USING (shop_id = ANY (public.my_shop_ids()))
  WITH CHECK (shop_id = ANY (public.my_shop_ids()));


-- ── ESTIMATE_FOLLOWUPS ───────────────────────────────────────────────────
-- shop_id confirmed via services/campaignService.ts's
-- `.from('estimate_followups')...in('shop_id', getShopIds())` /
-- `.eq('id', id).in('shop_id', getShopIds())` calls. This table was never
-- in any RLS-enable statement found in this repo at all — enabling RLS for
-- the first time here, not just replacing an existing policy.
ALTER TABLE public.estimate_followups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "estimate_followups_shop_scoped" ON public.estimate_followups;
CREATE POLICY "estimate_followups_shop_scoped" ON public.estimate_followups
  FOR ALL
  TO authenticated
  USING (shop_id = ANY (public.my_shop_ids()))
  WITH CHECK (shop_id = ANY (public.my_shop_ids()));

REVOKE ALL ON public.estimate_followups FROM anon;
