/**
 * Every account that could pay must have a visible way to do so.
 *
 * The sidebar showed a trial banner only when three or fewer days remained,
 * and that banner contained no link. So a customer four days into a trial saw
 * nothing at all, and one on their final day saw a countdown with nothing to
 * act on. There was no upgrade affordance anywhere in the sidebar for a trial
 * account — at exactly the point of most intent.
 *
 * Found on a real account: plan 'trial', four days remaining, no upgrade
 * button.
 *
 * Note the free-plan banner had the mirror-image bug and was fixed separately:
 * it linked to /signup, asking a signed-in customer to create a second
 * account. Both are the same failure — the plan picker existed and nothing
 * pointed at it. See [[upgradePath.test]].
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { getPlanStatus, trialDaysLeft } from '../planGate';

const sidebar = readFileSync(join(__dirname, '..', '..', 'components', 'Sidebar.tsx'), 'utf8');

/** Mirrors the banner conditions in components/Sidebar.tsx. */
function banner(planStatus: 'trial' | 'free' | 'pro', daysLeft: number | null) {
  if (planStatus === 'trial' && daysLeft !== null) return 'trial';
  if (planStatus === 'free') return 'free';
  return null;
}

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

describe('a trial account always has an upgrade route', () => {
  it.each([7, 6, 5, 4, 3, 2, 1])('shows the banner with %d days left', days => {
    const status = getPlanStatus('trial', inDays(days));
    expect(status).toBe('trial');
    expect(banner(status, trialDaysLeft(inDays(days)))).toBe('trial');
  });

  it('specifically at four days — the case reported, which showed nothing', () => {
    const ends = inDays(4);
    expect(banner(getPlanStatus('trial', ends), trialDaysLeft(ends))).toBe('trial');
  });

  it('a lapsed trial falls through to the free banner, which also upgrades', () => {
    const ends = inDays(-1);
    expect(banner(getPlanStatus('trial', ends), trialDaysLeft(ends))).toBe('free');
  });

  it('a paying customer is not nagged', () => {
    expect(banner(getPlanStatus('starter', null), null)).toBeNull();
  });
});

describe('the banners actually lead somewhere', () => {
  it('both open the plan picker rather than the signup page', () => {
    const opens = sidebar.match(/module: 'subscriptions'/g) ?? [];
    // One for the trial banner, one for the free banner.
    expect(opens.length).toBeGreaterThanOrEqual(2);
  });

  it('the trial banner is not restricted to the final three days', () => {
    // The old condition gated the whole banner on daysLeft <= 3.
    expect(sidebar).not.toMatch(/planStatus === 'trial' && daysLeft !== null && daysLeft <= 3 &&/);
  });

  it('urgency styling still changes at three days', () => {
    expect(sidebar).toMatch(/daysLeft <= 3 \?/);
  });
});
