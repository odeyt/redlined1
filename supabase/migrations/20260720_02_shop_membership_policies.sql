-- ============================================================================
-- Phase 4/5/7 — shops / shop_users core membership policies
-- DRAFTED, NOT YET APPLIED.
--
-- This migration deliberately does NOT redefine shops_member_view or
-- shop_users_own — those are already fully drafted, reviewed, and ready in
-- docs/PRODUCTION_SECURITY_REMEDIATION.sql (2026-07-18), which remains the
-- authoritative source for closing the CRITICAL, VERIFIED LIVE exposure on
-- these two tables. Run that script FIRST, then this one.
--
-- Why shop_users already satisfies this task's Phase 5 SHOP_USERS
-- requirements once the above is applied, without any new policy here:
--   grant-permissions.sql grants ONLY `select` on shop_users to
--   anon/authenticated — no insert/update/delete grant exists for either
--   role at all. A Postgres GRANT is a prerequisite for RLS to even be
--   consulted for a given command; with no INSERT/UPDATE/DELETE grant,
--   authenticated users cannot mutate shop_users through the client no
--   matter what RLS policy does or doesn't exist. This means, already,
--   structurally, from the grants alone:
--     - "Membership creation/removal must use protected server APIs" — yes,
--       only app/api/invite and app/api/members (service-role client,
--       requireShopRole()-gated) can write this table.
--     - "User cannot promote their own role" — yes, no UPDATE grant exists.
--     - "Technician cannot add or remove members" — yes, same reason,
--       and doubly true once role-based API gating is also considered.
--   This migration adds a defense-in-depth CHECK constraint instead (see
--   below) rather than a redundant RLS policy for commands that are
--   already ungranted.
-- ============================================================================

-- Defense-in-depth: constrain shop_users.role to the 4 values the
-- application layer (lib/serverAuth.ts ShopRole, lib/schemas.ts
-- ShopRoleSchema) actually understands. Without this, a bug in a future
-- script/migration/direct-DB-edit could insert an unrecognized role value
-- that requireShopRole()'s `allowedRoles.includes(role)` check would then
-- simply reject for every route (fails closed, not a security hole by
-- itself) — but a stray bad value is still worth preventing at the schema
-- level rather than discovering it via a locked-out user's support ticket.
--
-- Guarded: only add the constraint if no existing row would violate it —
-- this is read from docs/PRODUCTION_SECURITY_REMEDIATION.sql's own
-- pre-check (Check 1), reproduced here as a live guard rather than a
-- manual "only run if..." comment, so this migration is safe to include in
-- an automated apply sequence without a human having to remember to check
-- first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.shop_users WHERE role NOT IN ('owner', 'manager', 'advisor', 'technician')
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'shop_users_role_check' AND conrelid = 'public.shop_users'::regclass
    ) THEN
      ALTER TABLE public.shop_users
        ADD CONSTRAINT shop_users_role_check
        CHECK (role IN ('owner', 'manager', 'advisor', 'technician'));
    END IF;
  ELSE
    RAISE NOTICE 'Skipping shop_users_role_check: existing rows contain a role outside the 4 valid values — clean up data first, then re-run this migration.';
  END IF;
END $$;
