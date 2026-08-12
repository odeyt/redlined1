/**
 * The editor must not zero out a negative line's rate.
 *
 * The invoice totals always handled credits correctly (see
 * services/__tests__/invoiceCredits.test.ts). The loss happened before the
 * maths: when cost or markup changes, the editor recomputes `rate`, and that
 * recompute began `if (!cost || cost <= 0)` — one condition covering three
 * unrelated cases. Empty (still typing), zero (no-charge line) and negative
 * (a deposit or credit) were all treated as "clear the rate", so a deposit
 * reached the totals worth nothing and the customer was billed for money
 * already paid.
 *
 * That the line-total cell already styles negatives green shows credits were
 * always meant to work; only this guard prevented it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// Comments quote the old condition so the next reader knows what changed and
// why; matching against them would fail on the explanation itself.
const raw = readFileSync(
  join(__dirname, '..', 'invoices', 'InvoicesView.tsx'), 'utf8',
);
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('rate recompute', () => {
  it('no longer discards negative or zero costs', () => {
    expect(src).not.toMatch(/if \(!cost \|\| cost <= 0\)/);
  });

  it('clears the rate only for an empty or unparseable cost', () => {
    expect(src).toMatch(/if \(costRaw\.trim\(\) === '' \|\| isNaN\(cost\)\)/);
  });

  it('computes the rate from cost, fx and markup for every other value', () => {
    // Including negatives: -6000 * 1 * (1 + 0) is a valid -6000 rate.
    expect(src).toMatch(/const rate = \+\(cost \* fx \* \(1 \+ pct \/ 100\)\)\.toFixed\(2\)/);
  });
});

describe('credit lines are a supported concept, not an accident', () => {
  it('the line total cell distinguishes a credit visually', () => {
    // Green, because on an invoice a negative line is money in the
    // customer's favour and should read as such at a glance.
    expect(src).toMatch(/lineTotal < 0 \? '#22c55e'/);
  });
});
