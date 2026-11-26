-- Rollback for 2026-11-25_api_v1_documents.sql.
--
-- FIRST, prefer the off switch: Settings → Feature Flags → api_v1_documents
-- OFF. That stops every API estimate/invoice endpoint and keeps all data.
--
-- This file removes only what that migration added. It never touches
-- next_document_number, the document counters or the invoice sequence, so
-- staff numbering is unaffected either way.
--
-- It refuses to run if any document was created by the API or linked to its
-- source estimate, because dropping those columns would lose that record.
-- The documents themselves are never deleted.

BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.estimates WHERE created_via IS NOT NULL OR created_by_api_key_id IS NOT NULL)
  OR EXISTS (SELECT 1 FROM public.invoices  WHERE created_via IS NOT NULL OR created_by_api_key_id IS NOT NULL
                                              OR source_estimate_id IS NOT NULL) THEN
    RAISE EXCEPTION 'API-created or linked documents exist; export them before dropping these columns. Nothing was changed.';
  END IF;
END
$guard$;

DROP FUNCTION IF EXISTS public.api_next_document_number(uuid, text);

DROP INDEX IF EXISTS public.invoices_one_per_source_estimate;

ALTER TABLE public.invoices
  DROP COLUMN IF EXISTS source_estimate_id,
  DROP COLUMN IF EXISTS created_by_api_key_id,
  DROP COLUMN IF EXISTS created_via;

ALTER TABLE public.estimates
  DROP COLUMN IF EXISTS created_by_api_key_id,
  DROP COLUMN IF EXISTS created_via;

ALTER TABLE public.api_keys DROP COLUMN IF EXISTS created_by_user_id;

DELETE FROM feature_flags WHERE flag_key = 'api_v1_documents';

COMMIT;

notify pgrst, 'reload schema';
