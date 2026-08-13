/**
 * A priced line with no quantity contributes nothing.
 *
 * Reported: an invoice listing GEAR SWITCH LINE at THB 700 and LABOR at
 * THB 500 totalled THB 0. The arithmetic was right — both lines had a
 * quantity of 0 — but the invoice looked complete.
 *
 * The quantities came from the repair order. Auto-drafted invoices copy them
 * straight across:
 *
 *   { description: `Labor — ...`, qty: ro.laborHours, rate: ro.laborRate }
 *   { description: p.description,  qty: p.qty,        rate: p.unitCost }
 *
 * so a job saved with 0 labour hours produces a fully populated invoice for
 * nothing.
 *
 * Deliberately NOT fixed by defaulting the quantity to 1. Only the advisor
 * knows whether it was one hour or three, and inventing a number on a
 * customer's invoice is a worse failure than showing zero — it is wrong
 * without looking wrong. The fix makes it impossible to miss instead.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const src = readFileSync(join(root, 'features', 'invoices', 'InvoicesView.tsx'), 'utf8');
const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the editor names the offending lines', () => {
  it('flags lines priced above zero with a quantity of zero', () => {
    expect(stripped).toMatch(
      /\(parseFloat\(l\.rate\) \|\| 0\) > 0 && \(parseFloat\(l\.qty\) \|\| 0\) === 0/,
    );
  });

  it('says which lines, not just that something is wrong', () => {
    // "Check your quantities" sends someone hunting through twelve rows.
    expect(stripped).toMatch(/unpriced\.map\(l => l\.description \|\| 'Untitled line'\)\.join\(', '\)/);
  });

  it('appears in both editors', () => {
    // There are two invoice forms in this file; fixing one and not the other
    // has already happened once today.
    expect(src.match(/Quantity missing on/g)).toHaveLength(2);
  });

  it('stays quiet when every priced line has a quantity', () => {
    expect(stripped).toMatch(/if \(unpriced\.length === 0\) return null;/);
  });
});

describe('printing a zero invoice takes a deliberate act', () => {
  it('asks before printing an invoice that lists priced work but totals zero', () => {
    expect(stripped).toMatch(/This invoice totals zero even though it lists priced work/);
  });

  it('names the lines missing a quantity in the prompt', () => {
    expect(stripped).toMatch(/No quantity on: \$\{zeroQty\.join\(', '\)\}/);
  });

  it('aborts the print when declined', () => {
    expect(stripped).toMatch(/if \(!ok\) return;/);
  });

  it('uses the effective total, so a foreign-currency invoice is judged correctly', () => {
    // t.subtotal is base-currency only; an all-THB invoice on a USD record
    // would otherwise look like zero and prompt on every print.
    expect(stripped).toMatch(/const \{ amount: effective \} = getEffectiveTotal\(inv\)/);
  });

  it('does not prompt for an invoice with no priced lines at all', () => {
    // A genuinely empty draft is not the same mistake.
    expect(stripped).toMatch(/pricedLines\.length > 0 && effective === 0/);
  });
});

describe('what it deliberately does not do', () => {
  it('never substitutes a quantity of its own', () => {
    // The guard against a well-meaning future fix: defaulting qty to 1 would
    // make the total look right and the invoice be wrong.
    expect(stripped).not.toMatch(/qty:\s*String\(l\.qty \|\| 1\)/);
    expect(stripped).not.toMatch(/parseFloat\(l\.qty\) \|\| 1/);
  });
});

describe('the repair order catches it one step earlier', () => {
  const ro = readFileSync(join(root, 'features', 'repair-orders', 'RepairOrdersView.tsx'), 'utf8');
  const roStripped = ro.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('identifies labour priced with no hours', () => {
    expect(roStripped).toMatch(/ro\.laborRate > 0 && ro\.laborHours === 0/);
  });

  it('identifies parts priced with no quantity', () => {
    expect(roStripped).toMatch(/p\.unitCost > 0 && p\.qty === 0/);
  });

  it('no longer substitutes an hour nobody recorded', () => {
    // This path used to send `qty: ro.laborHours || 1`, billing one hour that
    // nobody chose — and disagreeing with the sign-off path beside it, which
    // passed the 0 straight through.
    expect(roStripped).not.toMatch(/qty: ro\.laborHours \|\| 1/);
  });

  it('both invoice paths now carry what the order actually says', () => {
    expect(roStripped.match(/qty: ro\.laborHours(?! \|\|)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('asks before the action whose purpose is raising the invoice', () => {
    expect(roStripped).toMatch(/has priced work with no quantity/);
    expect(roStripped).toMatch(/Create the invoice anyway\?/);
  });

  it('never blocks QA sign-off, which must not be lost', () => {
    // Sign-off warns in the toast instead: the invoice is a Draft a human
    // reviews, and losing a sign-off is the worse failure.
    expect(roStripped).toMatch(/⚠ Add quantities before sending/);
    const signOff = roStripped.slice(0, roStripped.indexOf('async function draftInvoiceFor'));
    expect(signOff).not.toMatch(/Create the invoice anyway\?/);
  });
});
