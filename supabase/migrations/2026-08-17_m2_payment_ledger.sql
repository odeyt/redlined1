-- M2 — payments become a ledger: append, reverse, adjust. Never edit, never delete.
--
-- RUN AGAINST redlined1, AFTER the application change is deployed.
-- Order matters here and is explained under "Deployment order" below.
--
-- The M0 audit's only CRITICAL finding was that a payment could be edited or
-- hard-deleted, leaving no trace and no way to reconcile against a bank
-- statement. M1 made those operations leave an audit row. M2 removes them.
--
-- The accounting shape, which is the point:
--
--   a mistake is not erased, it is REVERSED — a second row of the opposite
--   amount, pointing at the first. The history stays true and the arithmetic
--   still comes out right, because every existing report sums `amount` and a
--   reversal is negative.
--
-- That last sentence is why this migration needs no changes to reports,
-- dashboards or intelligence metrics: all six other readers of `payments`
-- already sum amounts and were verified read-only before this was written.

BEGIN;

-- ── 1. Ledger columns ───────────────────────────────────────────────────────

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'payment',
  ADD COLUMN IF NOT EXISTS reverses_payment_id UUID REFERENCES public.payments(id),
  ADD COLUMN IF NOT EXISTS reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_entry_type_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_entry_type_check
      CHECK (entry_type IN ('payment', 'reversal'));
  END IF;
END $$;

-- A reversal must point at what it reverses; a payment must not.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_reversal_targets_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_reversal_targets_check
      CHECK (
        (entry_type = 'reversal' AND reverses_payment_id IS NOT NULL)
        OR
        (entry_type = 'payment'  AND reverses_payment_id IS NULL)
      );
  END IF;
END $$;

