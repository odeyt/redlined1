-- API v1 documents (bot access to draft estimates and invoices): phase 2.
--
-- Plan: docs/api/PLAN.md §5. Owner-approved 2026-11-24, numbering option A
-- chosen 2026-11-25.
--
-- ADDITIVE ONLY. No drops, no data rewrites, no triggers, no pg_net.
--   * New nullable columns, so every existing row is untouched (NULL means
--     "made in the app", which is true of every existing row).
--   * A new numbering function for the API. next_document_number, which every
--     staff save calls, is NOT modified.
--   * One feature-flag row, seeded OFF.
-- Nothing in the app reads any of this yet; the API routes come in phase 3/4
-- and stay behind the flag.
--
-- Rollback: 2026-11-25_api_v1_documents_rollback.sql
-- Safe to re-run: every statement is IF NOT EXISTS / OR REPLACE / ON CONFLICT.

BEGIN;

-- ── 1. Who created a document ───────────────────────────────────────────────
-- NULL = the app (every existing row), 'api' = an API key.

ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS created_via text
  CONSTRAINT estimates_created_via_check CHECK (created_via IS NULL OR created_via IN ('ui', 'api'));
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS created_by_api_key_id uuid
  REFERENCES public.api_keys(id) ON DELETE SET NULL;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_via text
  CONSTRAINT invoices_created_via_check CHECK (created_via IS NULL OR created_via IN ('ui', 'api'));
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_by_api_key_id uuid
  REFERENCES public.api_keys(id) ON DELETE SET NULL;

-- ── 2. The estimate an invoice was converted from ───────────────────────────
-- Unique, so a retried convert cannot bill the same estimate twice (same
-- pattern as invoices_one_per_repair_order). Existing invoices stay NULL; the
-- app's conversion keeps writing "Converted from EST-…" into notes as today.

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS source_estimate_id uuid
  REFERENCES public.estimates(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_source_estimate
  ON public.invoices (source_estimate_id) WHERE source_estimate_id IS NOT NULL;

-- ── 3. Keys issued from the owner screen record who issued them ─────────────

ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

-- ── 4. Document numbers for API calls (option A) ────────────────────────────
-- next_document_number refuses any caller that is not a shop member via
-- auth.uid(), and API requests run as service_role with no user. Rather than
-- edit the function staff saves depend on, this is a second function that
-- only service_role may call. The shop comes from the API key, never from the
-- request body, so the membership check is replaced by "the shop exists".
--
-- Everything from the doc-type check down is a byte-for-byte copy of
-- next_document_number (2026-08-11_invoice_number_global_sequence.sql), and
-- lib/__tests__/documentNumbering.test.ts fails if the two ever drift. Both
-- functions share the same counters and the same invoice sequence, so staff
-- and API documents number in one series with no gaps or collisions.

create or replace function public.api_next_document_number(p_shop_id uuid, p_doc_type text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v      bigint;
  v_seed bigint;
begin
  -- Only service_role can execute this (grants below). The API derives
  -- p_shop_id from the key, so the check here is that the shop exists.
  if not exists (select 1 from public.shops where id = p_shop_id) then
    raise exception 'unknown shop %', p_shop_id using errcode = '42501';
  end if;

  if p_doc_type not in ('repair_order', 'estimate', 'invoice', 'inspection') then
    raise exception 'unknown document type %', p_doc_type using errcode = '22023';
  end if;

  -- Global, because the number is the invoices primary key.
  if p_doc_type = 'invoice' then
    return nextval('invoice_number_seq');
  end if;

  -- Everything else stays per shop: two tenants may both hold RO-00001.
  if not exists (
    select 1 from public.document_counters
     where shop_id = p_shop_id and doc_type = p_doc_type
  ) then
    v_seed := case p_doc_type
      when 'repair_order' then (
        select coalesce(max(nullif(regexp_replace(ro_number, '\D', '', 'g'), '')::bigint), 0)
          from public.repair_orders where shop_id = p_shop_id)
      when 'estimate' then (
        select coalesce(max(nullif(regexp_replace(estimate_number, '\D', '', 'g'), '')::bigint), 0)
          from public.estimates where shop_id = p_shop_id)
      when 'inspection' then (
        select coalesce(max(nullif(regexp_replace(inspection_number, '\D', '', 'g'), '')::bigint), 0)
          from public.inspections where shop_id = p_shop_id)
    end;

    insert into public.document_counters (shop_id, doc_type, last_value)
    values (p_shop_id, p_doc_type, coalesce(v_seed, 0))
    on conflict (shop_id, doc_type) do nothing;
  end if;

  insert into public.document_counters (shop_id, doc_type, last_value)
  values (p_shop_id, p_doc_type, 1)
  on conflict (shop_id, doc_type) do update
     set last_value = public.document_counters.last_value + 1,
         updated_at = now()
  returning last_value into v;

  return v;
end
$$;

-- REVOKE ... FROM PUBLIC also strips the EXECUTE service_role inherits through
-- PUBLIC, so the grant is restated (same as api_rate_limit_hit).
revoke execute on function public.api_next_document_number(uuid, text) from public;
revoke execute on function public.api_next_document_number(uuid, text) from anon;
revoke execute on function public.api_next_document_number(uuid, text) from authenticated;
grant  execute on function public.api_next_document_number(uuid, text) to service_role;

-- ── 5. Feature flag, seeded OFF ─────────────────────────────────────────────
-- Gates every new /api/v1 estimate and invoice endpoint (they return 404 while
-- off). Rollout per PLAN.md: stays off on production until a read-only key
-- passes a preview test.

INSERT INTO feature_flags (flag_key, display_name, description, enabled, scope)
VALUES
  ('api_v1_documents', 'API v1 documents', 'Machine API access to draft estimates and invoices (bots). Drafts only: no send, approve, payment, void or delete.', false, 'global')
ON CONFLICT DO NOTHING;

COMMIT;

notify pgrst, 'reload schema';

-- ── Check after running (every row should say ok) ───────────────────────────

SELECT 'estimates.created_via' AS item,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'estimates'
                            AND column_name = 'created_via') THEN 'ok' ELSE 'MISSING' END AS result
UNION ALL
SELECT 'invoices.source_estimate_id',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'invoices'
                            AND column_name = 'source_estimate_id') THEN 'ok' ELSE 'MISSING' END
UNION ALL
SELECT 'api_next_document_number: service_role only',
       CASE WHEN has_function_privilege('service_role', 'public.api_next_document_number(uuid, text)', 'EXECUTE')
             AND NOT has_function_privilege('authenticated', 'public.api_next_document_number(uuid, text)', 'EXECUTE')
             AND NOT has_function_privilege('anon', 'public.api_next_document_number(uuid, text)', 'EXECUTE')
            THEN 'ok' ELSE 'WRONG GRANTS' END
UNION ALL
SELECT 'next_document_number still granted to authenticated',
       CASE WHEN has_function_privilege('authenticated', 'public.next_document_number(uuid, text)', 'EXECUTE')
            THEN 'ok' ELSE 'CHANGED' END
UNION ALL
SELECT 'api_v1_documents flag is off',
       CASE WHEN EXISTS (SELECT 1 FROM feature_flags
                          WHERE flag_key = 'api_v1_documents' AND enabled = false)
             AND NOT EXISTS (SELECT 1 FROM feature_flags
                              WHERE flag_key = 'api_v1_documents' AND enabled = true)
            THEN 'ok' ELSE 'CHECK FLAG' END;
