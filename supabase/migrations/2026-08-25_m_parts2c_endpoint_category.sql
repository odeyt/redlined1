-- M-PARTS2C — allow the vehicle-first search category in usage accounting.
--
-- `endpoint_category` carries a CHECK constraint listing the categories that
-- existed when the table was made. M-PARTS2C adds one, and without this the
-- constraint would reject every usage row for a vehicle-first search.
--
-- The failure would have been quiet in the worst way: `recordUsage` swallows
-- its own errors so telemetry can never break a parts search, so the rows
-- would simply not appear — and the milestone whose entire purpose was honest
-- accounting would have started undercounting again, immediately, in its very
-- next feature.
--
-- Additive. No existing value is removed.

ALTER TABLE public.parts_provider_usage_events
  DROP CONSTRAINT IF EXISTS parts_provider_usage_events_endpoint_category_check;

ALTER TABLE public.parts_provider_usage_events
  ADD CONSTRAINT parts_provider_usage_events_endpoint_category_check
  CHECK (endpoint_category IN (
    'reference', 'manufacturers', 'models', 'vehicle_variants',
    'vehicle_detail', 'oem_search', 'oem_applicability', 'cross_reference',
    -- M-PARTS2C
    'vehicle_parts_search'
  ));

DO $$
BEGIN
  -- Prove the new value is accepted and an unknown one still is not. A
  -- constraint that accepts everything is not a constraint.
  BEGIN
    INSERT INTO public.parts_provider_usage_events
      (shop_id, endpoint_category, call_context, outcome, cache_hit, success)
    VALUES (NULL, 'vehicle_parts_search', 'migration', 'external', FALSE, TRUE);
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'vehicle_parts_search is still rejected by the category constraint';
  END;

  DELETE FROM public.parts_provider_usage_events
   WHERE endpoint_category = 'vehicle_parts_search' AND call_context = 'migration';

  BEGIN
    INSERT INTO public.parts_provider_usage_events
      (shop_id, endpoint_category, call_context, outcome, cache_hit, success)
    VALUES (NULL, 'not-a-real-category', 'migration', 'external', FALSE, TRUE);
    RAISE EXCEPTION 'the category constraint accepted an unknown value';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- expected
  END;
END $$;
