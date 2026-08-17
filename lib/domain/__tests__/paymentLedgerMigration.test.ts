/**
 * The ledger's guarantees, pinned to the migration that creates them.
 *
 * Source assertions, because this repository has no harness that runs
 * migrations — the runtime proof is the rolled-back transaction in the
 * migration's own verification block. What these catch is the likelier
 * regression: a later "simplification" that removes a lock.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SQL = readFileSync(
  join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-17_m2_payment_ledger.sql'),
  'utf8',
);
const CODE = SQL.replace(/^\s*--.*$/gm, '');

describe('payments cannot be edited or deleted', () => {
  it('revokes the grants from every application role', () => {
    expect(CODE).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON public\.payments FROM authenticated, anon, service_role/i);
  });

  it('backs the grant with a trigger', () => {
    // Either lock alone is insufficient: the grant stops the ordinary path,
    // the trigger stops anything arriving with unexpected privilege.
    expect(CODE).toMatch(/BEFORE UPDATE OR DELETE ON public\.payments/i);
    expect(CODE).toMatch(/append-only ledger/);
  });

  it('tells the reader what to do instead', () => {
    // An error that only says "denied" produces a support ticket.
    expect(CODE).toMatch(/Reverse the entry instead/);
  });
});

describe('a reversal has to be a real reversal', () => {
  it('must be the exact negative of its target', () => {
    expect(CODE).toMatch(/NEW\.amount IS DISTINCT FROM \(-original\.amount\)/);
  });

  it('must match the target currency and shop', () => {
    expect(CODE).toMatch(/same currency as the payment it reverses/);
    expect(CODE).toMatch(/same shop as the payment it reverses/);
  });

  it('cannot reverse another reversal', () => {
    expect(CODE).toMatch(/Cannot reverse a reversal/);
  });

  it('can only happen once per payment', () => {
    // Without this, two people clicking Reverse at the same moment each write
    // one and the invoice goes negative.
    expect(CODE).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS payments_one_reversal_per_payment/i);
    expect(CODE).toMatch(/WHERE reverses_payment_id IS NOT NULL/i);
  });

  it('is structurally distinguishable from a payment', () => {
    expect(CODE).toMatch(/payments_entry_type_check[\s\S]*?CHECK \(entry_type IN \('payment', 'reversal'\)\)/);
    expect(CODE).toMatch(/payments_reversal_targets_check/);
  });
});

describe('the invoice link', () => {
  it('refuses to let a billed invoice be deleted out from under its payments', () => {
    // The constraint already existed with ON DELETE SET NULL, which blanked a
    // payment's invoice_number instead — INV-0003 proved it in production.
    expect(CODE).toMatch(/FOREIGN KEY \(invoice_number\) REFERENCES public\.invoices\(number\)/i);
    expect(CODE).toMatch(/ON UPDATE CASCADE ON DELETE RESTRICT/i);
  });

  it('replaces the existing constraint rather than skipping it', () => {
    // An IF NOT EXISTS guard here would silently leave SET NULL in place while
    // this file claimed to have fixed it. That is the bug this test exists for.
    expect(CODE).toMatch(/DROP CONSTRAINT IF EXISTS payments_invoice_number_fkey/i);
    expect(CODE).not.toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint WHERE conname = 'payments_invoice_number_fkey'/);
  });

  it('points at where the same flaw on the customer link is fixed', () => {
    // Both constraints had the same defect. A reader of this file must be able
    // to find the other half rather than assume it was missed.
    expect(SQL).toMatch(/payments_customer_id_fkey is also ON DELETE SET NULL/);
    expect(SQL).toMatch(/2026-08-17_m2b_customer_payment_link\.sql/);
  });
});

describe('the migration is operable', () => {
  it('states that the app must be deployed first', () => {
    // The old code issues UPDATE and DELETE. Migration-first would make the
    // live Edit and Delete buttons fail in front of customers.
    expect(SQL).toMatch(/application change MUST be deployed BEFORE this migration/i);
  });

  it('is reversible, and says how', () => {
    expect(SQL).toMatch(/Rollback/i);
    expect(SQL).toMatch(/GRANT UPDATE, DELETE ON public\.payments/);
    expect(SQL).toMatch(/DROP COLUMN IF EXISTS entry_type/);
  });

  it('admits what a rollback would leave behind', () => {
    // Reversal rows would survive as plain negative payments. Saying so beats
    // discovering it.
    // Comment markers and line wrapping stripped, so the assertion is about
    // what the file says rather than where it happens to break lines.
    const prose = SQL.replace(/^\s*--/gm, ' ').replace(/\s+/g, ' ');
    expect(prose).toMatch(/survive as plain negative payments/);
  });
});

describe('the callers were actually migrated', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');

  it('no view calls the removed functions', () => {
    // M1 listed three call sites. If any survived, this ships an app whose
    // buttons fail against the new database.
    for (const f of ['features/payments/PaymentsView.tsx', 'features/invoices/InvoicesView.tsx']) {
      expect(read(f)).not.toMatch(/\b(updatePayment|deletePayment)\b/);
    }
  });

  it('the service no longer exports them', () => {
    const svc = read('services/paymentService.ts');
    expect(svc).not.toMatch(/export async function (updatePayment|deletePayment)/);
    expect(svc).toMatch(/export async function reversePayment/);
    expect(svc).toMatch(/export async function correctPayment/);
  });

  it('reversing always asks why', () => {
    // The column allows null; the product does not. A reversal with no
    // explanation is unanswerable six months later.
    const payments = read('features/payments/PaymentsView.tsx');
    const invoices = read('features/invoices/InvoicesView.tsx');
    expect(payments).toMatch(/reversePayment\(p\.id, reason\)/);
    expect(invoices).toMatch(/reversePayment\(paymentId, reason\)/);
  });
});

describe('the customer link', () => {
  const M2B = readFileSync(
    join(__dirname, '..', '..', '..', 'supabase/migrations/2026-08-17_m2b_customer_payment_link.sql'),
    'utf8',
  );
  const M2B_CODE = M2B.replace(/^\s*--.*$/gm, '');

  it('stops a customer deletion from detaching their payments', () => {
    // Was ON DELETE SET NULL: the payment survived but belonged to nobody, and
    // afterwards that is indistinguishable from a payment recorded without a
    // customer.
    expect(M2B_CODE).toMatch(/FOREIGN KEY \(customer_id\) REFERENCES public\.customers\(id\)/i);
    expect(M2B_CODE).toMatch(/ON UPDATE CASCADE ON DELETE RESTRICT/i);
  });

  it('replaces the constraint rather than guarding around it', () => {
    expect(M2B_CODE).toMatch(/DROP CONSTRAINT IF EXISTS payments_customer_id_fkey/i);
  });

  it('admits the workflow cost instead of burying it', () => {
    const prose = M2B.replace(/^\s*--/gm, ' ').replace(/\s+/g, ' ');
    expect(prose).toMatch(/archive\/inactive flag/);
  });

  it('records that other references to customers were NOT surveyed', () => {
    // vehicles, invoices and job_cards have their own delete rules. Claiming
    // this milestone made customer deletion safe would be false.
    const prose = M2B.replace(/^\s*--/gm, ' ').replace(/\s+/g, ' ');
    expect(prose).toMatch(/have not been surveyed/);
  });

  it('the app explains the refusal rather than showing a constraint name', () => {
    const domain = readFileSync(join(__dirname, '..', 'customers.ts'), 'utf8');
    expect(domain).toMatch(/translateDeleteError/);
    expect(domain).toMatch(/payment history would be left belonging to nobody/);
  });
});
