-- ============================================================================
-- Phase 4/7 — RLS helper functions
-- DRAFTED, NOT YET APPLIED. Requires a staging pass (Phase 8) and explicit
-- production approval (Phase 15) before running anywhere but a throwaway
-- test project. See docs/DATABASE_SECURITY_FINDINGS.md for the findings
-- this remediates and docs/PRODUCTION_SECURITY_RELEASE_PLAN.md for the
-- exact application order.
--
-- Builds on, and does not duplicate, public.my_shop_ids() — the existing
-- SECURITY DEFINER helper (SELECT ARRAY(SELECT shop_id FROM shop_users
-- WHERE user_id = auth.uid())) already used throughout
-- supabase/migration_multitenant_fix.sql. Its own search_path pin and
-- EXECUTE-grant restriction are handled by docs/PRODUCTION_SECURITY_REMEDIATION.sql
-- (already drafted, separately) — this migration does not re-touch that
-- function, only adds new ones alongside it.
--
-- DECISION — no current_user_is_platform_admin() helper: platform-admin
-- access in this codebase (lib/adminAuth.ts) is authorized entirely at the
-- API-route layer via the PLATFORM_OWNER_EMAIL environment variable,
-- checked against the caller's verified auth.uid()/email server-side — it
-- is NOT backed by any database table or role, and every admin-only route
-- already reads via the service-role client (bypasses RLS entirely). A SQL
-- helper mirroring this would have to either hardcode the email allowlist
-- into a migration (a second, driftable copy of PLATFORM_OWNER_EMAIL) or
-- read a Vercel env var from inside Postgres, which isn't possible. Adding
-- this helper would create a security-relevant config that's out of sync
-- with its own source of truth by construction — deliberately not created.
-- Platform-admin authorization stays exactly where it already correctly
-- lives.
-- ============================================================================

-- ── current_user_is_shop_member(shop_id) ────────────────────────────────────
-- True iff the caller (auth.uid()) has ANY shop_users row for this shop,
-- regardless of role. SECURITY INVOKER (the default) is sufficient here —
-- it only ever needs to see rows shop_users' own RLS policy already lets
-- the caller see (their own membership rows), so no privilege escalation
-- is needed, unlike my_shop_ids() (which needs to look up ALL of a user's
-- shop_ids in one array before any single shop-scoped policy can use it,
-- which is genuinely awkward without SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.current_user_is_shop_member(target_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_users
    WHERE shop_users.shop_id = target_shop_id
      AND shop_users.user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_is_shop_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_shop_member(uuid) TO authenticated, service_role;


-- ── current_user_has_shop_role(shop_id, allowed_roles[]) ───────────────────
-- True iff the caller is a member of this shop AND their role is one of
-- allowed_roles. allowed_roles is supplied by the POLICY DEFINITION, never
-- by the querying client — a policy like
--   USING (current_user_has_shop_role(shop_id, ARRAY['owner','manager']))
-- has the allowed-roles list baked into the policy body itself, not passed
-- in from a request. This function never trusts anything about the
-- caller's identity except auth.uid(); target_shop_id is only ever a
-- lookup key, exactly like every other shop-scoped check in this schema.
CREATE OR REPLACE FUNCTION public.current_user_has_shop_role(target_shop_id uuid, allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_users
    WHERE shop_users.shop_id = target_shop_id
      AND shop_users.user_id = auth.uid()
      AND shop_users.role = ANY (allowed_roles)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_has_shop_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_has_shop_role(uuid, text[]) TO authenticated, service_role;


-- ── current_user_can_read_financials(shop_id) ───────────────────────────────
-- This task's Phase 5 requirement, named explicitly: technician denied from
-- payments/subscription data; owner/manager/service-advisor access only
-- where product rules permit. 'advisor' is this schema's service-advisor
-- role (see lib/serverAuth.ts ShopRole) — 'technician' is deliberately
-- excluded from this list.
CREATE OR REPLACE FUNCTION public.current_user_can_read_financials(target_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.current_user_has_shop_role(target_shop_id, ARRAY['owner', 'manager', 'advisor']);
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_can_read_financials(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_can_read_financials(uuid) TO authenticated, service_role;


-- ── current_user_can_manage_staff(shop_id) ──────────────────────────────────
-- This task's Phase 5 requirement: technician cannot add/remove members.
-- Deliberately owner/manager only, not advisor — staff management is more
-- sensitive than financial visibility in this product's existing role
-- model (app/api/invite and app/api/members already restrict role-changing
-- actions similarly via requireShopRole's allowedRoles argument at the API
-- layer; this mirrors that boundary at the RLS layer for defense in depth,
-- it does not replace it — membership mutations should still go through
-- those reviewed API routes, not direct table writes, per Phase 5's own
-- SHOP_USERS requirement).
CREATE OR REPLACE FUNCTION public.current_user_can_manage_staff(target_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.current_user_has_shop_role(target_shop_id, ARRAY['owner', 'manager']);
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_can_manage_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_can_manage_staff(uuid) TO authenticated, service_role;
