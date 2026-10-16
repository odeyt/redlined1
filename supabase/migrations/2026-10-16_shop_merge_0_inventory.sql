-- ============================================================================
-- Shop merge — STEP 0: read-only inventory. Changes nothing.
-- (D1 Imports closed; folded into Location 2. Option A: no rows move.)
--
-- Run in the Supabase SQL editor (project redlined1). Every statement below is
-- a SELECT. The SQL editor only shows the LAST result of a multi-statement run,
-- so highlight and run Q1..Q5 one at a time and keep each grid.
--
--   Shop 1  D1 Imports              38d55fae-741b-4bac-b520-f96eed65bf38  (closed)
--   Shop 2  D1 Imports — Location 2 90b72748-bf01-4456-999f-f4ba48091606  (keeps)
-- ============================================================================


-- ── Q1. Rows per shop in every table that has a shop_id column ─────────────
-- Counts are computed per table with query_to_xml so no function is created.
SELECT c.table_name,
       (xpath('/row/n/text()', query_to_xml(format(
         'SELECT count(*) AS n FROM public.%I WHERE shop_id::text = %L',
         c.table_name, '38d55fae-741b-4bac-b520-f96eed65bf38'), false, true, '')))[1]::text::bigint AS shop1_rows,
       (xpath('/row/n/text()', query_to_xml(format(
         'SELECT count(*) AS n FROM public.%I WHERE shop_id::text = %L',
         c.table_name, '90b72748-bf01-4456-999f-f4ba48091606'), false, true, '')))[1]::text::bigint AS shop2_rows
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND c.column_name  = 'shop_id'
  AND t.table_type   = 'BASE TABLE'
ORDER BY shop1_rows DESC, c.table_name;


-- ── Q2. Who belongs to which shop ──────────────────────────────────────────
-- Matters for both options: RLS only shows a row to members of its shop, so a
-- staff member who is in Shop 2 but not Shop 1 cannot see Shop 1's history
-- even through the mirror.
SELECT u.email,
       max(su.role) FILTER (WHERE su.shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38') AS shop1_role,
       max(su.role) FILTER (WHERE su.shop_id = '90b72748-bf01-4456-999f-f4ba48091606') AS shop2_role
FROM public.shop_users su
JOIN auth.users u ON u.id = su.user_id
WHERE su.shop_id IN ('38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606')
GROUP BY u.email
ORDER BY u.email;


-- ── Q3. Mirror links, archive state and shop names as they are today ───────
SELECT 'mirror' AS kind, shop_id::text AS a, mirror_shop_id::text AS b, NULL AS c
FROM public.shop_mirrors
WHERE shop_id IN ('38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606')
UNION ALL
SELECT 'shop', id::text, name, coalesce(archived_at::text, 'active')
FROM public.shops
WHERE id IN ('38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606');


-- ── Q4. Open work still sitting under Shop 1 ───────────────────────────────
-- Anything open here must be finished or carried over after Shop 1 closes.
SELECT 'job_cards' AS t, status, count(*) FROM public.job_cards
 WHERE shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38' GROUP BY status
UNION ALL
SELECT 'repair_orders', status, count(*) FROM public.repair_orders
 WHERE shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38' GROUP BY status
UNION ALL
SELECT 'estimates', status, count(*) FROM public.estimates
 WHERE shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38' GROUP BY status
UNION ALL
SELECT 'invoices', status, count(*) FROM public.invoices
 WHERE shop_id = '38d55fae-741b-4bac-b520-f96eed65bf38' GROUP BY status
ORDER BY 1, 2;


-- ── Q5. Triggers on the two tables step 1 writes to ────────────────────────
-- Step 1 inserts into shop_users and updates shops. Any trigger listed here
-- fires during step 1, so check that none of them would do something surprising.
SELECT tgrelid::regclass::text AS table_name, tgname, tgenabled::text AS enabled
FROM pg_trigger
WHERE tgrelid IN ('public.shop_users'::regclass, 'public.shops'::regclass)
  AND NOT tgisinternal
ORDER BY 1, 2;
