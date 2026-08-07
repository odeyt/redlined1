-- Archiving a vehicle must not erase when it was completed.
--
-- The trigger added earlier today cleared completed_at for any status that was
-- not a completed one. Archived is not a completed one, and Completed →
-- Archived is the normal end of a job — so filing finished work away would
-- silently drop it out of every monthly report. That is exactly the "archiving
-- deletes records" the shop described.
--
-- Nothing has been lost yet: no vehicle carries a completed_at, because the
-- original migration deliberately did not backfill. This lands before the first
-- job completes under it.
--
-- The date is now cleared only when a vehicle genuinely returns to the floor.
-- Archived, Void and similar filing states preserve it, because a car sitting
-- in the archive was still completed on the day it was completed.

create or replace function public.stamp_vehicle_completed_at()
returns trigger
language plpgsql
as $$
declare
  -- Statuses that mean "this car is being worked on again". Anything else is a
  -- filing state and leaves the completion date alone. Listing the reopening
  -- statuses rather than the filing ones is the safer default: a status added
  -- later is treated as filing and preserves history, instead of silently
  -- destroying it the first time someone uses it.
  reopened constant text[] := array[
    'in progress', 'pending parts', 'pending approval', 'pending',
    'active', 'returned job', 'no open jobs'
  ];
begin
  if new.status ilike '%complet%' and (old.status is null or not (old.status ilike '%complet%')) then
    new.completed_at := now();
  elsif lower(coalesce(new.status, '')) = any (reopened) then
    new.completed_at := null;
  end if;
  -- Every other status — Archived, Void, anything unrecognised — keeps whatever
  -- completed_at already held.
  return new;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.vehicles'::regclass
       and tgname = 'vehicles_stamp_completed_at'
  ) then
    raise exception 'vehicles_stamp_completed_at is missing';
  end if;
end $$;
