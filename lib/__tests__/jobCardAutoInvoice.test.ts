/**
 * Drafting the invoice where work actually finishes.
 *
 * The auto-draft was first attached to the repair-order QA sign-off, on the
 * assumption that repair orders were how jobs completed. The database said
 * otherwise: over three days, eight jobs were closed through Job Cards and not
 * a single repair order changed status. ro_status_events — trigger attached and
 * verified — held zero rows the entire time.
 *
 * Every one of those eight rows in closed_jobs has `invoice = null`. Work
 * finished, nothing billed. That is the gap the auto-draft exists to close, and
 * it was closed on a module the shop does not use.
 *
 * So the draft moves to closeJob(), which is the path staff actually take.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const service = read('services/jobCardService.ts');
const view    = read('features/job-cards/JobCardsView.tsx');

const closeJob = service.slice(
  service.indexOf('export async function closeJob'),
  service.indexOf('export async function deleteJobCard'),
);

describe('closing a job raises its invoice', () => {
  it('closeJob drafts one', () => {
    expect(closeJob).toMatch(/invoiceNumber = await draftInvoiceForJob\(job\)/);
  });

  it('it lives in the service, not the view', () => {
    // A caller that forgets to invoice is how eight jobs closed unbilled.
    expect(service).toMatch(/async function draftInvoiceForJob/);
    expect(view).not.toMatch(/createInvoice\(/);
  });

  it('the invoice is a Draft, never issued automatically', () => {
    expect(service).toMatch(/status:\s+'Draft'/);
    expect(service).toMatch(/paidDate:\s+null/);
  });

  it('it records which job it bills for', () => {
    expect(service).toMatch(/jobCardId:\s+job\.id/);
  });

  it('the archived job records what was billed, closing the loop back', () => {
    // All eight existing closed_jobs rows have invoice = null, so nothing
    // connects finished work to what was charged for it.
    expect(closeJob).toMatch(/\.from\('closed_jobs'\)\s*\n?\s*\.update\(\{ invoice: invoiceNumber \}\)/);
  });
});

describe('it never bills the same job twice', () => {
  it('skips drafting when the job already carries an invoice', () => {
    expect(closeJob).toMatch(/let invoiceNumber: string \| null = job\.invoice \|\| null;/);
    expect(closeJob).toMatch(/if \(!invoiceNumber\) \{/);
  });
});

describe('a failed invoice does not cost the closure', () => {
  it('the job is archived before the invoice is attempted', () => {
    // Drafting first would risk an invoice for a job that never closed.
    expect(closeJob.indexOf("from('closed_jobs').insert"))
      .toBeLessThan(closeJob.indexOf('draftInvoiceForJob(job)'));
  });

  it('the deletion from job_cards also precedes it', () => {
    expect(closeJob.indexOf("from('job_cards').delete"))
      .toBeLessThan(closeJob.indexOf('draftInvoiceForJob(job)'));
  });

  it('the failure is returned rather than thrown away', () => {
    expect(closeJob).toMatch(/invoiceError = e instanceof Error \? e\.message/);
    expect(closeJob).toMatch(/return \{ invoiceNumber, invoiceError \}/);
  });

  it('a created-but-unlinked invoice is reported distinctly', () => {
    // Losing the link is a different problem from never billing, and the
    // wording has to let someone tell which happened.
    expect(closeJob).toMatch(/was created but could not be linked/);
  });

  it('the view says the job closed even when billing failed', () => {
    expect(view).toMatch(/is closed, but the draft invoice could not be created/);
    expect(view).toMatch(/Raise it from Invoices/);
  });
});

describe('the operator is told the invoice number', () => {
  it('it appears in the closing toast', () => {
    expect(view).toMatch(/const invLine = invoiceNumber \? ` Draft invoice \$\{invoiceNumber\} created\.` : ''/);
  });

  it('in both closing paths, so a skipped schedule does not hide it', () => {
    // A separate toast was overwritten by the maintenance-schedule one.
    const uses = view.match(/\$\{invLine\}/g) ?? [];
    expect(uses.length).toBe(2);
  });

  it('the archived row shown in the UI carries the number too', () => {
    expect(view).toMatch(/invoice: invoiceNumber \?\? job\.invoice/);
  });
});

describe('what it bills reflects what the job card knows', () => {
  it('labor is billed at the shop rate, by hours', () => {
    expect(service).toMatch(/qty: job\.laborHours, rate: laborRate/);
  });

  it('parts are one line, since a job card has no itemised parts', () => {
    // Inventing line items would misrepresent what was recorded.
    expect(service).toMatch(/description: 'Parts', qty: 1, rate: job\.partsTotal/);
  });

  it('omits a line that would be zero', () => {
    expect(service).toMatch(/if \(job\.laborHours > 0\)/);
    expect(service).toMatch(/if \(job\.partsTotal > 0\)/);
  });

  it('uses the shop currency and tax rate rather than assuming', () => {
    expect(service).toMatch(/currency:\s+settings\?\.defaultCurrency \?\? 'USD'/);
    expect(service).toMatch(/taxRate:\s+settings\?\.defaultTaxRate \?\? 0/);
  });

  it('survives settings being unreadable', () => {
    expect(service).toMatch(/fetchShopSettings\(\)\.catch\(\(\) => null\)/);
  });
});
