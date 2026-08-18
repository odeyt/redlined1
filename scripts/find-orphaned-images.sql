-- Photos left behind by quotation-to-order conversions.
--
-- Converting a parts quotation created a new order row and deleted the
-- quotation, but never moved the images, which are keyed on
-- (entity_type, entity_id). The rows and the storage objects both survive —
-- nothing displays them, so they read as erased.
--
--   node scripts/run-sql.mjs scripts/find-orphaned-images.sql prod
--
-- Read-only. It reports; it does not reattach anything, because which order a
-- given photo belongs to is a judgement this query cannot make safely.

SELECT
  i.id,
  i.entity_type,
  i.entity_id      AS points_at_missing_record,
  i.label,
  i.created_at,
  i.shop_id
FROM entity_images i
WHERE i.entity_type = 'parts_estimate'
  AND NOT EXISTS (
    SELECT 1 FROM public.parts_estimates e WHERE e.id::text = i.entity_id::text
  )
ORDER BY i.created_at DESC;

-- Parts orders created from a quotation, for matching against the above by
-- time and shop. The conversion stamps this note, which is the only link left
-- between an order and the quotation it came from.
SELECT
  o.id,
  o.part_name,
  o.vendor_name,
  o.customer_name,
  o.created_at,
  o.shop_id
FROM public.parts_orders o
WHERE o.notes LIKE 'Converted from Parts Quotation%'
ORDER BY o.created_at DESC;
