-- ═══════════════════════════════════════════════════════════════
-- FLAT-RATE LABOR TIMES — Owner-Only Confidential Data
-- Run in Supabase SQL Editor with Role: postgres
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Labor times lookup table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.labor_times (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  make          TEXT NOT NULL DEFAULT '*',     -- '*' = universal (all makes)
  model         TEXT NOT NULL DEFAULT '*',     -- '*' = universal (all models)
  year_from     INT  NOT NULL DEFAULT 1990,
  year_to       INT  NOT NULL DEFAULT 2099,
  service_type  TEXT NOT NULL,                 -- "Brake Pads Front", "Oil Change", etc.
  dtc_code      TEXT,                          -- Optional DTC code (e.g., P0420)
  suggested_hours NUMERIC(5,2) NOT NULL,
  notes         TEXT,
  source        TEXT NOT NULL DEFAULT 'internal',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Lock down direct client access — only accessible via service-role API route
ALTER TABLE public.labor_times ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "labor_times_deny_all" ON public.labor_times;
CREATE POLICY "labor_times_deny_all" ON public.labor_times
  FOR ALL TO authenticated USING (false);

-- ── 2. Add owner-only columns to repair_orders ───────────────────
ALTER TABLE public.repair_orders
  ADD COLUMN IF NOT EXISTS suggested_hours  NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS flat_rate_cost   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS labor_source     TEXT,
  ADD COLUMN IF NOT EXISTS labor_lookup_at  TIMESTAMPTZ;

-- ── 3. Index for fast lookups ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_labor_times_service ON public.labor_times (service_type);
CREATE INDEX IF NOT EXISTS idx_labor_times_make    ON public.labor_times (make, model);

-- ── 4. Seed universal labor times (60 common operations) ─────────
INSERT INTO public.labor_times (make, model, year_from, year_to, service_type, suggested_hours, notes) VALUES
  -- Maintenance
  ('*','*',1990,2099,'Oil Change',              0.5,  'Standard drain, fill, filter replace'),
  ('*','*',1990,2099,'Tire Rotation',            0.5,  'Includes torque check'),
  ('*','*',1990,2099,'Wheel Alignment',          1.0,  '4-wheel alignment on rack'),
  ('*','*',1990,2099,'Air Filter',               0.3,  'Engine air filter'),
  ('*','*',1990,2099,'Cabin Air Filter',         0.5,  'Includes dash disassembly if needed'),
  ('*','*',1990,2099,'Wiper Blades',             0.3,  'Both front blades'),
  ('*','*',1990,2099,'Fuel Filter',              1.0,  'In-line or under-hood'),
  ('*','*',1990,2099,'Coolant Flush',            1.0,  'Full system drain and refill'),
  ('*','*',1990,2099,'Transmission Fluid',       0.8,  'Drain and fill only'),
  ('*','*',1990,2099,'Transmission Service',     1.5,  'Full service with filter and pan'),
  ('*','*',1990,2099,'Differential Service',     0.8,  'Drain and fill'),
  ('*','*',1990,2099,'Transfer Case Service',    0.8,  'Drain and fill'),
  ('*','*',1990,2099,'Power Steering Flush',     0.5,  'Full system flush'),
  -- Brakes
  ('*','*',1990,2099,'Brake Pads Front',         1.5,  'Both sides, does not include rotors'),
  ('*','*',1990,2099,'Brake Pads Rear',          1.5,  'Both sides, does not include rotors'),
  ('*','*',1990,2099,'Brake Rotors Front',       2.0,  'Includes pads replacement'),
  ('*','*',1990,2099,'Brake Rotors Rear',        2.0,  'Includes pads replacement'),
  ('*','*',1990,2099,'Brake Flush',              0.5,  'Full system bleed'),
  ('*','*',1990,2099,'Brake Caliper',            2.0,  'Per caliper, includes bleed'),
  -- Electrical
  ('*','*',1990,2099,'Battery Replacement',      0.5,  'Includes terminal cleaning'),
  ('*','*',1990,2099,'Alternator',               2.0,  'Includes belt check'),
  ('*','*',1990,2099,'Starter Motor',            2.0,  'Average — some vehicles longer'),
  ('*','*',1990,2099,'Headlight Bulb',           0.5,  'Per light; some require fascia removal'),
  ('*','*',1990,2099,'Headlight Assembly',       1.5,  'Per side'),
  ('*','*',1990,2099,'Power Window Regulator',   1.5,  'Per door'),
  ('*','*',1990,2099,'Door Lock Actuator',       1.0,  'Per door'),
  -- Ignition / Fuel
  ('*','*',1990,2099,'Spark Plugs 4-cyl',        1.0,  '4 plugs'),
  ('*','*',1990,2099,'Spark Plugs 6-cyl',        1.5,  '6 plugs'),
  ('*','*',1990,2099,'Spark Plugs 8-cyl',        2.5,  '8 plugs, may require intake removal'),
  ('*','*',1990,2099,'Coil Pack',                0.8,  'Per coil'),
  ('*','*',1990,2099,'Fuel Pump',                3.5,  'Tank drop required'),
  ('*','*',1990,2099,'Fuel Injector Cleaning',   1.0,  'On-car service'),
  ('*','*',1990,2099,'Oxygen Sensor',            1.0,  'Per sensor; may require special socket'),
  -- Cooling
  ('*','*',1990,2099,'Thermostat',               1.5,  'Includes coolant top-up'),
  ('*','*',1990,2099,'Water Pump',               3.0,  'Add 1.5hr if timing belt driven'),
  ('*','*',1990,2099,'Radiator Replacement',     2.5,  'Includes flush'),
  -- Belts / Timing
  ('*','*',1990,2099,'Serpentine Belt',          0.8,  'Includes tensioner inspection'),
  ('*','*',1990,2099,'Timing Belt',              4.5,  'Includes water pump and tensioners'),
  ('*','*',1990,2099,'Timing Chain',             6.0,  'Includes guides and tensioners'),
  -- AC / HVAC
  ('*','*',1990,2099,'AC Recharge',              0.5,  'Refrigerant recharge only'),
  ('*','*',1990,2099,'AC Compressor',            3.5,  'Includes evacuate and recharge'),
  ('*','*',1990,2099,'AC Condenser',             2.5,  'Includes evacuate and recharge'),
  ('*','*',1990,2099,'AC Evaporator',            6.0,  'Requires dash removal'),
  -- Exhaust / Emissions
  ('*','*',1990,2099,'Catalytic Converter',      2.5,  'Includes exhaust gaskets'),
  ('*','*',1990,2099,'Muffler',                  1.5,  'Bolt-on replacement'),
  ('*','*',1990,2099,'Exhaust Manifold',         3.0,  'Includes gaskets and studs'),
  ('*','*',1990,2099,'EGR Valve',                1.5,  'Includes cleaning ports'),
  -- Drivetrain
  ('*','*',1990,2099,'CV Axle Front',            2.0,  'Per side'),
  ('*','*',1990,2099,'CV Boot',                  1.5,  'Per side'),
  ('*','*',1990,2099,'Clutch',                   5.0,  'Includes flywheel inspection'),
  -- Suspension / Steering
  ('*','*',1990,2099,'Wheel Bearing Front',      2.0,  'Hub assembly replacement'),
  ('*','*',1990,2099,'Wheel Bearing Rear',       2.0,  'Hub assembly replacement'),
  ('*','*',1990,2099,'Control Arm Front',        1.5,  'Per side — includes alignment'),
  ('*','*',1990,2099,'Ball Joint',               2.0,  'Per joint'),
  ('*','*',1990,2099,'Tie Rod End',              1.5,  'Per side — includes alignment'),
  ('*','*',1990,2099,'Sway Bar Links',           0.8,  'Per side'),
  ('*','*',1990,2099,'Struts/Shocks Front',      2.5,  'Per side'),
  ('*','*',1990,2099,'Struts/Shocks Rear',       2.0,  'Per side'),
  -- Engine
  ('*','*',1990,2099,'Engine Mounts',            2.0,  'Per mount'),
  ('*','*',1990,2099,'Valve Cover Gasket',       1.5,  'Per cover'),
  ('*','*',1990,2099,'Head Gasket',              8.0,  'Major — may require machine shop'),
  ('*','*',1990,2099,'Intake Manifold Gasket',   3.0,  'Includes throttle body cleaning'),
  ('*','*',1990,2099,'Oil Pan Gasket',           3.5,  'Includes drain and refill'),
  -- Diagnostic / Inspection
  ('*','*',1990,2099,'Diagnostic',               1.0,  'Scan tool + visual inspection'),
  ('*','*',1990,2099,'Pre-Purchase Inspection',  1.5,  'Full vehicle walk-around and test')
ON CONFLICT DO NOTHING;

-- ── 5. Verify ─────────────────────────────────────────────────────
SELECT 'labor_times rows:' AS step, COUNT(*)::text AS result FROM public.labor_times;
SELECT 'repair_orders columns:' AS step, column_name AS result
  FROM information_schema.columns
  WHERE table_name = 'repair_orders'
    AND column_name IN ('suggested_hours','flat_rate_cost','labor_source','labor_lookup_at');
