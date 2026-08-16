/**
 * Carrying the job card's identity into the repair order it becomes.
 *
 * Audited on 2026-08-03: of 34 repair orders in production, **none** had a
 * job_card_id. The column existed, repairOrderService mapped it in both
 * directions, and the prefill type declared it — but the hand-off in
 * JobCardsView passed only the customer name, so nothing ever set it.
 *
 * Two costs. Staff retyped the vehicle and the reason for the work at a stage
 * that already knew both. And no report can connect a repair order to the job
 * it came from, so cycle time from job card to completion is unmeasurable — the
 * first question anyone asks when trying to speed a shop up.
 *
 * This is the smallest change that fixes both, and it unlocks the measurement
 * that should decide what gets automated next.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const jobCards = read('features/job-cards/JobCardsView.tsx');
const roView   = read('features/repair-orders/RepairOrdersView.tsx');
const roSvc    = read('services/repairOrderService.ts');

describe('the job card hands over its identity', () => {
  const handoff = jobCards.slice(
    jobCards.indexOf("module: 'repair-orders'") - 900,
    jobCards.indexOf("module: 'repair-orders'") + 120,
  );

  it('passes the job card id, not only the customer name', () => {
    expect(handoff).toMatch(/jobCardId:\s+selectedJob\.id/);
  });

  it('passes the vehicle, so it is not retyped', () => {
    expect(handoff).toMatch(/vehicle:\s+selectedJob\.vehicle/);
  });

  it('passes the service type as the reason for the work', () => {
    expect(handoff).toMatch(/notes:\s+selectedJob\.serviceType/);
  });
});

describe('the repair order receives it', () => {
  const effect = roView.slice(
    roView.indexOf('Open new form pre-filled when navigated'),
    roView.indexOf('async function load()'),
  );

  it('sets jobCardId on the new form', () => {
    expect(effect).toMatch(/jobCardId:\s+prefill\.jobCardId/);
  });

  it('seeds the concern from what the job card said', () => {
    expect(effect).toMatch(/concern:\s+f\.concern \|\| \(prefill\.notes/);
  });

  it('does not overwrite a concern already typed', () => {
    // `f.concern ||` — the operator is what protects work in progress.
    expect(effect).toMatch(/f\.concern \|\|/);
  });

  it('still carries customer and vehicle', () => {
    expect(effect).toMatch(/customerName:\s+prefill\.customerName/);
    expect(effect).toMatch(/vehicle:\s+prefill\.vehicle/);
  });
});

describe('the link reaches the database', () => {
  it('the service maps jobCardId to job_card_id on insert', () => {
    expect(roSvc).toMatch(/job_card_id: ro\.jobCardId \|\| null/);
  });

  it('and reads it back', () => {
    expect(roSvc).toMatch(/jobCardId: \(r\.job_card_id as string\) \|\| ''/);
  });

  it('and updates it', () => {
    expect(roSvc).toMatch(/if \(updates\.jobCardId !== undefined\) payload\.job_card_id/);
  });

  it('stores null rather than an empty string when there is no job card', () => {
    // An empty string would count as "linked" in any report that checks for a
    // value, quietly inflating the numbers this change exists to make true.
    expect(roSvc).toMatch(/ro\.jobCardId \|\| null/);
  });
});

/**
 * The invoice end of the same chain.
 *
 * 28 invoices in production, none referencing a job card, and 1 of 34 repair
 * orders carrying an invoice number — while 19 of those repair orders are
 * "Complete". So finished work could not be traced to what was billed for it.
 *
 * The cause was not one bug but a cascade. Two of the three routes into
 * invoicing already passed the job card:
 *
 *   Repair Order → Invoice   passes ro.jobCardId
 *   Estimate     → Invoice   passes est.jobCardId
 *   Job Card     → Invoice   passed nothing
 *
 * The first two wrote null anyway, because no repair order had a job card to
 * pass — the gap fixed in the commit before this one. So linking the repair
 * order also repairs the invoice link on those two routes, and only the direct
 * Job Card → Invoice button needed changing.
 */
describe('an invoice records the job it bills for', () => {
  const invoices = read('features/invoices/InvoicesView.tsx');
  // The insert moved to the domain layer in M1; the service is now a wrapper.
  const invSvc   = read('lib/domain/invoices.ts');
  const estimates = read('features/estimates/EstimatesView.tsx');

  it('the direct Job Card → Invoice hand-off passes the job card id', () => {
    const handoff = jobCards.slice(
      jobCards.indexOf("module: 'invoices'") - 700,
      jobCards.indexOf("module: 'invoices'") + 120,
    );
    expect(handoff).toMatch(/jobCardId:\s+selectedJob\.id/);
  });

  it('the invoice form receives it', () => {
    expect(invoices).toMatch(/jobCardId: \(p\?\.jobCardId as string\) \?\? ''/);
  });

  it('the Repair Order route already carried it', () => {
    expect(roView).toMatch(/jobCardId: ro\.jobCardId/);
  });

  it('the Estimate route already carried it', () => {
    expect(estimates).toMatch(/jobCardId: est\.jobCardId/);
  });

  it('and the service persists it', () => {
    expect(invSvc).toMatch(/job_card: inv\.jobCardId \|\| null/);
  });

  it('storing null rather than an empty string when unlinked', () => {
    // An empty string reads as "linked" to any report checking for a value.
    expect(invSvc).toMatch(/inv\.jobCardId \|\| null/);
  });
});

describe('the chain is complete end to end', () => {
  it('job card → repair order → invoice all carry the same job card id', () => {
    // The three hops that let a shop trace a finished job to what was billed.
    expect(jobCards).toMatch(/jobCardId:\s+selectedJob\.id/);   // into the RO
    expect(roView).toMatch(/jobCardId:\s+prefill\.jobCardId/);  // received by the RO
    expect(roView).toMatch(/jobCardId: ro\.jobCardId/);         // on to the invoice
  });

  it('the repair order still records its invoice number, closing the loop back', () => {
    expect(roView).toMatch(/updateRepairOrder\(ro\.id, \{ invoiceNumber: invNumber \}\)/);
  });
});
