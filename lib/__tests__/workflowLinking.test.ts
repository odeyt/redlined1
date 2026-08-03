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
