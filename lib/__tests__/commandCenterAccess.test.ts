/**
 * The landing module must be reachable by whoever gets sent to it.
 *
 * AppShell redirects owners and managers from 'dashboard' to 'command-center'
 * on load — it is the designated home. But command-center was absent from
 * FREE_MODULES, so a free owner was redirected there and then bounced straight
 * back by the plan gate: their home page was a module they could not open.
 *
 * The symptom that surfaced it was subtler — the free dashboard renders the
 * Command Center panel inline, so the feature was plainly visible while its
 * own page stayed locked.
 *
 * The rule this encodes: a module AppShell routes users to by default cannot
 * be plan-gated away from those same users.
 */
import { canAccess, getPlanStatus } from '../planGate';
import { getBlockedModules } from '../useShop';

/** Roles AppShell redirects to command-center (see AppShell useEffect). */
const REDIRECTED_ROLES = ['owner', 'manager'];

describe('command-center is reachable on every plan', () => {
  it.each(['free', 'trial', 'pro'] as const)('is accessible on the %s plan', status => {
    expect(canAccess('command-center', status)).toBe(true);
  });

  it('is accessible to a shop whose trial has lapsed', () => {
    const lapsed = getPlanStatus('trial', new Date(Date.now() - 86_400_000).toISOString());
    expect(lapsed).toBe('free');
    expect(canAccess('command-center', lapsed)).toBe(true);
  });

  it('is accessible to a brand-new shop with no plan row at all', () => {
    expect(canAccess('command-center', getPlanStatus(null, null))).toBe(true);
  });
});

describe('the roles redirected there can actually open it', () => {
  it.each(REDIRECTED_ROLES)('%s is not role-blocked from command-center', role => {
    expect(getBlockedModules(role)).not.toContain('command-center');
  });

  it('and can open it on the free plan specifically — the case that was broken', () => {
    for (const role of REDIRECTED_ROLES) {
      const roleOk = !getBlockedModules(role).includes('command-center');
      expect(roleOk && canAccess('command-center', 'free')).toBe(true);
    }
  });
});

describe('this did not weaken the free tier generally', () => {
  it('paid modules remain paid', () => {
    for (const id of ['parts', 'reports', 'ai', 'technicians', 'payments', 'diagnostics']) {
      expect(canAccess(id, 'free')).toBe(false);
    }
  });

  it('technicians are still kept out of command-center by role', () => {
    // Role gating is a separate axis and is unaffected by the plan change.
    expect(getBlockedModules('technician')).toContain('command-center');
  });
});
