-- Stop deleting a customer from detaching their payments.
--
-- RUN AGAINST redlined1, after the application change is deployed.
--
-- The companion to the invoice fix in 2026-08-17_m2_payment_ledger.sql.
-- `payments_customer_id_fkey` is ON DELETE SET NULL (confdeltype = 'n'), so
-- deleting a customer does not delete their payments — it blanks
-- `payments.customer_id` and leaves the money in the ledger belonging to
-- nobody.
--
-- Five payments already have no customer link. After the fact there is no way
-- to tell whether those were recorded without a customer or detached by this
-- rule, which is itself the argument for changing it: the ambiguity is
-- permanent once it happens.
--
-- RESTRICT instead. A customer who has ever paid can no longer be deleted.
--
-- That IS a workflow change and it is worth being plain about: the tidy-up
-- action staff currently have is now refused for exactly the customers whose
-- history matters most. The right long-term answer is an archive/inactive
-- flag so the list can still be cleaned without destroying records — that is
-- its own piece of work, and blocking silent data loss should not wait for it.
-- The domain layer translates the resulting 23503 into a sentence that says
-- what to do instead.
--
-- NOT addressed here: other tables referencing customers (vehicles, invoices,
-- job_cards) have their own delete rules, which have not been surveyed. If any
-- of them CASCADE, deleting a customer already destroys more than it appears
-- to. Worth a look; out of scope for this change, which only stops payments
-- being orphaned.

BEGIN;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_customer_id_fkey;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
--
-- 1. The rule changed:
--
--   SELECT conname, confdeltype FROM pg_constraint
--   WHERE conrelid = 'public.payments'::regclass AND contype = 'f'
--   ORDER BY conname;
--
--   Expect payments_customer_id_fkey = 'r' and
--          payments_invoice_number_fkey = 'r'.
--
-- 2. A customer with payments cannot be deleted (must FAIL with 23503):
--
--   BEGIN;
--   DELETE FROM public.customers WHERE id = (
--     SELECT customer_id FROM public.payments
--     WHERE customer_id IS NOT NULL LIMIT 1);
--   ROLLBACK;
--
-- 3. A customer with no payments still can be (must SUCCEED, then roll back):
--
--   BEGIN;
--   DELETE FROM public.customers WHERE id = (
--     SELECT c.id FROM public.customers c
--     WHERE NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.customer_id = c.id)
--     LIMIT 1);
--   ROLLBACK;
--
--   If step 3 fails, something ELSE references customers with a restrictive
--   rule, and the survey in the header note becomes urgent rather than
--   optional.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.payments DROP CONSTRAINT payments_customer_id_fkey;
--   ALTER TABLE public.payments
--     ADD CONSTRAINT payments_customer_id_fkey
--     FOREIGN KEY (customer_id) REFERENCES public.customers(id)
--     ON DELETE SET NULL;
