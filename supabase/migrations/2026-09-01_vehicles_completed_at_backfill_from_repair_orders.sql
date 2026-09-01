-- ============================================================================
-- Backfill vehicles.completed_at for work finished before the trigger existed
--
-- WHAT THIS DOES: fills completed_at from the closing date of the vehicle's
-- repair order, for completed vehicles that have no completion date.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: fill it from date_received.
--
-- ---------------------------------------------------------------------------
-- Why not date_received, with the number measured rather than asserted
-- ---------------------------------------------------------------------------
--
-- 2026-08-04_vehicles_completed_at.sql refused a backfill on the grounds that
-- an arrival date written into a completion column is afterwards
-- indistinguishable from a real one. Measured on the 17 vehicles where BOTH
-- dates are now known:
--
--     days from arrival to completion : min 0, median 17, max 182
--     arrival lands in the WRONG MONTH: 7 of 17  (41%)
--
-- So filling the column from date_received would misfile roughly four
-- vehicles in ten, permanently, and remove the "dated by arrival" warning
-- that currently tells the operator the number is soft. The report would
-- become less trustworthy while looking more precise.
--
-- One of the three rows below shows the failure concretely: received
-- 2026-07-31, repair order closed 2026-08-03. Arrival would file it under
-- July; it was finished in August.
--
-- ---------------------------------------------------------------------------
-- Coverage, stated honestly
-- ---------------------------------------------------------------------------
--
--     18  completed vehicles with no completion date
--      3  recoverable from a closed repair order   <- this migration
--     15  no evidence anywhere, left NULL and still flagged in the UI
--
-- The 15 stay null on purpose. There is no record of when they were finished:
-- audit_events only begins 2026-08-17, and no job card or invoice for them
-- carries a closing date. A guess is available; evidence is not.
--
-- ---------------------------------------------------------------------------
-- Safety
-- ---------------------------------------------------------------------------
--
--   * Only ever writes where completed_at IS NULL, so it cannot overwrite a
--     trigger-stamped or previously backfilled date. Safe to rerun.
--   * The stamping trigger is `before insert or update OF STATUS`, and this
--     updates only completed_at, so the trigger does not fire and cannot
--     re-stamp these rows with now().
--   * Repair orders reference a vehicle by its label text, not by id, so the
--     join is on a normalised key. Any key matching more than one vehicle is
--     excluded rather than guessed at — currently none do, and the guard is
--     there so that stays true if two cars are later given the same name.
--   * One date per vehicle (the earliest close), so a car with several repair
--     orders is dated by the first time work on it finished, not by whichever
--     row the planner happened to reach first.
-- ============================================================================

BEGIN;

with vkeys as (
  -- Every string a repair order might name this vehicle by.
  select v.id, k.vkey
  from public.vehicles v
  cross join lateral (values
    (lower(regexp_replace(coalesce(v.label, ''), '[^a-zA-Z0-9]', '', 'g'))),
    (lower(regexp_replace(coalesce(v.plate, ''), '[^a-zA-Z0-9]', '', 'g'))),
    (lower(regexp_replace(coalesce(v.vin,   ''), '[^a-zA-Z0-9]', '', 'g')))
  ) as k(vkey)
  where k.vkey <> ''
),
key_counts as (
  select vkey, count(distinct id) as n
  from vkeys
  group by vkey
),
evidence as (
  select
    lower(regexp_replace(coalesce(r.vehicle, ''), '[^a-zA-Z0-9]', '', 'g')) as vkey,
    min(r.closed_date) as closed_at
  from public.repair_orders r
  where r.closed_date is not null
    and lower(regexp_replace(coalesce(r.vehicle, ''), '[^a-zA-Z0-9]', '', 'g')) <> ''
  group by 1
),
best as (
  -- One date per vehicle, so the result does not depend on join order.
  select vk.id, min(e.closed_at) as closed_at
  from vkeys vk
  join key_counts kc on kc.vkey = vk.vkey and kc.n = 1   -- unambiguous only
  join evidence  e  on e.vkey  = vk.vkey
  group by vk.id
)
update public.vehicles v
set completed_at = b.closed_at
from best b
where v.id = b.id
  and v.completed_at is null
  and v.status ilike '%complet%';

comment on column public.vehicles.completed_at is
  'When the work finished. Set by trigger when status becomes Completed; '
  'for work predating 2026-08-04 it may instead come from the vehicle''s '
  'closed repair order (2026-09-01 backfill). Still null where neither '
  'exists — those are dated by arrival in reports and flagged as such.';

COMMIT;


-- ── Verification ────────────────────────────────────────────────────────────

-- 1. Expect 15 remaining: the ones with no evidence. Was 18 before this ran.
SELECT count(*) AS completed_without_a_completion_date
FROM public.vehicles
WHERE status ILIKE '%complet%' AND completed_at IS NULL;

-- 2. The three this should have filled, with their arrival date beside the
--    completion date. Expect the Chevrolet to cross a month boundary, which
--    is the case a date_received backfill would have got wrong.
SELECT label, date_received::date AS arrived, completed_at::date AS completed
FROM public.vehicles
WHERE status ILIKE '%complet%'
  AND completed_at IS NOT NULL
  AND completed_at < timestamptz '2026-08-17'   -- before audit/trigger coverage
ORDER BY completed_at;

-- 3. Nothing was invented: no completion date may equal its own arrival date
--    purely because it was copied. Expect 0 rows other than genuine same-day
--    completions, which are real (the Faw closed the day it arrived).
SELECT count(*) AS completed_on_arrival_day
FROM public.vehicles
WHERE status ILIKE '%complet%'
  AND completed_at::date = date_received::date;
