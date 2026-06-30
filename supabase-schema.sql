-- Redlined1 CRM — Full Database Schema
-- Run this in Supabase > SQL Editor > New Query > Paste > Run

-- USERS
create table if not exists users (
  id text primary key,
  name text not null,
  email text not null unique,
  role text not null,
  status text not null default 'Active',
  last_login text
);

-- CUSTOMERS
create table if not exists customers (
  id text primary key,
  name text not null,
  type text,
  phone text,
  email text,
  address text,
  tags text[] default '{}',
  follow_up text
);

-- VEHICLES
create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id text references customers(id) on delete cascade,
  vin text,
  label text,
  trim text,
  engine text,
  transmission text,
  mileage text,
  plate text,
  status text,
  recommendation text
);

-- JOB CARDS
create table if not exists job_cards (
  id text primary key,
  ro text,
  invoice text,
  customer text,
  vehicle text,
  service_type text,
  channel text,
  location text,
  technician text,
  status text,
  priority text,
  approval text,
  labor_hours numeric default 0,
  parts_total numeric default 0,
  workflow text[] default '{}',
  next_action text,
  notes text default '',
  created_at timestamptz default now()
);

-- REPAIR ORDERS
create table if not exists repair_orders (
  ro text primary key,
  job_card text references job_cards(id) on delete cascade,
  customer text,
  vehicle text,
  concern text,
  cause text,
  correction text,
  tech text,
  status text,
  approval text,
  total numeric default 0,
  created_at timestamptz default now()
);

-- APPOINTMENTS
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  time_slot text,
  customer text,
  vehicle text,
  service text,
  job_card text,
  location text,
  status text,
  created_at timestamptz default now()
);

-- INVOICES
create table if not exists invoices (
  number text primary key,
  job_card text references job_cards(id) on delete set null,
  customer text,
  vehicle text,
  status text default 'Draft',
  lines jsonb default '[]',
  discount numeric default 0,
  shop_supplies numeric default 0,
  tax_rate numeric default 0.0825,
  created_at timestamptz default now()
);

-- MESSAGES
create table if not exists messages (
  id text primary key,
  customer text,
  channel text,
  subject text,
  status text,
  body text,
  created_at timestamptz default now()
);

-- INSPECTIONS
create table if not exists inspections (
  id text primary key,
  job_card text references job_cards(id) on delete cascade,
  vehicle text,
  technician text,
  status text,
  items jsonb default '[]',
  created_at timestamptz default now()
);

-- ESTIMATES
create table if not exists estimates (
  id text primary key,
  job_card text references job_cards(id) on delete cascade,
  customer text,
  vehicle text,
  status text,
  total numeric default 0,
  lines text[] default '{}',
  created_at timestamptz default now()
);

-- TECHNICIAN TASKS
create table if not exists technician_tasks (
  id text primary key,
  job_card text references job_cards(id) on delete cascade,
  technician text,
  task text,
  status text,
  time text,
  created_at timestamptz default now()
);

-- PAYMENTS
create table if not exists payments (
  id text primary key,
  invoice text references invoices(number) on delete set null,
  customer text,
  amount numeric default 0,
  method text,
  status text,
  date text,
  created_at timestamptz default now()
);

-- AUDIT LOGS
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text,
  "user" text,
  entity text,
  time text,
  created_at timestamptz default now()
);

-- PARTS
create table if not exists parts (
  part_number text primary key,
  brand text,
  description text,
  category text,
  cost numeric default 0,
  retail numeric default 0,
  quantity integer default 0,
  supplier text,
  location text,
  low_stock_threshold integer default 5,
  compatibility text
);
