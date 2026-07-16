-- ═══════════════════════════════════════════════════════════════
-- REDLINE — Admin User Deletion Helper
-- Run in Supabase SQL Editor (project owner only).
-- Usage: call admin_delete_user_by_email('user@example.com');
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Ensure all user-linked tables have CASCADE on auth.users ─

-- profiles (already set in rls_phase7.sql — idempotent re-create)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- shop_users (already set in migration_multitenant.sql — idempotent)
ALTER TABLE public.shop_users
  DROP CONSTRAINT IF EXISTS shop_users_user_id_fkey;
ALTER TABLE public.shop_users
  ADD CONSTRAINT shop_users_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 2. Helper function to delete a user by email ───────────────

CREATE OR REPLACE FUNCTION public.admin_delete_user_by_email(target_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = lower(trim(target_email));

  IF uid IS NULL THEN
    RETURN 'User not found: ' || target_email;
  END IF;

  -- Explicit cleanup of every user-linked table (belt + suspenders).
  -- CASCADE handles most of these automatically; listing them here
  -- ensures any table whose FK is missing CASCADE is still cleaned up.
  DELETE FROM public.profiles    WHERE id       = uid;
  DELETE FROM public.shop_users  WHERE user_id  = uid;

  -- Delete the auth user last — Supabase handles auth.sessions,
  -- auth.identities, auth.mfa_factors etc. via its own cascade.
  DELETE FROM auth.users WHERE id = uid;

  RETURN 'Deleted user ' || target_email || ' (' || uid || ')';
END;
$$;

-- Grant execute only to service_role (dashboard runs as service_role)
REVOKE ALL ON FUNCTION public.admin_delete_user_by_email(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_delete_user_by_email(text) TO service_role;

-- ── 3. Run it now for sales@d1autozone.com ─────────────────────
SELECT public.admin_delete_user_by_email('sales@d1autozone.com');
