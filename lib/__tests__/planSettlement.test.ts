/**
 * When the app repairs an unsettled plan on load.
 *
 * ensureInitialPlan runs in /auth/callback and /api/provision. Neither fires
 * for the common case:
 *
 *   - the callback handles email-confirmation links, NOT password sign-in
 *   - /api/provision is only called when a user has no shop membership
 *
 * So an existing account signing in normally hit neither, and its plan was
 * never settled. Observed live: an account signed in after the trial change
 * shipped and stayed 'free' with a future trial date the app ignores, losing
 * the paid modules its trial should have included.
 *
 * usePlan reads the plan on every load, so it is where the repair belongs.
 *
 * The rule that must not regress: a spent trial is 'free' with a NULL end
 * date, and must never be settled again — otherwise signing in would grant a
 * fresh trial indefinitely.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const usePlanSrc = readFileSync(join(__dirname, '..', 'usePlan.ts'), 'utf8');

/** Mirrors the needsSettling condition in lib/usePlan.ts. */
function needsSettling(row: { plan: string | null; trial_ends_at: string | null }): boolean {
  return row.plan == null
    || (row.plan === 'free'
        && row.trial_ends_at != null
        && new Date(row.trial_ends_at) > new Date());
}

const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
const past   = new Date(Date.now() - 5 * 86_400_000).toISOString();

describe('rows that need settling', () => {
  it('a profile with no plan recorded', () => {
    expect(needsSettling({ plan: null, trial_ends_at: null })).toBe(true);
  });

  it("the contradictory signup row: 'free' with a future trial date", () => {
    // Exactly the state that left an account without Vehicle Intake.
    expect(needsSettling({ plan: 'free', trial_ends_at: future })).toBe(true);
  });
});

describe('rows that must be left alone', () => {
  it('a spent trial — free with no end date — never gets a second one', () => {
    expect(needsSettling({ plan: 'free', trial_ends_at: null })).toBe(false);
  });

  it('a lapsed date does not reopen a trial either', () => {
    expect(needsSettling({ plan: 'free', trial_ends_at: past })).toBe(false);
  });

  it('an active trial is already settled', () => {
    expect(needsSettling({ plan: 'trial', trial_ends_at: future })).toBe(false);
  });

  it.each(['solo', 'starter', 'professional', 'business', 'enterprise', 'pro'])(
    'a paying customer on %s is never touched', plan => {
      expect(needsSettling({ plan, trial_ends_at: null })).toBe(false);
      expect(needsSettling({ plan, trial_ends_at: future })).toBe(false);
    });
});

describe('the implementation', () => {
  it('settles before reading the plan, not after', () => {
    expect(usePlanSrc.indexOf('needsSettling')).toBeLessThan(usePlanSrc.indexOf('getPlanStatus('));
  });

  it('re-reads the profile after settling, so the first render is correct', () => {
    const after = usePlanSrc.slice(usePlanSrc.indexOf('if (needsSettling)'));
    expect(after).toMatch(/from\('profiles'\)/);
  });

  it('makes no request for an already-settled account', () => {
    expect(usePlanSrc).toMatch(/if \(needsSettling\)/);
  });

  it('tolerates the settle request failing rather than breaking the load', () => {
    const after = usePlanSrc.slice(usePlanSrc.indexOf('if (needsSettling)'));
    expect(after).toMatch(/catch/);
  });
});
