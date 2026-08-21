/**
 * Finished work that was never billed.
 *
 * RO-00036 went through QA sign-off cleanly on 2026-08-07 — the status trail is
 * intact in ro_status_events, the sign-off is recorded in its notes — and no
 * invoice exists. The auto-draft either failed or never ran, and afterwards
 * nothing on screen said so: the only signal was a toast, long gone.
 *
 * At the time of this change, 20 of 21 completed repair orders were in that
 * state, and the only way to find one was to open each order and notice the
 * absence of an invoice number.
 *
 * Two changes, because the failure and its invisibility are separate problems.
 * A failed draft is now reported somewhere that survives the page, and
 * uninvoiced work is a standing, countable thing rather than a moment that
 * passed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const view = readFileSync(
  join(__dirname, '..', '..', 'features/repair-orders/RepairOrdersView.tsx'),
  'utf8',
);

describe('a failed auto-draft leaves a trace', () => {
  it('reports to the logger, not only to a toast', () => {
    expect(view).toMatch(/logger\.error\('repair-orders\.autoDraftInvoice failed'/);
  });

  it('records which order it was', () => {
    // Without the number the report cannot be acted on.
    expect(view).toMatch(/\{ roNumber: ro\.roNumber, roId: ro\.id \}/);
  });

  it('reporting cannot mask the original failure', () => {
    expect(view).toMatch(/catch \{ \/\* reporting must not mask the original failure \*\/ \}/);
  });

  it('still shows the operator the error', () => {
    expect(view).toMatch(/but the draft invoice could not be created/);
  });
});

describe('uninvoiced work is visible without opening every order', () => {
  it('is counted', () => {
    expect(view).toMatch(/const uninvoicedCount = orders\.filter\(r => isUninvoiced\(r\) && !isArchivedRO\(r\)\)/);
  });

  it('covers Closed as well as Complete', () => {
    // Both mean the work is finished; only the wording differs.
    expect(view).toMatch(/\(r\.status === 'Complete' \|\| r\.status === 'Closed'\) && !r\.invoiceNumber/);
  });

  it('has its own tile', () => {
    expect(view).toMatch(/label: 'Not invoiced',\s+count: uninvoicedCount/);
  });

  it('and the tile actually filters the list', () => {
    // A count that cannot be clicked through is a statistic, not a worklist.
    expect(view).toMatch(/filterStatus === 'Uninvoiced' && isUninvoiced\(ro\)/);
  });

  it('cuts across status rather than replacing it', () => {
    expect(view).toMatch(/Cuts across status rather than being one/);
  });
});

describe('an order in that state offers the fix directly', () => {
  it('shows a prompt on the order itself', () => {
    expect(view).toMatch(/⚠ Not invoiced — raise invoice/);
  });

  it('only when it is finished and unbilled', () => {
    expect(view).toMatch(/\(selected\.status === 'Complete' \|\| selected\.status === 'Closed'\) && !selected\.invoiceNumber/);
  });

  it('is hidden from anyone who may not raise invoices', () => {
    // Was `!isTech`, which only excluded technicians. A manager at D1 Imports
    // saw it, pressed it, and the domain layer refused — the button read as a
    // broken product rather than a withheld permission. `canInvoice` is
    // capability AND module access, so it now matches what the server allows.
    expect(view).toMatch(/\{canInvoice && \(selected\.status === 'Complete'/);
  });

  it('reuses the existing convert path rather than a second one', () => {
    // That path already refuses to bill an order twice.
    expect(view).toMatch(/onClick=\{\(\) => handleConvertToInvoice\(selected\)\}/);
  });
});

/**
 * The filter crashed the page, and no source-level test could see it.
 *
 * Selecting "Not invoiced" threw:
 *
 *   ReferenceError: Cannot access 'isUninvoiced' before initialization
 *
 * `filtered` calls isUninvoiced, and isUninvoiced was declared as a const
 * arrow function below it — inside the temporal dead zone at the moment
 * `filtered` runs. The tile still rendered its count, because the count is
 * computed after the declaration, so the feature looked fine until someone
 * clicked it. Every test here passed the whole time: they asserted the source
 * contained the right expressions, which it did. Only running the page found
 * it.
 *
 * Caught in the preview browser, fixed, and re-verified there: the filter now
 * lists 21 orders including RO-00036.
 */
