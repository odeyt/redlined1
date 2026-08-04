-- Vehicles record when they arrived, never when they were finished.
--
-- The monthly completion report filtered completed vehicles by date_received,
-- so a car booked in on 28 June and finished on 3 July counted towards June and
-- was absent from July. Every month was wrong by however much work crossed a
-- month boundary, which for longer jobs is most of it.
--
-- A trigger stamps completed_at when the status becomes a completed one, and
-- clears it if the vehicle is reopened — a car sent back to the floor is not
-- completed, and leaving a stale date would count it in two months at once.

alter table public.vehicles
  add column if not exists completed_at timestamptz;

comment on column public.vehicles.completed_at is
  'Set by trigger when status becomes Completed. Null for work finished before 2026-08-04, which can only be dated by date_received.';

create or replace function public.stamp_vehicle_completed_at()
returns trigger
language plpgsql
as $$
begin
  -- ilike '%complet%' matches the same shapes the reports already treat as
  -- finished ('Completed', 'Complete'), rather than inventing a stricter rule
  -- here that would silently disagree with them.
  if new.status ilike '%complet%' and (old.status is null or not (old.status ilike '%complet%')) then
    new.completed_at := now();
  elsif not (new.status ilike '%complet%') then
    new.completed_at := null;
  end if;
  return new;
end
$$;

drop trigger if exists vehicles_stamp_completed_at on public.vehicles;

create trigger vehicles_stamp_completed_at
  before insert or update of status on public.vehicles
  for each row
  execute function public.stamp_vehicle_completed_at();

-- Deliberately no backfill. Setting completed_at = date_received for the
-- existing 18 completed vehicles would reproduce the exact error this removes,
-- and would be indistinguishable from a real completion date afterwards.
-- The UI falls back to date_received for these and says so.

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.vehicles'::regclass
       and tgname = 'vehicles_stamp_completed_at'
  ) then
    raise exception 'vehicles_stamp_completed_at did not attach';
  end if;
end $$;
