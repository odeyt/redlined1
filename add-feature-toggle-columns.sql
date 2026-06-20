-- Feature toggle columns for shop_settings
-- Run this in Supabase SQL editor
alter table shop_settings add column if not exists enable_job_archive boolean default true;
alter table shop_settings add column if not exists enable_vehicle_photos boolean default true;
alter table shop_settings add column if not exists enable_vehicle_edit boolean default true;
alter table shop_settings add column if not exists enable_technician_report boolean default true;
alter table shop_settings add column if not exists enable_job_completion_report boolean default true;