-- One reversal per payment. Without this, two people clicking Reverse at the
-- same moment each write one and the invoice goes negative — the duplicate
-- side of the same problem this migration exists to fix.
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_reversal_per_payment
  ON public.payments (reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_invoice_number_idx
  ON public.payments (invoice_number);

-- ── 2. Stop invoice deletion from orphaning money ───────────────────────────
--
-- CORRECTION to the M0 audit, which claimed there was no foreign key here.
-- There is, and always has been: `payments_invoice_number_fkey`. That finding
-- was inferred from the schema file rather than read from pg_constraint, and
-- it was wrong.
--
-- The real problem is its delete rule: ON DELETE SET NULL (confdeltype = 'n').
-- Deleting an invoice does not delete its payments — it quietly blanks their
-- invoice_number, leaving the money in the ledger attached to nothing.
--
-- This has already happened. INV-0003 is absent from `invoices`, and the one
-- payment with a NULL invoice_number carries the note "Credit card payment —
-- INV-0003". That entry was for 0.00 so nothing was lost, but the mechanism is
-- demonstrated, and after the fact an orphaned payment is indistinguishable
-- from a payment that was never against an invoice.
--
-- RESTRICT instead: an invoice with payments against it cannot be deleted. A
-- behaviour change, deliberately — the domain layer translates the resulting
-- 23503 into a sentence a service advisor can act on.
--
-- Dropped and recreated rather than guarded with IF NOT EXISTS, because the
-- constraint already exists and a guard would silently skip the fix, leaving
-- SET NULL in place while this file claimed otherwise.

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_invoice_number_fkey;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_invoice_number_fkey
  FOREIGN KEY (invoice_number) REFERENCES public.invoices(number)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- payments_customer_id_fkey is also ON DELETE SET NULL, so deleting a customer
-- detaches their payments the same way (5 already have no customer link). It
-- is fixed separately in 2026-08-17_m2b_customer_payment_link.sql, which was
-- written after this one — the workflow cost there is larger, so it deserved
-- its own decision rather than riding along with the ledger.

-- ── 3. Append-only ──────────────────────────────────────────────────────────
--
-- Same two locks as audit_events, for the same reason: the GRANT stops the
-- ordinary path, the trigger stops anything arriving with more privilege than
-- expected. Every other reader of this table was checked and is SELECT-only,
-- so nothing legitimate is broken by this.
--
-- The trigger allows exactly one mutation: setting `reversed_at` on the row
-- being reversed is NOT permitted either — the reversal row itself is the
-- record, and a flag on the original would be a second source of truth about
-- whether money moved.

REVOKE UPDATE, DELETE, TRUNCATE ON public.payments FROM authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.payments_are_append_only()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION
    'payments is an append-only ledger (attempted %). Reverse the entry instead.', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $fn$;

DROP TRIGGER IF EXISTS payments_no_update ON public.payments;
CREATE TRIGGER payments_no_update
  BEFORE UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_are_append_only();

-- ── 4. A reversal must match what it reverses ───────────────────────────────
--
-- Checked in the database rather than only in the domain layer, because this
-- is the invariant that keeps the ledger's arithmetic true. A reversal of the
-- wrong amount, in the wrong currency, or against a payment in another shop
-- would each silently corrupt a balance.

CREATE OR REPLACE FUNCTION public.payments_reversal_is_valid()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE original public.payments%ROWTYPE;
BEGIN
  IF NEW.entry_type <> 'reversal' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO original FROM public.payments WHERE id = NEW.reverses_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot reverse a payment that does not exist';
  END IF;

  IF original.entry_type = 'reversal' THEN
    RAISE EXCEPTION 'Cannot reverse a reversal — record a new payment instead';
  END IF;

  IF original.shop_id IS DISTINCT FROM NEW.shop_id THEN
    RAISE EXCEPTION 'A reversal must belong to the same shop as the payment it reverses';
  END IF;

  IF COALESCE(original.currency, '') IS DISTINCT FROM COALESCE(NEW.currency, '') THEN
    RAISE EXCEPTION 'A reversal must be in the same currency as the payment it reverses';
  END IF;

  IF NEW.amount IS DISTINCT FROM (-original.amount) THEN
    RAISE EXCEPTION 'A reversal must be exactly the negative of the payment it reverses (expected %, got %)',
      -original.amount, NEW.amount;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS payments_reversal_valid ON public.payments;
CREATE TRIGGER payments_reversal_valid
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.payments_reversal_is_valid();

COMMIT;

-- ── Deployment order ────────────────────────────────────────────────────────
--
-- The application change MUST be deployed BEFORE this migration runs.
--
-- The old code calls UPDATE and DELETE on payments. If this migration lands
-- first, the Edit and Delete buttons in the live app start failing with a
-- Postgres error instead of doing anything useful. Deployed the other way
-- round, the new code never issues those statements, and this migration only
-- removes a capability nothing is using any more.
--
-- ── Verification ────────────────────────────────────────────────────────────
--
-- 1. The ledger accepts a valid reversal and refuses a wrong one. All inside a
--    transaction that rolls back, so no real money moves:
--
--   BEGIN;
--   -- a real payment to work against
--   SELECT id, amount, currency, shop_id FROM public.payments
--     WHERE entry_type = 'payment' LIMIT 1;
--
--   -- correct reversal — should SUCCEED (substitute the values above)
--   INSERT INTO public.payments
--     (shop_id, invoice_number, customer_name, amount, method, status,
--      currency, payment_date, entry_type, reverses_payment_id, reason)
--   SELECT shop_id, invoice_number, customer_name, -amount, method, status,
--          currency, now(), 'reversal', id, 'verification'
--   FROM public.payments WHERE entry_type = 'payment' LIMIT 1;
--
--   -- wrong amount — should FAIL
--   INSERT INTO public.payments
--     (shop_id, customer_name, amount, method, status, currency,
--      payment_date, entry_type, reverses_payment_id)
--   SELECT shop_id, customer_name, 1, method, status, currency,
--          now(), 'reversal', id
--   FROM public.payments WHERE entry_type = 'payment' LIMIT 1;
--   ROLLBACK;
--
-- 2. Editing and deleting are refused (both must FAIL):
--
--   BEGIN; UPDATE public.payments SET amount = 1; ROLLBACK;
--   BEGIN; DELETE FROM public.payments; ROLLBACK;
--
-- 3. The foreign key holds (must FAIL):
--
--   BEGIN;
--   INSERT INTO public.payments (shop_id, invoice_number, customer_name, amount,
--     method, status, currency, payment_date)
--   VALUES ((SELECT id FROM public.shops LIMIT 1), 'INV-DOES-NOT-EXIST', 'x', 1,
--     'Cash', 'Recorded', 'USD', now());
--   ROLLBACK;
--
-- 4. Balances are unchanged by the migration itself:
--
--   SELECT invoice_number, sum(amount) AS net
--   FROM public.payments GROUP BY invoice_number ORDER BY invoice_number;
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS payments_reversal_valid ON public.payments;
--   DROP FUNCTION IF EXISTS public.payments_reversal_is_valid();
--   DROP TRIGGER IF EXISTS payments_no_update ON public.payments;
--   DROP FUNCTION IF EXISTS public.payments_are_append_only();
--   GRANT UPDATE, DELETE ON public.payments TO authenticated, service_role;
--   ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_invoice_number_fkey;
--   ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_reversal_targets_check;
--   ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_entry_type_check;
--   DROP INDEX IF EXISTS public.payments_one_reversal_per_payment;
--   ALTER TABLE public.payments
--     DROP COLUMN IF EXISTS reason,
--     DROP COLUMN IF EXISTS reverses_payment_id,
--     DROP COLUMN IF EXISTS entry_type;
--
--   Any reversal rows written before a rollback would survive as plain
--   negative payments. The arithmetic stays correct; only the link is lost.
