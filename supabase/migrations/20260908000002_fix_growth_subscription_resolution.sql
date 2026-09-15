-- =============================================================================
-- Sapelee Growth OS — corrected shop-level plan resolution (Phase H3.1).
--
-- RECONCILED INTO THIS REPO IN PHASE H3.2, AFTER THE FACT. Applied directly
-- to production via `supabase db push` from an external session on
-- 2026-09-08; this file was not present in this repository at the time.
-- Function bodies below are recovered verbatim from the live database via
-- `pg_get_functiondef()` and confirmed to match exactly (no drift).
--
-- WHY THE PREVIOUS VERSION WAS WRONG
-- 20260908000001 resolved plan/trial state via `profiles.shop_id`. Redlined1's
-- own code (lib/usePlan.ts) documents that this column is written by nothing:
-- "it is null on 16 of 17 profiles, including every D1 account — so the
-- bypass had never once fired." Verified in production: only 1 of 12 shops
-- resolved through it. The 1 that did was an internal/test shop with a
-- trial_ends_at of 2099-12-31, not a real signal.
--
-- THE REAL, LIVE AUTHORITY (verified by reading lib/planGate.ts, the function
-- Redlined1's own app calls to decide what a shop can access):
--
--   getPlanStatus(plan, trialEndsAt):
--     if plan is a paid plan  -> 'pro'      (checked FIRST: a stale trial
--                                             date must never demote a payer)
--     else if trialEndsAt > now() -> 'trial'
--     else -> 'free'
--
-- This reads `profiles.plan` / `profiles.trial_ends_at` directly — never
-- `subscriptions` (0 rows in production; built for an unshipped org-level
-- API-key billing feature per lib/api/entitlements.ts's own "M13.1" comment)
-- and never `profiles.billing_status` (write-only sync target from the Creem
-- webhook; getPlanStatus does not read it, and Redlined1's own test/comment
-- history documents it being stale — "read 'inactive' for all seventeen
-- profiles" at one point).
--
-- THE REAL MEMBERSHIP PATH: shop -> shop_users (role='owner') -> profiles
-- (profiles.id = shop_users.user_id). This is the mapping usePlan.ts itself
-- switched to for its internal-shop check, for the same documented reason.
--
-- MULTIPLE OWNERS — POLICY, NOT VERIFIED LIVE BEHAVIOR. Redlined1's live
-- per-user client code (usePlan.ts) never aggregates across co-owners at
-- all — it only ever looks at the CURRENTLY SIGNED-IN user's own profile.
-- There is no shipped shop-level rollup to mirror exactly. The closest
-- documented precedent is lib/api/entitlements.ts's ORGANIZATION-level
-- resolver (unshipped, 0-row subscriptions table, so never actually
-- exercised) which states: "the generous reading is correct — somebody in
-- this organization is paying for it." This migration adopts that same
-- policy at the shop grain (paid > trial > free, most generous wins) as the
-- most defensible available precedent, NOT as a claim that Redlined1 itself
-- currently resolves multi-owner shops this way.
--
-- INTERNAL SHOPS: the two UUIDs below are copied verbatim from
-- lib/usePlan.ts's `INTERNAL_SHOP_IDS` constant. There is no database table
-- for this — it is a hardcoded frontend set. If Redlined1 changes that set,
-- this migration goes stale and must be updated by hand; there is no way to
-- read it live from the database.
--
-- UNKNOWN IS NEVER COLLAPSED. A shop with no owner row, or owner row(s) with
-- no matching profile, reports 'UNKNOWN' — never silently 'FREE'.
-- =============================================================================

drop function if exists growth_subscription_summary_v1();
drop function if exists growth_funnel_summary_v1();

create function growth_subscription_summary_v1()
returns table (
  shop_id text,
  classification text,       -- INTERNAL | PAID | TRIAL | FREE | UNKNOWN
  effective_plan text,       -- best-known paid plan value, or null
  trial_ends_at timestamptz, -- best-known active trial end, or null
  owner_count bigint,
  owners_with_profile bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with owner_profiles as (
    select
      su.shop_id::text as shop_id,
      su.user_id::text as user_id,
      (p.id is not null) as has_profile,
      p.plan,
      p.trial_ends_at,
      -- Mirrors lib/planGate.ts's getPlanStatus() exactly.
      case
        when p.plan is not null
          and p.plan in ('pro','solo','starter','professional','business','enterprise')
          then 'PAID'
        when p.trial_ends_at is not null and p.trial_ends_at > now() then 'TRIAL'
        when p.id is not null then 'FREE'
        else null -- owner row exists, but no matching profiles row at all
      end as owner_status
    from shop_users su
    left join profiles p on p.id::text = su.user_id::text
    where su.role = 'owner'
  ),
  shop_rollup as (
    select
      s.id::text as shop_id,
      count(op.user_id) as owner_count,
      count(op.user_id) filter (where op.has_profile) as owners_with_profile,
      bool_or(op.owner_status = 'PAID') as any_paid,
      bool_or(op.owner_status = 'TRIAL') as any_trial,
      bool_or(op.owner_status = 'FREE') as any_free,
      max(op.plan) filter (where op.owner_status = 'PAID') as paid_plan,
      max(op.trial_ends_at) filter (where op.owner_status = 'TRIAL') as trial_end
    from shops s
    left join owner_profiles op on op.shop_id = s.id::text
    group by s.id
  )
  select
    shop_id,
    case
      -- Verbatim from lib/usePlan.ts's INTERNAL_SHOP_IDS. Keep in sync by hand.
      when shop_id in ('38d55fae-741b-4bac-b520-f96eed65bf38', '90b72748-bf01-4456-999f-f4ba48091606')
        then 'INTERNAL'
      when any_paid then 'PAID'
      when any_trial then 'TRIAL'
      when any_free then 'FREE'
      else 'UNKNOWN'
    end as classification,
    paid_plan as effective_plan,
    trial_end as trial_ends_at,
    coalesce(owner_count, 0) as owner_count,
    coalesce(owners_with_profile, 0) as owners_with_profile
  from shop_rollup;
$$;

comment on function growth_subscription_summary_v1() is
  'Sapelee Growth OS read-only reporting interface (Phase H3.1 correction). SECURITY DEFINER. Resolves plan/trial state via shop_users(role=owner) -> profiles, mirroring lib/planGate.ts''s getPlanStatus() exactly. UNKNOWN is a first-class, never-collapsed state for a shop with no resolvable owner/profile evidence. No email, no user_id, no payment-provider identifier ever leaves this function''s SELECT list.';

create function growth_funnel_summary_v1()
returns table (
  total_shops bigint,
  internal_shops bigint,
  eligible_shops bigint,
  known_plan_shops bigint,
  unknown_plan_shops bigint,
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
    count(*) filter (where a.first_appointment_at is not null) as shops_with_appointment,
    count(*) filter (where a.first_job_completed_at is not null) as shops_with_completed_job,
    count(*) filter (where sub.classification = 'TRIAL') as trial_shops,
    count(*) filter (where sub.classification = 'PAID') as paid_shops,
    count(*) filter (where sub.classification = 'FREE') as free_shops
  from growth_shop_activation_v1() a
  join growth_subscription_summary_v1() sub on sub.shop_id = a.shop_id;
$$;

comment on function growth_funnel_summary_v1() is
  'SUPERSEDED by 20260908000003_fix_growth_activation_signal.sql — kept here only so local migration history matches production. Do not use this version''s appointment/closed_job-only activation logic as a reference.';

-- No grant changes needed: sapelee_growth_reader already has EXECUTE on both
-- function names from 20260908000001 (CREATE OR REPLACE preserves existing
-- grants on the same name/signature). Re-stated explicitly, not assumed:
grant execute on function growth_subscription_summary_v1() to sapelee_growth_reader;
grant execute on function growth_funnel_summary_v1() to sapelee_growth_reader;

-- NOTE (found in Phase H3.2, fixed in 20260908000003): the DROP FUNCTION +
-- CREATE FUNCTION pair above re-grants EXECUTE to PUBLIC by default (a fresh
-- CREATE FUNCTION always does, regardless of what the dropped function's
-- grants were). This migration did not revoke it either. Fixed in
-- 20260908000003_fix_growth_activation_signal.sql.
