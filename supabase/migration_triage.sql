-- ─────────────────────────────────────────────────────────────────────────────
-- Automotive Triage Engine — Database Migration
-- Table: triage_sessions
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.triage_sessions (
  id                      uuid primary key default gen_random_uuid(),
  shop_id                 uuid not null references public.shops(id) on delete cascade,

  -- Customer / vehicle context (stored as text — no FK constraint)
  customer_id             text,
  customer_name           text,
  vehicle_id              text,
  vehicle_make            text,
  vehicle_model           text,
  vehicle_year            text,
  vehicle_engine          text,
  vehicle_mileage         integer,
  vehicle_fuel_type       text,
  vehicle_transmission    text,

  -- Triage data
  category_id             text,
  answers                 jsonb default '{}'::jsonb,
  tech_notes              jsonb default '{}'::jsonb,
  complaint_summary       text,
  inspection_suggestions  text[] default array[]::text[],
  data_quality_score      integer default 0,

  -- Analytics
  intake_seconds          integer,            -- how long the intake took

  -- Lifecycle
  status                  text not null default 'draft'
                          check (status in ('draft', 'complete', 'converted')),
  job_card_id             text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Indexes
create index if not exists triage_sessions_shop_id_idx     on public.triage_sessions (shop_id);
create index if not exists triage_sessions_status_idx       on public.triage_sessions (status);
create index if not exists triage_sessions_category_id_idx  on public.triage_sessions (category_id);
create index if not exists triage_sessions_created_at_idx   on public.triage_sessions (created_at desc);

-- Row Level Security
alter table public.triage_sessions enable row level security;

create policy "triage_sessions_shop_isolation"
  on public.triage_sessions
  for all
  using (shop_id = (select shop_id from public.shop_users where user_id = auth.uid() limit 1));

-- Updated at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists triage_sessions_updated_at on public.triage_sessions;
create trigger triage_sessions_updated_at
  before update on public.triage_sessions
  for each row execute procedure public.set_updated_at();
