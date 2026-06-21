-- Feature toggle columns for shop_settings
-- Run this in Supabase SQL editor
alter table shop_settings add column if not exists enable_job_archive boolean default true;
alter table shop_settings add column if not exists enable_vehicle_photos boolean default true;
alter table shop_settings add column if not exists enable_vehicle_edit boolean default true;
alter table shop_settings add column if not exists enable_technician_report boolean default true;
alter table shop_settings add column if not exists enable_job_completion_report boolean default true;
alter table shop_settings add column if not exists enable_appointment_bay boolean default true;
alter table shop_settings add column if not exists appointment_bays text[] default array['Bay 1','Bay 2','Bay 3','Bay 4','Mobile Route 1','Mobile Route 2','Depot Dispatch'];
