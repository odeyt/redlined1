/**
 * The QA gate has to be visible, not just enforced.
 *
 * An owner opened an In Progress repair order and tried to complete it. There
 * was nothing to click: the QA Sign-Off button renders only at Pending
 * Approval, and Complete is filtered out of the status dropdown. So the app
 * showed no completion action and no reason for its absence.
 *
 * That cost several rounds of debugging aimed at the database — a missing
 * UPDATE policy, a stale bundle, RLS filtering — when the truth was that no
 * write had ever been attempted. An invisible precondition is indistinguishable
 * from a broken feature, by anyone, including whoever is reading the logs.
 *
 * The gate itself is right and stays: QA sign-off is what drafts the invoice.
 * Only its silence is fixed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(
  join(__dirname, '..', '..', 'features/repair-orders/RepairOrdersView.tsx'),
  'utf8',
);

const block = src.slice(
  src.indexOf('{/* SA / MANAGER / OWNER: QA Sign-Off when Pending Approval */}'),
  src.indexOf('{/* SA / MANAGER / OWNER: re-open QA if Complete'),
);

describe('the reason the button is missing is on screen', () => {
  it('shows a disabled QA control before the technician submits', () => {
    expect(block).toMatch(/disabled/);
    expect(block).toMatch(/awaiting technician submission/i);
  });

  it('covers every status that precedes submission', () => {
    // The same list the technician's submit button uses, so the two cannot
    // disagree about when the work is submittable.
    expect(block).toMatch(/\['Open', 'In Progress', 'Pending Parts'\]\.includes\(selected\.status\)/);
  });

  it('explains what has to happen next, not merely that it is blocked', () => {
    expect(block).toMatch(/title="The technician must submit/);
  });

  it('is hidden from the technician, who is the one who must act', () => {
    expect(block).toMatch(/\{!isTech &&/);
  });
});

describe('the gate itself is unchanged', () => {
  it('the real QA button still requires Pending Approval', () => {
    expect(block).toMatch(/selected\.status === 'Pending Approval' &&[\s\S]*?setQaTarget\(selected\)/);
  });

  it('Complete is still not selectable directly', () => {
    // Bypassing QA would skip the sign-off that drafts the invoice.
    expect(src).toMatch(/RO_STATUSES\.filter\(s => s !== 'Complete' && s !== 'Closed'\)/);
    expect(src).toMatch(/Cannot set status to Complete or Closed directly/);
  });

  it('the technician keeps the only route into Pending Approval', () => {
    expect(src).toMatch(/isTech && \['Open', 'In Progress', 'Pending Parts'\]\.includes\(selected\.status\)/);
  });
});
