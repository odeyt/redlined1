-- M-ACTIVATION1 — every shop gets a shop_settings row, transactionally.
--
-- RUN AGAINST redlined1 BEFORE deploying the application change.
--
-- ---------------------------------------------------------------------------
-- Proven root cause
-- ---------------------------------------------------------------------------
--
-- commercial/onboarding/ShopProvisioningService.getOrCreatePrimaryShop is the
-- authoritative shop creator. It performs four writes — the provisioning
-- claim, `organizations`, `shops`, and the owner's `shop_users` membership —
-- and never inserts `shop_settings`. No signup has ever produced one. The four
-- tenants that have a row created it by opening Settings and saving.
--
-- What that costs, reproduced against production before writing any of this:
--
--   fetchShopSettings()      ->  company name "My Shop"   (a fabricated default)
--   invoice print / preview  ->  "Redlined1"              (OUR product name)
--   send-document email      ->  PGRST116, the send fails
--
-- So the invoice was not blank. It carried our name onto their customer's
-- document, and emailing it errored.
--
-- ---------------------------------------------------------------------------
-- Why a trigger rather than another INSERT in the service
-- ---------------------------------------------------------------------------
--
-- A trigger is in the SAME TRANSACTION as the shops INSERT, so a shop cannot
-- exist without settings even if the transaction later fails. It also cannot be
-- bypassed: the auth callback, /api/provision, a future admin tool and a hand
-- written SQL insert all get the row. A fifth write in the service would have
-- fixed only the paths that go through the service, which is exactly how the
-- organization_id gap happened — that insert was added in one place and every
-- shop created elsewhere arrived with a NULL.
--
-- The codebase already uses this pattern: vehicles_stamp_completed_at in
-- 2026-08-04_vehicles_completed_at.sql.
--
-- ---------------------------------------------------------------------------
-- It creates a STRUCTURAL row and invents nothing
-- ---------------------------------------------------------------------------
--
-- Only `shop_id` is written. No business name, no address, no telephone, no
-- tax or owner information. A row full of invented values would satisfy the
-- readiness check while producing exactly the unusable invoice this milestone
-- exists to prevent — the check would pass and the customer would still get a
-- document with the wrong name on it.
--
-- The shop's name is deliberately NOT copied from shops.name either: for a
-- signup that did not type one, that value is the literal default 'My Shop',
-- and seeding it would mark the shop ready while printing a placeholder.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_shop_settings_for_new_shop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ON CONFLICT makes this idempotent: a retried provision, a restored
  -- backup, or a shop whose settings were created by the repair path below
  -- all converge on one row rather than raising.
  INSERT INTO public.shop_settings (shop_id)
  VALUES (NEW.id)
  ON CONFLICT (shop_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shops_create_settings ON public.shops;

CREATE TRIGGER shops_create_settings
  AFTER INSERT ON public.shops
  FOR EACH ROW
  EXECUTE FUNCTION public.create_shop_settings_for_new_shop();

-- The ON CONFLICT above needs a unique constraint on shop_id to bite. Without
-- it a retry inserts a SECOND settings row and every read that uses
-- maybeSingle() starts failing on "multiple rows returned" — a worse fault
-- than the one being fixed.
CREATE UNIQUE INDEX IF NOT EXISTS shop_settings_shop_id_key
  ON public.shop_settings (shop_id);

-- Prove the trigger actually fires, inside a transaction that is rolled back
-- so production gains no rows. Asserting it attached is not the same as
-- asserting it works: the vehicles trigger migration learned that distinction.
DO $$
DECLARE
  probe_shop uuid;
  settings_count int;
BEGIN
  INSERT INTO public.shops (name, slug)
  VALUES ('__m_activation1_probe__', '__m-activation1-probe__')
  RETURNING id INTO probe_shop;

  SELECT count(*) INTO settings_count
  FROM public.shop_settings WHERE shop_id = probe_shop;

  IF settings_count <> 1 THEN
    RAISE EXCEPTION 'shops_create_settings did not fire: expected 1 settings row, found %', settings_count;
  END IF;

  -- Idempotency: a second insert of the same settings row must not raise.
  INSERT INTO public.shop_settings (shop_id) VALUES (probe_shop)
  ON CONFLICT (shop_id) DO NOTHING;

  SELECT count(*) INTO settings_count
  FROM public.shop_settings WHERE shop_id = probe_shop;

  IF settings_count <> 1 THEN
    RAISE EXCEPTION 'shop_settings is not idempotent: found % rows', settings_count;
  END IF;

  -- Undo the probe entirely. Nothing from this block survives.
  DELETE FROM public.shop_settings WHERE shop_id = probe_shop;
  DELETE FROM public.shops WHERE id = probe_shop;

  RAISE NOTICE 'shops_create_settings verified: fires once, idempotent, probe removed';
END;
$$;

COMMIT;


-- ── Verification ────────────────────────────────────────────────────────────

-- 1. The trigger exists.
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.shops'::regclass AND NOT tgisinternal;

-- 2. Nothing was created or changed by this migration. Expect the counts you
--    had before: 12 shops, 4 settings rows.
SELECT
  (SELECT count(*) FROM public.shops)         AS shops,
  (SELECT count(*) FROM public.shop_settings) AS settings_rows;

-- 3. No shop must have two settings rows.
SELECT shop_id, count(*)
FROM public.shop_settings
GROUP BY shop_id
HAVING count(*) > 1;


-- ── Existing tenants: NOT run here ──────────────────────────────────────────
--
-- Eight active tenants, of which SIX cannot produce a usable invoice:
--
--   no settings row at all   AutoQ, Elite Vehicle Inspections, KARS,
--                            port7 workshop                            (4)
--   row exists, blank        Tapia Auto, peter repair shop             (2)
--                            address and telephone
--   ready                    D1 Imports, D1 Imports - Location 2       (2)
--
-- The backfill below creates the four MISSING STRUCTURAL ROWS and nothing
-- else. It cannot help the two incomplete ones — no migration can invent an
-- address — and it deliberately does not try. Those two are reached by the
-- activation card instead.
--
-- Held for approval, per the milestone brief. Expect exactly 4 rows.
--
--   INSERT INTO public.shop_settings (shop_id)
--   SELECT s.id
--   FROM public.shops s
--   LEFT JOIN public.shop_settings ss ON ss.shop_id = s.id
--   WHERE ss.shop_id IS NULL
--     AND s.archived_at IS NULL
--   ON CONFLICT (shop_id) DO NOTHING;
--
-- Note it also skips archived shops, so the four internal test tenants stay
-- as they are.


-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS shops_create_settings ON public.shops;
--   DROP FUNCTION IF EXISTS public.create_shop_settings_for_new_shop();
--   DROP INDEX IF EXISTS public.shop_settings_shop_id_key;
--
--   New shops stop receiving a settings row. Nothing already created is lost,
--   and the application-side gate keeps refusing unusable documents.
