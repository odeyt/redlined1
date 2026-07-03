-- ═══════════════════════════════════════════════════════════════
-- FIX: Manager permissions + add sales@d1autozone.com to both shops
-- Run this in Supabase SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Add sales@d1autozone.com to BOTH shops as manager ─────────
--    Looks up the user by email from auth.users so no UUID needed.
DO $$
DECLARE
  v_user_id  UUID;
  v_shop1_id UUID;
  v_shop2_id UUID;
BEGIN
  -- Get auth user id
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'sales@d1autozone.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User sales@d1autozone.com not found in auth.users — skipping shop_users step.';
  ELSE
    SELECT id INTO v_shop1_id FROM public.shops WHERE slug = 'd1-imports'           LIMIT 1;
    SELECT id INTO v_shop2_id FROM public.shops WHERE slug = 'd1-imports-location-2' LIMIT 1;

    IF v_shop1_id IS NOT NULL THEN
      INSERT INTO public.shop_users (shop_id, user_id, role)
      VALUES (v_shop1_id, v_user_id, 'manager')
      ON CONFLICT (shop_id, user_id) DO UPDATE SET role = 'manager';
      RAISE NOTICE 'sales@d1autozone.com added/updated as manager in D1 Imports (Location 1)';
    END IF;

    IF v_shop2_id IS NOT NULL THEN
      INSERT INTO public.shop_users (shop_id, user_id, role)
      VALUES (v_shop2_id, v_user_id, 'manager')
      ON CONFLICT (shop_id, user_id) DO UPDATE SET role = 'manager';
      RAISE NOTICE 'sales@d1autozone.com added/updated as manager in D1 Imports - Location 2';
    END IF;

    -- Ensure profile row exists (profiles table has no "name" column)
    INSERT INTO public.profiles (id, email, role)
    VALUES (v_user_id, 'sales@d1autozone.com', 'manager')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ── 2. Reset role_permissions to NULL for all shops ──────────────
--    This forces the app to fall back to DEFAULT_ROLE_PERMISSIONS,
--    restoring the full manager sidebar (customers, vehicles, job cards,
--    repair orders, scheduling, inspections, technicians, parts, etc.)
UPDATE public.shop_settings
SET role_permissions = NULL
WHERE role_permissions IS NOT NULL;

-- ── 3. Verify ────────────────────────────────────────────────────
SELECT 'shop_users for sales@d1autozone.com:' AS check,
       sh.name AS shop, su.role
FROM public.shop_users su
JOIN public.shops sh ON sh.id = su.shop_id
JOIN auth.users au   ON au.id = su.user_id
WHERE au.email = 'sales@d1autozone.com';

SELECT 'role_permissions reset:' AS check, COUNT(*) AS rows_still_set
FROM public.shop_settings
WHERE role_permissions IS NOT NULL;