describe('the helper is declared before the code that calls it', () => {
  const src = view;

  it('isUninvoiced is defined above `filtered`', () => {
    const decl = src.indexOf('const isUninvoiced =');
    const use  = src.indexOf('const filtered = orders.filter');
    expect(decl).toBeGreaterThan(-1);
    expect(use).toBeGreaterThan(-1);
    expect(decl).toBeLessThan(use);
  });

  it('and above the count that also uses it', () => {
    expect(src.indexOf('const isUninvoiced =')).toBeLessThan(src.indexOf('const uninvoicedCount ='));
  });

  it('records why the ordering matters', () => {
    expect(src).toMatch(/temporal dead zone/);
  });
});

/**
 * One repair order, at most one invoice — enforced by the database.
 *
 * Probed directly on 2026-08-11: two invoices with different numbers, both
 * naming the same repair order, were BOTH accepted. invoices.number is the
 * primary key so two invoices can never share a number, but nothing stopped
 * one job being billed twice under two numbers.
 *
 * The only guard was the client-side check on ro.invoiceNumber. It reads state
 * the browser loaded, so two tabs that both opened the order before either
 * converted each believe it is unbilled — both pass, both allocate, both
 * insert. Two advisors on the same order is not exotic in a two-location shop.
 *
 * A partial unique index makes it impossible regardless of what any client
 * believes. It only works if every conversion path records the link.
 */
describe('the database refuses to bill one job twice', () => {
  const migration = readFileSync(
    join(__dirname, '..', '..', 'supabase/migrations/2026-08-11_one_invoice_per_repair_order.sql'),
    'utf8',
  );
  // M1 split this: the insert and its 23505 translation moved to the domain
  // layer, the InvoiceFull type to the pure arithmetic module. Both halves are
  // read so the guarantee is still pinned end to end.
  const service =
    readFileSync(join(__dirname, '..', '..', 'lib/domain/invoices.ts'), 'utf8') +
    readFileSync(join(__dirname, '..', '..', 'lib/domain/invoiceMath.ts'), 'utf8');

  it('adds the column the index needs', () => {
    // invoices had no reference to a repair order at all — only job_card and
    // free text in notes.
    expect(migration).toMatch(/add column if not exists repair_order_id uuid references public\.repair_orders\(id\)/);
  });

  it('the index is unique and partial', () => {
    // Partial, or the many invoices with no repair order collide on null.
    expect(migration).toMatch(/create unique index if not exists invoices_one_per_repair_order/);
    expect(migration).toMatch(/where repair_order_id is not null/);
  });

  it('backfills only unambiguous links', () => {
    // A wrong link is worse than none: it would block a legitimate conversion.
    expect(migration).toMatch(/= 1;/);
    expect(migration).toMatch(/Guessing a link would be worse than leaving it null/);
  });

  it('asserts the index exists rather than assuming', () => {
    expect(migration).toMatch(/raise exception 'invoices_one_per_repair_order was not created'/);
  });

  it('every invoice-from-repair-order path records the link', () => {
    // The index guards nothing on a path that leaves the column null.
    expect((view.match(/repairOrderId: ro\.id/g) ?? []).length).toBe(2);
  });

  it('the estimate path deliberately does not', () => {
    // An estimate is not an invoice, and one order may produce several.
    expect(view).toMatch(/No repairOrderId here: an estimate is not an invoice/);
  });

  it('the service carries it through to the insert', () => {
    expect(service).toMatch(/repair_order_id: inv\.repairOrderId \|\| null/);
    expect(service).toMatch(/repairOrderId\?: string/);
  });

  it('a collision reads as English, not a constraint name', () => {
    expect(service).toMatch(/error\.code === '23505' && String\(error\.message\)\.includes\('invoices_one_per_repair_order'\)/);
    expect(service).toMatch(/already been invoiced — someone else may have just billed it/);
  });
});
