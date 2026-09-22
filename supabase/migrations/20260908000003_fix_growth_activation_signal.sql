-- =============================================================================
-- Sapelee Growth OS — corrected activation signal (Phase H3.2).
--
-- RECONCILED INTO THIS REPO IN PHASE H3.2, SAME PHASE IT WAS APPLIED. Applied
-- directly to production via `supabase db push` from an external session on
-- 2026-09-08. Function bodies below are recovered verbatim from the live
-- database via `pg_get_functiondef()` and confirmed to match exactly.
--
-- WHY THE PREVIOUS VERSION UNDER-COUNTED ACTIVATION
-- 20260908000001 used `closed_jobs` alone as the "job" signal. Traced the
-- actual code (services/jobCardService.ts, confirmed by
-- lib/__tests__/jobCardAutoInvoice.test.ts's own doc comment — "over three
-- days, eight jobs were closed through Job Cards and not a single repair
-- order changed status"):
--
--   createJobCard()  -> INSERTs into job_cards.        (the real "job created")
--   closeJob()       -> INSERTs into closed_jobs, THEN DELETES the job_cards
--                        row. closed_jobs.created_at is explicitly set to
--                        `job.checkInDate` (the ORIGINAL creation time, not
--                        the archival time) — closed_jobs.closed_date is the
--                        true completion time.
--
-- So `job_cards` holds only CURRENTLY-OPEN jobs (a snapshot, not a
-- cumulative count), and a shop with real, active, in-progress work but no
-- CLOSED job yet was invisible to the old signal. Verified in production:
-- among the 10 eligible shops, job_cards covers 3, closed_jobs covers 0.
--
-- `repair_orders` is CONFIRMED DEAD as a completion signal — the same test's
-- doc comment states real ROs are created but their status never progresses
-- in practice ("ro_status_events — trigger attached and verified — held
-- zero rows the entire time"). Excluded entirely, not just deprioritized.
--
-- `appointments` remains a separate, legitimate but independent signal (a
-- scheduling feature, not a prerequisite to job_cards) — kept, but not used
-- as the primary activation event; it has weaker coverage (1/10 eligible)
-- than job creation (3/10) and confirmed no code path makes it a
-- prerequisite for job_cards.
--
-- CORRECTED PRIMARY ACTIVATION EVENT: "first job created" = the earliest of
-- (a) a still-open job_cards row for the shop, or (b) a closed_jobs row's
-- preserved original created_at (covers jobs that have since been closed,
-- whose job_cards row no longer exists). This is UNION-based specifically
-- so a shop's activation evidence is never lost just because its job was
-- later closed.
--
-- SECOND FIX, FOUND DURING THIS AUDIT (unrelated to activation signal):
-- Postgres grants EXECUTE to PUBLIC by default on every new function unless
-- explicitly revoked. 20260908000001/000002 revoked ALL privileges from
-- sapelee_growth_reader defensively but never revoked PUBLIC's own default
-- grant — confirmed live via information_schema.routine_privileges showing
-- PUBLIC:EXECUTE on all three functions. Fixed below. This does not expose
-- any new data (the functions return only shop-level aggregates, no PII —
-- verified in Phase H3.1's forbidden-column check), but it is not the
-- least-privilege posture the design promised, so it is corrected here.
-- =============================================================================

-- Return signature changes (new column added) — CREATE OR REPLACE cannot do
-- this; Postgres requires the old function dropped first. Safe: drops only
-- the function, never a table/row; grants restated immediately below.
drop function if exists growth_shop_activation_v1();
drop function if exists growth_funnel_summary_v1();

create function growth_shop_activation_v1()
returns table (
  shop_id text,
  shop_created_at timestamptz,
  first_job_created_at timestamptz,
  first_appointment_at timestamptz,
  first_job_completed_at timestamptz,
  last_activity_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id::text as shop_id,
    s.created_at as shop_created_at,
    least(
      min(jc.created_at),
      min(jc.check_in_date),
      min(cj.created_at)  -- preserves the ORIGINAL job creation time even once closed/archived
    ) as first_job_created_at,
    min(a.created_at) as first_appointment_at,
    min(cj.closed_date) as first_job_completed_at,
    greatest(
      coalesce(max(jc.created_at), 'epoch'::timestamptz),
      coalesce(max(a.created_at), 'epoch'::timestamptz),
      coalesce(max(cj.closed_date), 'epoch'::timestamptz)
    ) as last_activity_at
  from shops s
  left join job_cards jc on jc.shop_id::text = s.id::text
  left join appointments a on a.shop_id::text = s.id::text
  left join closed_jobs cj on cj.shop_id::text = s.id::text
  group by s.id, s.created_at;
$$;

comment on function growth_shop_activation_v1() is
  'Sapelee Growth OS read-only reporting interface (Phase H3.2 correction). SECURITY DEFINER. Primary activation signal is first_job_created_at (job_cards UNION closed_jobs.created_at, verified by tracing services/jobCardService.ts) — NOT appointments or repair_orders, both confirmed unsuitable. No customer/vehicle/technician row data, no repair_orders reference at all (confirmed dead workflow).';

create function growth_funnel_summary_v1()
returns table (
  total_shops bigint,
  internal_shops bigint,
  eligible_shops bigint,
  known_plan_shops bigint,
  unknown_plan_shops bigint,
  shops_with_job_created bigint,
  shops_with_appointment bigint,
  shops_with_completed_job bigint,
  trial_shops bigint,
  paid_shops bigint,
  free_shops bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) as total_shops,
    count(*) filter (where sub.classification = 'INTERNAL') as internal_shops,
    count(*) filter (where sub.classification != 'INTERNAL') as eligible_shops,
    count(*) filter (where sub.classification in ('PAID','TRIAL','FREE')) as known_plan_shops,
    count(*) filter (where sub.classification = 'UNKNOWN') as unknown_plan_shops,
    count(*) filter (where a.first_job_created_at is not null) as shops_with_job_created,
    count(*) filter (where a.first_appointment_at is not null) as shops_with_appointment,
    count(*) filter (where a.first_job_completed_at is not null) as shops_with_completed_job,
    count(*) filter (where sub.classification = 'TRIAL') as trial_shops,
    count(*) filter (where sub.classification = 'PAID') as paid_shops,
    count(*) filter (where sub.classification = 'FREE') as free_shops
  from growth_shop_activation_v1() a
  join growth_subscription_summary_v1() sub on sub.shop_id = a.shop_id;
$$;

comment on function growth_funnel_summary_v1() is
  'Sapelee Growth OS read-only reporting interface (Phase H3.2 correction). SECURITY DEFINER. Adds shops_with_job_created (the corrected primary activation metric) alongside the existing breakdown.';

-- --- Security fix: PUBLIC must not have EXECUTE on these functions ----------
revoke execute on function growth_shop_activation_v1() from public;
revoke execute on function growth_subscription_summary_v1() from public;
revoke execute on function growth_funnel_summary_v1() from public;

-- Re-state EXECUTE for the one intended caller (CREATE OR REPLACE preserves
-- prior grants on unchanged functions, but stated explicitly, not assumed,
-- for all three since two of them just had their signature replaced).
grant execute on function growth_shop_activation_v1() to sapelee_growth_reader;
grant execute on function growth_subscription_summary_v1() to sapelee_growth_reader;
grant execute on function growth_funnel_summary_v1() to sapelee_growth_reader;
