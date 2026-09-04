-- M-ACTIVATION1 — every shop gets a shop_settings row, transactionally.
--
-- RUN AGAINST redlined1 BEFORE deploying the application change.
-- Run STEP 1, then STEP 2, then STEP 3, as three separate executions.
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
-- Only structural blanks are written. No business name, no address, no
-- telephone, no tax or owner information. A row full of invented values would
-- satisfy the readiness check while producing exactly the unusable invoice this
-- milestone exists to prevent — the check would pass and the customer would
-- still get a document with the wrong name on it.
--
-- The shop's name is deliberately NOT copied from shops.name either: for a
-- signup that did not type one, that value is the literal default 'My Shop',
-- and seeding it would mark the shop ready while printing a placeholder.
--
-- ---------------------------------------------------------------------------
-- Why THREE steps instead of one transaction
-- ---------------------------------------------------------------------------
--
-- This ran as a single BEGIN..COMMIT with the probe inside it. The probe
-- failed, and because it shared the transaction it rolled back the repair
-- along with itself. Verified afterwards against production:
--
--   trigger_exists 0 | function_exists 0 | unique_index_exists 0
--
-- Nothing at all had landed, including the CREATE FUNCTION that ran first. A
-- verification step must not be able to destroy the thing it verifies, so the
-- probe now runs in its own execution, AFTER the repair is committed, and
-- reports what went wrong instead of silently undoing everything.
--
-- The order also matters and was wrong. The trigger was created BEFORE the
-- unique index its ON CONFLICT (shop_id) depends on. Inside one transaction
-- that is invisible. Applied separately it is severe: a trigger whose
-- ON CONFLICT has no matching constraint raises on EVERY insert into `shops`,
-- so signup stops working entirely. The index is now built first, and the
-- trigger — the statement that can break signup — goes on last.
-- ============================================================================


-- ===========================================================================
-- STEP 1 — the unique index. Run this first, on its own.
-- ===========================================================================
--
-- ON CONFLICT (shop_id) needs a unique constraint on shop_id to bite. Without
-- it a retry inserts a SECOND settings row and every read that uses
-- maybeSingle() starts failing on "multiple rows returned" — a worse fault
-- than the one being fixed.
--
-- Safe on its own: an index constrains what already holds (verified: 0 shops
-- have duplicate settings rows) and changes no behaviour by itself.

CREATE UNIQUE INDEX IF NOT EXISTS shop_settings_shop_id_key
  ON public.shop_settings (shop_id);

SELECT count(*) AS unique_index_expect_1
FROM pg_indexes
WHERE schemaname = 'public' AND indexname = 'shop_settings_shop_id_key';


-- ===========================================================================
-- STEP 2 — the function and trigger. Run only after STEP 1 returns 1.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.create_shop_settings_for_new_shop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  /**
   * The three identity columns are written EXPLICITLY BLANK, and that is the
   * difference between this fixing the bug and re-creating it.
   *
   * `shop_settings.company_name` carries a column DEFAULT of 'Redline'
   * (confirmed in production: company_name_column_default = 'Redline'::text).
   * Inserting only `shop_id` therefore produces a row whose business name is
   * our own product name.
   *
   * A readiness check sees that as a perfectly good name. A shop would then
   * fill in its address and telephone, be marked ready, and print invoices
   * headed "Redline" — the exact fault this milestone exists to end,
   * re-introduced by its own fix and harder to spot, because nothing would be
   * missing any more.
   *
   * '' rather than NULL so this holds whether or not the columns are NOT
   * NULL, and because the readiness rule treats blank and whitespace alike.
   */
  INSERT INTO public.shop_settings (shop_id, company_name, address, phone)
  VALUES (NEW.id, '', '', '')
  -- Idempotent: a retried provision, a restored backup, or a shop whose
  -- settings were created by the repair path all converge on one row.
  ON CONFLICT (shop_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS shops_create_settings ON public.shops;

CREATE TRIGGER shops_create_settings
  AFTER INSERT ON public.shops
  FOR EACH ROW
  EXECUTE FUNCTION public.create_shop_settings_for_new_shop();

SELECT
  (SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.shops'::regclass
      AND tgname = 'shops_create_settings')          AS trigger_expect_1,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'shop_settings_shop_id_key')   AS index_still_expect_1;


-- ===========================================================================
-- STEP 3 — prove it actually works. Run last.
-- ===========================================================================
--
-- Asserting the trigger is attached is not the same as asserting it fires:
-- the vehicles trigger migration learned that distinction.
--
-- Creates a probe shop, checks the row, then removes both. Everything it
-- writes it deletes. It CANNOT roll back STEP 1 or STEP 2 — those are already
-- committed — which is the whole reason it is a separate execution.
--
-- On failure it RAISES with the underlying SQLSTATE and message rather than a
-- bare "failed", because the first run of this migration produced no usable
-- error and cost a full round trip to diagnose.

