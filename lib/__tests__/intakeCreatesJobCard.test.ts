/**
 * Intake finishes the job card, rather than leaving a form to save.
 *
 * A shop ran a test intake end to end and reported that no job card, repair
 * order or parts quotation appeared. Nothing had failed: "Send to Job Card"
 * dispatched OPEN_NEW_JOB_CARD with a prefill and stopped there, so the job
 * card existed only as unsaved fields until somebody noticed the form and
 * pressed Create. The customer and vehicle were real — they are created by
 * the intake itself — which is what made it look like a partial failure
 * rather than an outstanding step.
 *
 * These read source rather than rendering, matching intakeToInspection.test.ts
 * next door. That buys less than a render test would, but it does pin the two
 * things that actually regressed: that the create call is there at all, and
 * that the follow-on records hang off it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const triage   = read('features/triage/TriageView.tsx');
const jobCards = read('features/job-cards/JobCardsView.tsx');
const followOn = read('services/jobCardFollowOnService.ts');

describe('intake creates the job card itself', () => {
  it('calls createJobCard rather than only prefilling a form', () => {
    expect(triage).toMatch(/import \{ createJobCard \} from '@\/services\/jobCardService'/);
    expect(triage).toMatch(/const job = await createJobCard\(\{/);
  });

  it('carries the intake into the job card it creates', () => {
    // The complaint summary is the whole point of the intake; a job card
    // created without it discards everything the advisor just captured.
    expect(triage).toMatch(/notes:\s+session\.complaintSummary/);
    expect(triage).toMatch(/priority:\s+urgencyToPriority\(session\.techNotes\.urgency\)/);
    expect(triage).toMatch(/categoryToServiceHint\(session\.categoryId\)/);
  });

  it('raises the repair order and quotation from the job card it just created', () => {
    expect(triage).toMatch(/await createJobCardFollowOns\(\{[\s\S]*?jobCardId:\s+job\.id/);
  });

  it('still opens the prefilled form when there is no customer to own the card', () => {
    // A walk-in with no name cannot own a job card. The form is the correct
    // fallback there, not a record attached to nobody.
    expect(triage).toMatch(/if \(!customerName\) \{[\s\S]*?openPrefilledForm\(/);
  });

  it('falls back to the form when the job card cannot be created', () => {
    // The intake session, customer and vehicle are already saved by then —
    // dropping the advisor back to a blank module would lose that work.
    expect(triage).toMatch(/catch \(e\) \{[\s\S]*?openPrefilledForm\([\s\S]*?Could not create the job card/);
  });
});

describe('saving a job card by hand raises the same follow-on records', () => {
  it('JobCardsView creates them too, so both paths agree', () => {
    expect(jobCards).toMatch(/import \{ createJobCardFollowOns \} from '@\/services\/jobCardFollowOnService'/);
    expect(jobCards).toMatch(/await createJobCardFollowOns\(\{[\s\S]*?jobCardId:\s+job\.id/);
  });
});

describe('the follow-on helper cannot take a job card down with it', () => {
  it('never rethrows — every path returns a result', () => {
    // If this ever throws, a failed quotation insert loses the job card that
    // was already created, which is strictly worse than no quotation.
    expect(followOn).not.toMatch(/\bthrow\b/);
    const returns = followOn.match(/return \{ roNumber/g) ?? [];
    expect(returns.length).toBeGreaterThanOrEqual(2);
  });
});
