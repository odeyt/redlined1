-- ═══════════════════════════════════════════════════════════════
-- REDLINE — Admin User Deletion Helper
-- Run in Supabase SQL Editor (project owner only).
-- Change the email on the last RAISE NOTICE / uid line to target
-- a different user.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  uid uuid := (SELECT id FROM auth.users WHERE email = 'sales@d1autozone.com');
  r   record;
  sql text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  -- Auto-NULL every public-schema FK that points at auth.users
  -- (handles any table regardless of how many there are)
  FOR r IN
    SELECT kcu.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.table_constraints tc2
      ON rc.unique_constraint_name = tc2.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc2.table_name   = 'users'
      AND tc2.table_schema = 'auth'
      AND kcu.table_schema = 'public'
  LOOP
    sql := format(
      'UPDATE public.%I SET %I = NULL WHERE %I = $1',
      r.table_name, r.column_name, r.column_name
    );
    BEGIN
      EXECUTE sql USING uid;
      RAISE NOTICE 'Nulled %.%', r.table_name, r.column_name;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped %.% — %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;

  -- Hard-delete rows that belong entirely to this user
  DELETE FROM public.subscriptions WHERE user_id = uid;
  DELETE FROM public.shop_users    WHERE user_id = uid;
  DELETE FROM public.profiles      WHERE id      = uid;

  -- Delete the auth user (Supabase handles sessions/mfa/webauthn internally)
  DELETE FROM auth.users WHERE id = uid;

  RAISE NOTICE 'Done — deleted user (%)', uid;
END;
$$;