DO $probe$
DECLARE
  probe_shop uuid;
  settings_count int;
  got_name text;
  got_address text;
  got_phone text;
  err_state text;
  err_message text;
BEGIN
  BEGIN
    INSERT INTO public.shops (name, slug)
    VALUES ('__m_activation1_probe__',
            '__m-activation1-probe-' || gen_random_uuid() || '__')
    RETURNING id INTO probe_shop;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err_state = RETURNED_SQLSTATE, err_message = MESSAGE_TEXT;
    RAISE EXCEPTION 'probe could not create a shop [%] %', err_state, err_message;
  END;

  SELECT count(*) INTO settings_count
  FROM public.shop_settings WHERE shop_id = probe_shop;

  IF settings_count <> 1 THEN
    DELETE FROM public.shop_settings WHERE shop_id = probe_shop;
    DELETE FROM public.shops WHERE id = probe_shop;
    RAISE EXCEPTION 'shops_create_settings did not fire: expected 1 settings row, found %',
      settings_count;
  END IF;

  -- The row must be BLANK, not defaulted. company_name defaults to 'Redline',
  -- so a trigger that let the default stand would mark every new shop as
  -- having a business name it never chose.
  SELECT coalesce(company_name, ''), coalesce(address, ''), coalesce(phone, '')
    INTO got_name, got_address, got_phone
  FROM public.shop_settings WHERE shop_id = probe_shop;

  IF got_name <> '' OR got_address <> '' OR got_phone <> '' THEN
    DELETE FROM public.shop_settings WHERE shop_id = probe_shop;
    DELETE FROM public.shops WHERE id = probe_shop;
    RAISE EXCEPTION 'shops_create_settings wrote invented identity instead of blanks: name=% address=% phone=%',
      got_name, got_address, got_phone;
  END IF;

  -- Idempotency: a second insert of the same settings row must not raise.
  INSERT INTO public.shop_settings (shop_id, company_name, address, phone)
  VALUES (probe_shop, '', '', '')
  ON CONFLICT (shop_id) DO NOTHING;

  SELECT count(*) INTO settings_count
  FROM public.shop_settings WHERE shop_id = probe_shop;

  IF settings_count <> 1 THEN
    DELETE FROM public.shop_settings WHERE shop_id = probe_shop;
    DELETE FROM public.shops WHERE id = probe_shop;
    RAISE EXCEPTION 'shop_settings is not idempotent: found % rows', settings_count;
  END IF;

  -- Undo the probe entirely. Nothing from this block survives.
  DELETE FROM public.shop_settings WHERE shop_id = probe_shop;
  DELETE FROM public.shops WHERE id = probe_shop;

  RAISE NOTICE 'shops_create_settings verified: fires once, writes blanks, idempotent, probe removed';
END;
$probe$;


-- ── Verification — expect 12 shops, 4 settings rows, no duplicates ──────────

SELECT
  (SELECT count(*) FROM pg_trigger
    WHERE tgrelid = 'public.shops'::regclass
      AND tgname = 'shops_create_settings')            AS trigger_expect_1,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'shop_settings_shop_id_key')     AS index_expect_1,
  (SELECT count(*) FROM public.shops)                  AS shops_expect_12,
  (SELECT count(*) FROM public.shop_settings)          AS settings_expect_4,
  (SELECT count(*) FROM (
     SELECT shop_id FROM public.shop_settings
     GROUP BY shop_id HAVING count(*) > 1) d)          AS duplicates_expect_0,
  (SELECT count(*) FROM public.shops
    WHERE name = '__m_activation1_probe__')            AS probe_leftover_expect_0;


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
-- The blanks are written explicitly here for the same reason the trigger
-- writes them: a bare INSERT (shop_id) takes the 'Redline' column default.
--
-- Held for approval, per the milestone brief. Expect exactly 4 rows.
--
--   INSERT INTO public.shop_settings (shop_id, company_name, address, phone)
--   SELECT s.id, '', '', ''
--   FROM public.shops s
--   LEFT JOIN public.shop_settings ss ON ss.shop_id = s.id
--   WHERE ss.shop_id IS NULL
--     AND s.archived_at IS NULL
--   ON CONFLICT (shop_id) DO NOTHING;
--
-- Note it also skips archived shops, so the four internal test tenants stay
-- as they are.


-- ── Rollback ────────────────────────────────────────────────────────────────
--   Reverse order of creation: the trigger first, so it never outlives the
--   index its ON CONFLICT depends on.
--
--   DROP TRIGGER IF EXISTS shops_create_settings ON public.shops;
--   DROP FUNCTION IF EXISTS public.create_shop_settings_for_new_shop();
--   DROP INDEX IF EXISTS public.shop_settings_shop_id_key;
--
--   New shops stop receiving a settings row. Nothing already created is lost,
--   and the application-side gate keeps refusing unusable documents.
