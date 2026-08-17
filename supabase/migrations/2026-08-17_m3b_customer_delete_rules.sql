-- M3b — stop customer deletion from detaching the rest of their history.
--
-- RUN AGAINST redlined1 AFTER the M3 application change is deployed, and after
-- M3a. Deploy order matters: this makes Delete fail for any customer with
-- history, so the app must already offer Archive instead.
--
-- The last five of seven. Deleting a customer today does not remove these
-- records — it blanks their customer_id, leaving an invoice, estimate or
-- repair order belonging to nobody. Afterwards there is no way to tell a
-- detached record from one that was never linked, which is why this is worth
-- closing rather than tolerating: the ambiguity is permanent.
--
--   estimates              n → r
--   inspections            n → r
--   invoices               n → r
--   maintenance_schedules  n → r
--   repair_orders          n → r
--
-- Already done: payments and vehicles (2026-08-17). vehicles was CASCADE, not
-- SET NULL — deleting one customer deleted all their vehicles, and
-- vehicle_images cascades from vehicles, so the photos went with them.
--
-- NOT changed: vehicle_images.vehicle_id stays CASCADE. A photo of a vehicle
-- has no meaning without the vehicle, so that one is correct as it is.
--
-- After this migration a customer with ANY history cannot be deleted. That is
-- the intended end state, and it is only reasonable because M3a and the
-- application change give staff Archive instead.

BEGIN;

ALTER TABLE public.estimates DROP CONSTRAINT IF EXISTS estimates_customer_id_fkey;
ALTER TABLE public.estimates
  ADD CONSTRAINT estimates_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.inspections DROP CONSTRAINT IF EXISTS inspections_customer_id_fkey;
ALTER TABLE public.inspections
  ADD CONSTRAINT inspections_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_customer_id_fkey;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.maintenance_schedules DROP CONSTRAINT IF EXISTS maintenance_schedules_customer_id_fkey;
ALTER TABLE public.maintenance_schedules
  ADD CONSTRAINT maintenance_schedules_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.repair_orders DROP CONSTRAINT IF EXISTS repair_orders_customer_id_fkey;
ALTER TABLE public.repair_orders
  ADD CONSTRAINT repair_orders_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
--
-- 1. All seven now restrict:
--
--   SELECT conrelid::regclass AS from_table, conname, confdeltype
--   FROM pg_constraint
--   WHERE confrelid = 'public.customers'::regclass AND contype = 'f'
--   ORDER BY conrelid::regclass::text;
--
--   Expect confdeltype = 'r' on all seven rows.
--
-- 2. A customer with history cannot be deleted (must FAIL, 23503):
--
--   BEGIN;
--   DELETE FROM public.customers WHERE id = (
--     SELECT customer_id FROM public.invoices WHERE customer_id IS NOT NULL LIMIT 1);
--   ROLLBACK;
--
-- 3. A customer with nothing attached still can be (must SUCCEED, then roll
--    back). If this FAILS, something outside this survey references customers:
--
--   BEGIN;
--   DELETE FROM public.customers c WHERE c.id = (
--     SELECT c2.id FROM public.customers c2
--     WHERE NOT EXISTS (SELECT 1 FROM public.vehicles      x WHERE x.customer_id = c2.id)
--       AND NOT EXISTS (SELECT 1 FROM public.invoices      x WHERE x.customer_id = c2.id)
--       AND NOT EXISTS (SELECT 1 FROM public.estimates     x WHERE x.customer_id = c2.id)
--       AND NOT EXISTS (SELECT 1 FROM public.inspections   x WHERE x.customer_id = c2.id)
--       AND NOT EXISTS (SELECT 1 FROM public.repair_orders x WHERE x.customer_id = c2.id)
--       AND NOT EXISTS (SELECT 1 FROM public.payments      x WHERE x.customer_id = c2.id)
--     LIMIT 1);
--   ROLLBACK;
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   Repeat each ALTER above with ON DELETE SET NULL in place of RESTRICT.
--   Nothing is lost by rolling back; the risk simply returns.
