/**
 * Drafting the invoice at QA sign-off.
 *
 * 19 of 34 production repair orders are "Complete" and only 1 carries an
 * invoice number. The cause was not a missing feature — the code to build an
 * invoice from a repair order already existed — but that it sat behind a button
 * someone had to remember to press.
 *
 * `handleQAApprove` set the order Complete and told the operator it was "ready
 * for invoicing", then did nothing further. Every order finished through QA —
 * which is every order, since the status field refuses Complete directly —
 * ended there. Work was done, parts were consumed, and nothing was billed.
 *
 * So the sign-off now raises the invoice itself. It is a Draft: a human still
 * reviews and sends it, and nothing is ever charged automatically.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const roView = readFileSync(join(root, 'features/repair-orders/RepairOrdersView.tsx'), 'utf8');

const qaApprove = roView.slice(
  roView.indexOf('async function handleQAApprove'),
  roView.indexOf('async function handleQASendBack'),
);
// To the end of the function, not a fixed character count. A 1400-char window
// silently stopped covering the body the moment the function grew, turning
// ordering assertions into indexOf(-1) comparisons that pass or fail for
// reasons unrelated to what they check.
const convert = (() => {
  const start = roView.indexOf('async function handleConvertToInvoice');
  const next = roView.indexOf('\n  async function', start + 1);
  return roView.slice(start, next === -1 ? roView.length : next);
})();
const helper = roView.slice(
  roView.indexOf('async function draftInvoiceFor'),
  roView.indexOf('async function handleConvertToInvoice'),
);

describe('completing an order raises the invoice for it', () => {
  it('QA sign-off drafts the invoice rather than only saying it is ready', () => {
    expect(qaApprove).toMatch(/await draftInvoiceFor\(/);
  });

  it('records the number back on the repair order, closing the loop', () => {
    // Without this the order is Complete with nothing pointing at what was
    // billed — precisely the state the 19 orders are in.
    expect(qaApprove).toMatch(/updateRepairOrder\(ro\.id, \{ invoiceNumber: invNumber \}\)/);
  });

  it('tells the operator the invoice exists, by number', () => {
    expect(qaApprove).toMatch(/draft invoice \$\{invNumber\}/);
  });

  it('carries the QA sign-off into the invoice notes', () => {
    // draftInvoiceFor copies ro.notes; the sign-off was appended a moment ago
    // and is only in the local `notes`, not yet on the `ro` object in hand.
    expect(qaApprove).toMatch(/draftInvoiceFor\(\{ \.\.\.ro, notes \}\)/);
  });
});

describe('it never bills the same job twice', () => {
  it('skips drafting when the order already has an invoice', () => {
    // The guard also now requires the permission: a manager whose shop
    // withholds invoicing signed off correctly and was then shown a red
    // banner about a draft they never asked for. `capsLoading` keeps the old
    // behaviour while permissions are still resolving, so a slow read cannot
    // silently skip invoicing for someone who does hold it.
    expect(qaApprove).toMatch(/if \(!invNumber && \(canInvoice \|\| capsLoading\)\)/);
  });

  it('the manual Convert button refuses an already-invoiced order', () => {
    expect(convert).toMatch(/if \(ro\.invoiceNumber\)/);
    expect(convert).toMatch(/is already invoiced as/);
  });

  it('that guard runs before anything is created', () => {
    // Ordering is the whole guarantee: a check after the insert prevents nothing.
    expect(convert.indexOf('if (ro.invoiceNumber)')).toBeLessThan(convert.indexOf('draftInvoiceFor'));
  });
});

describe('a failed invoice does not cost the sign-off', () => {
  it('the status update happens before the invoice is attempted', () => {
    // The work is genuinely complete. If billing fails, that is a billing
    // problem — losing the QA record too would be a second, worse failure.
    expect(qaApprove.indexOf("status: 'Complete'")).toBeLessThan(qaApprove.indexOf('draftInvoiceFor'));
  });

  it('the invoice attempt has its own error handling', () => {
    expect(qaApprove).toMatch(/invoiceError/);
  });

  it('reports the failure rather than swallowing it', () => {
    // A silent failure here reproduces the original bug exactly: Complete,
    // unbilled, and nobody told.
    expect(qaApprove).toMatch(/could not be created/);
  });

  it('says what to do about it', () => {
    expect(qaApprove).toMatch(/Convert to invoice/);
  });

  it('does not claim an invoice number it failed to create', () => {
    expect(qaApprove).toMatch(/invNumber = ro\.invoiceNumber;/);
  });
});

describe('both routes build the same invoice', () => {
  it('the manual convert goes through the shared helper', () => {
    // Two copies of this logic would drift, and the drift would be in money.
    expect(convert).toMatch(/await draftInvoiceFor\(ro\)/);
    expect(convert).not.toMatch(/await createInvoice\(/);
  });

  it('the invoice is a Draft, never charged automatically', () => {
    expect(helper).toMatch(/status: 'Draft'/);
    expect(helper).toMatch(/paidDate: null/);
  });

  it('it carries the job card through, keeping the chain intact', () => {
    expect(helper).toMatch(/jobCardId: ro\.jobCardId/);
  });

  it('it bills in the order\'s own currency', () => {
    // A shop quoting in THB must not have the invoice fall back to USD.
    expect(helper).toMatch(/currency: ro\.currency/);
  });

  it('it lists the actual parts, not a lump sum, when they are known', () => {
    expect(helper).toMatch(/ro\.parts\.length > 0/);
    expect(helper).toMatch(/p\.partNumber/);
  });
});
