-- =============================================================================
-- Sapelee Growth OS — read-only reporting interface for Redlined1.
--
-- RECONCILED INTO THIS REPO IN PHASE H3.2, AFTER THE FACT. Applied directly
-- to production via `supabase db push` from an external session on
-- 2026-09-08; this file was not present in this repository at the time.
-- Function bodies below are recovered verbatim from the live database via
-- `pg_get_functiondef()` and confirmed to match exactly (no drift) — this is
-- not a reconstruction from memory.
--
-- SECURITY BOUNDARY (why SECURITY DEFINER, not a plain role + views):
-- Every relevant table's RLS policy here (customers, vehicles, job_cards,
-- repair_orders, invoices, profiles) is `to authenticated using (true)` —
-- tenant isolation is enforced in Redlined1's own application code via
-- `.eq('shop_id', ...)`, NOT by row-level filtering in Postgres. A plain
-- custom login role has no `authenticated`/JWT membership, so a
-- security_invoker view would return zero rows; granting `authenticated` to
-- a new role would give it the exact same unrestricted access any logged-in
-- user already has — no reduction at all. SECURITY DEFINER functions run
-- with THIS MIGRATION'S OWN privilege regardless of the caller's RLS
-- standing, so the caller (sapelee_growth_reader) needs nothing but EXECUTE
-- on these three functions — never SELECT on any base table, ever.
--
-- What is exposed: shop-level aggregate counts and timestamps only. No
-- customer/vehicle/job row, no name, email, phone, address, VIN, plate,
-- make, model, technician name, or free-text note ever leaves these
-- functions' own SELECT lists.
--
-- SUPERSEDED CONTENT, KEPT FOR HISTORY:
--   growth_subscription_summary_v1() and growth_funnel_summary_v1() below
--   are the ORIGINAL, INCORRECT versions — they resolved plan/trial state
--   via `profiles.shop_id`, a column Redlined1's own code documents as
--   written by nothing ("null on 16 of 17 profiles"). Corrected in
--   20260908000002_fix_growth_subscription_resolution.sql. Do not use this
--   version's subscription-resolution logic as a reference.
--
-- Known, documented gaps at the time this migration was written:
--   - customers and vehicles have NO created_at column in this schema, so
--     "first customer added" / "first vehicle added" are NOT computable
--     here. Adding a Redlined1-side created_at column is the correct fix,
--     not a guess from another field.
--   - subscriptions has 0 rows in production as of this migration; profiles
--     is the table actually populated. This function prefers subscriptions
--     when present (forward-compatible) and falls back to profiles.
--   - shops.id and the shop_id foreign-key columns on other tables are not
--     the same Postgres type (discovered when the first apply attempt
--     failed with "operator does not exist: text = uuid") -- every join
--     below casts both sides to ::text explicitly rather than assume which
--     side is which type.
-- =============================================================================

create or replace function growth_shop_activation_v1()
returns table (
  shop_id text,
  shop_created_at timestamptz,
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
    min(a.created_at) as first_appointment_at,
    min(cj.closed_date) as first_job_completed_at,
    greatest(
      coalesce(max(a.created_at), 'epoch'::timestamptz),
      coalesce(max(cj.closed_date), 'epoch'::timestamptz)
    ) as last_activity_at
  from shops s
  left join appointments a on a.shop_id::text = s.id::text
  left join closed_jobs cj on cj.shop_id::text = s.id::text
  group by s.id, s.created_at;
$$;

comment on function growth_shop_activation_v1() is
  'Sapelee Growth OS read-only reporting interface. SECURITY DEFINER: runs with this migration owner''s privilege so the calling role (sapelee_growth_reader) never needs base-table access. Exposes shop_id + aggregate timestamps only — no row-level customer/vehicle/job data.';

create or replace function growth_subscription_summary_v1()
returns table (
  shop_id text,
  subscription_state text,
  plan text,
  trial_ends_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.shop_id::text as shop_id,
    coalesce(
      sub.status,
      p.billing_status,
      case when p.trial_ends_at is not null and p.trial_ends_at > now() then 'trialing' else 'expired' end
    ) as subscription_state,
    coalesce(sub.plan_id, p.plan) as plan,
    coalesce(sub.trial_end, p.trial_ends_at) as trial_ends_at
  from profiles p
  left join subscriptions sub
    on sub.user_id::text = p.id::text
    and sub.status in ('active', 'trialing', 'past_due')
  where p.shop_id is not null;
$$;

comment on function growth_subscription_summary_v1() is
  'SUPERSEDED by 20260908000002_fix_growth_subscription_resolution.sql — kept here only so local migration history matches what is actually recorded as applied in production. Do not use this version''s logic as a reference.';

create or replace function growth_funnel_summary_v1()
returns table (
  total_shops bigint,
  shops_with_appointment bigint,
  shops_with_completed_job bigint,
  trialing_shops bigint,
  paid_shops bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) as total_shops,
    count(*) filter (where a.first_appointment_at is not null) as shops_with_appointment,
    count(*) filter (where a.first_job_completed_at is not null) as shops_with_completed_job,
    count(*) filter (where s.subscription_state = 'trialing') as trialing_shops,
    count(*) filter (where s.subscription_state = 'active') as paid_shops
  from growth_shop_activation_v1() a
  left join growth_subscription_summary_v1() s on s.shop_id = a.shop_id;
$$;

comment on function growth_funnel_summary_v1() is
  'SUPERSEDED by 20260908000002_fix_growth_subscription_resolution.sql — kept here only so local migration history matches production. Do not use this version''s logic as a reference.';

-- --- Restricted caller: EXECUTE on these three functions, nothing else ------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'sapelee_growth_reader') then
    create role sapelee_growth_reader with login;
  end if;
end
$$;

revoke all on schema public from sapelee_growth_reader;
grant usage on schema public to sapelee_growth_reader;
grant execute on function growth_shop_activation_v1() to sapelee_growth_reader;
grant execute on function growth_subscription_summary_v1() to sapelee_growth_reader;
grant execute on function growth_funnel_summary_v1() to sapelee_growth_reader;

-- Explicit, not assumed: confirm no table/schema-level grant exists for this role.
revoke all on all tables in schema public from sapelee_growth_reader;
revoke all on all functions in schema public from sapelee_growth_reader;
grant execute on function growth_shop_activation_v1() to sapelee_growth_reader;
grant execute on function growth_subscription_summary_v1() to sapelee_growth_reader;
grant execute on function growth_funnel_summary_v1() to sapelee_growth_reader;

-- NOTE (found in Phase H3.2, fixed in 20260908000003): CREATE FUNCTION grants
-- EXECUTE to PUBLIC by default unless explicitly revoked. This migration did
-- not revoke it. Do not treat this file as a template for future functions
-- without adding that revoke.
