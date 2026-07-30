-- ============================================================================
-- Plan state, provisioning and settings repair — APPLIED to production
-- 2026-07-30 (project ref ldjrlvjkmzrcdqhetqoh)
--
-- Recorded after the fact: these statements were run manually in the Supabase
-- SQL editor. Kept here so the production database state is reproducible and
-- auditable. Re-running is safe.
--
-- Context: no account had ever reached plan='free'. A signup trigger writes
-- plan='trial' with a 7-day trial_ends_at, and ensureFreeSubscription() bailed
-- out whenever a plan already existed, so Free Forever was never granted. See
-- commercial/onboarding/ShopProvisioningService.ts for the code-side fix.
-- ============================================================================


-- ── 1. Internal / D1 accounts → permanent paid ───────────────────────────────
-- These were on trial expiring 2026-08-16. On that date getPlanStatus() would
-- have returned 'free' and stripped reports / AI / technicians / payments from
-- daily-driver logins.

UPDATE profiles SET plan = 'pro', trial_ends_at = NULL
WHERE id IN (SELECT id FROM auth.users WHERE email IN (
  'thammo01@outlook.com', 'wally@d1autozone.com',
  'sales@d1autozone.com', 'info@redlined1.com', 'admin@redlined1.com'
));


-- ── 2. Customer accounts → Free Forever ──────────────────────────────────────

UPDATE profiles SET plan = 'free', trial_ends_at = NULL
WHERE id IN (SELECT id FROM auth.users WHERE email IN (
  'ttapia1357@gmail.com', 'phongsavathpeterchaleunsouk65@gmail.com',
  'thammo01@gmail.com', 'sale@d1autozone.com', 'e2e-audit@redlined1.com'
));


-- ── 3. shop_settings.id had no working default ───────────────────────────────
-- Integer primary key with no sequence: every INSERT collided on id=1, so no
-- shop could ever get a settings row. Combined with saveShopSettings() being
-- UPDATE-only, a new shop's settings silently failed to persist.

CREATE SEQUENCE IF NOT EXISTS public.shop_settings_id_seq OWNED BY public.shop_settings.id;
ALTER TABLE public.shop_settings ALTER COLUMN id SET DEFAULT nextval('public.shop_settings_id_seq');
SELECT setval('public.shop_settings_id_seq',
              COALESCE((SELECT MAX(id) FROM public.shop_settings), 0) + 1, false);


-- ── 4. Provision shops for two orphaned accounts ─────────────────────────────
-- Both had confirmed emails but zero shop_users rows and could not use the app.
-- Shop names taken from their original signup metadata.

WITH new_shop AS (
  INSERT INTO public.shops (name)
  SELECT 'Tapia Auto'
  WHERE NOT EXISTS (SELECT 1 FROM public.shop_users
                    WHERE user_id = '7cdc7f6d-b57c-42ee-91de-41b2a799e33a' AND role = 'owner')
  RETURNING id
)
INSERT INTO public.shop_users (user_id, shop_id, role)
SELECT '7cdc7f6d-b57c-42ee-91de-41b2a799e33a', id, 'owner' FROM new_shop;

WITH new_shop AS (
  INSERT INTO public.shops (name)
  SELECT 'peter repair shop'
  WHERE NOT EXISTS (SELECT 1 FROM public.shop_users
                    WHERE user_id = 'ce5a116f-6950-4c0f-8531-7d7144cc3672' AND role = 'owner')
  RETURNING id
)
INSERT INTO public.shop_users (user_id, shop_id, role)
SELECT 'ce5a116f-6950-4c0f-8531-7d7144cc3672', id, 'owner' FROM new_shop;

INSERT INTO public.shop_settings (shop_id, company_name)
SELECT s.shop_id, sh.name
FROM public.shop_users s
JOIN public.shops sh ON sh.id = s.shop_id
WHERE s.user_id IN ('7cdc7f6d-b57c-42ee-91de-41b2a799e33a',
                    'ce5a116f-6950-4c0f-8531-7d7144cc3672')
  AND s.role = 'owner'
  AND NOT EXISTS (SELECT 1 FROM public.shop_settings ss WHERE ss.shop_id = s.shop_id);


-- ── 5. Grant those two a 7-day evaluation trial ──────────────────────────────
-- Deliberate, owner-approved full access (expires 2026-08-06). Note this is an
-- UPDATE: the INSERT trigger in step 6 does not touch it, and
-- ensureFreeSubscription() now leaves an ACTIVE trial alone.

UPDATE profiles
SET plan = 'trial', trial_ends_at = now() + interval '7 days'
WHERE id IN ('7cdc7f6d-b57c-42ee-91de-41b2a799e33a',
             'ce5a116f-6950-4c0f-8531-7d7144cc3672');


-- ── 6. New signups default to Free Forever ───────────────────────────────────
-- Additive BEFORE INSERT trigger. Deliberately does NOT modify
-- handle_new_user(), whose body also copies signup metadata. Reversible with a
-- single DROP TRIGGER. Fires on INSERT only, so manual trial grants (UPDATEs)
-- are unaffected.

CREATE OR REPLACE FUNCTION public.normalize_new_profile_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.plan IS NULL OR NEW.plan = 'trial' THEN
    NEW.plan := 'free';
    NEW.trial_ends_at := NULL;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS profiles_default_free ON public.profiles;
CREATE TRIGGER profiles_default_free
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_new_profile_plan();


-- ── 7. Clear stale trial dates on free accounts ───────────────────────────────
-- KNOWN GAP: something after the BEFORE INSERT trigger re-populates
-- trial_ends_at (verified by pushing a real signup through). It is inert —
-- getPlanStatus() only honours trial_ends_at when plan is 'trial' or null, and
-- lib/__tests__/planGate.test.ts locks that in — but it makes the profiles
-- table misleading to read. Root cause is inside handle_new_user(); until that
-- is rewritten, rerun this after signups if audit clarity matters.

UPDATE profiles SET trial_ends_at = NULL WHERE plan = 'free';


-- ── 8. Removed one unused account ────────────────────────────────────────────
-- info@d1autozone.com (4ba1d01c-26af-4381-a0ff-936c9bfa0f49) was deleted via
-- the Supabase admin API, not SQL, so there is no statement to rerun here.
--
-- Verified safe before deleting: created 2026-06-15, last_sign_in_at NULL
-- (never signed in), zero shop_users rows, no user_metadata beyond
-- email_verified. It could not have authored any records without signing in.
-- It had been left on plan='trial' expiring 2026-08-16, which is what surfaced
-- it during the audit.
--
-- Auth user count after removal: 11.


-- ── Verification ─────────────────────────────────────────────────────────────

SELECT u.email, p.plan, p.trial_ends_at::date AS trial_ends,
       (SELECT count(*) FROM shop_users s WHERE s.user_id = u.id) AS shops
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ORDER BY p.plan, u.email;
