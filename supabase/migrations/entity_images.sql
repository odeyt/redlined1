-- Run this in Supabase SQL Editor
-- Creates a generic images table for Job Cards, Repair Orders, and Appointments

create table if not exists entity_images (
  id          uuid        primary key default gen_random_uuid(),
  entity_type text        not null,   -- 'job_card' | 'repair_order' | 'appointment'
  entity_id   text        not null,
  shop_id     text,
  url         text        not null,
  label       text        not null default '',
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists entity_images_entity_idx
  on entity_images (entity_type, entity_id);

alter table entity_images enable row level security;

-- Permissive policy — app enforces shop isolation at the service layer
create policy "authenticated users can manage entity images"
  on entity_images for all
  to authenticated
  using (true)
  with check (true);
