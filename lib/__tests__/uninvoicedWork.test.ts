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

  it('is hidden from technicians, who do not raise invoices', () => {
    expect(view).toMatch(/\{!isTech && \(selected\.status === 'Complete'/);
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
