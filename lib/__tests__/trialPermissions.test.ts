/**
 * Permission audit for trial accounts.
 *
 * Access is decided by two independent gates that both have to pass:
 *   plan  — lib/planGate.ts       canAccess(module, status)
 *   role  — lib/useShop.ts        getBlockedModules(role)
 *
 * AppShell and Sidebar intersect them, so a bug in either direction is a real
 * problem: a trial that silently behaves like free (customer paid attention for
 * nothing), or a trial that bypasses role limits (a technician seeing payroll).
 *
 * Live context this was written against: two customer accounts sit on
 * plan='trial' expiring 2026-08-06, both owner of their own shop.
 */
import { getPlanStatus, canAccess, needsWatermark } from '../planGate';
import { getBlockedModules, MANAGER_BLOCKED, TECHNICIAN_BLOCKED } from '../useShop';

const future = () => new Date(Date.now() + 5 * 86_400_000).toISOString();
const past   = () => new Date(Date.now() - 1 * 86_400_000).toISOString();

/** Everything a shop can reach, free and paid alike. */
const ALL_MODULES = [
  'dashboard', 'command-center', 'customers', 'vehicles', 'appointments', 'scheduling',
  'job-cards', 'job-archive', 'inspections', 'estimates', 'repair-orders', 'technicians',
  'parts', 'parts-orders', 'parts-received', 'parts-estimates', 'invoices', 'payments',
  'communication', 'vin', 'dtc', 'diagnostics', 'ai', 'reports', 'labor-guide',
  'time-tracking', 'repair-intelligence', 'triage', 'settings', 'subscriptions', 'billing',
];

/** Modules a Free Forever shop must NOT reach. */
const PAID_ONLY = ['parts', 'reports', 'ai', 'technicians', 'payments', 'diagnostics'];

/** Effective access = plan allows AND role allows. */
function canUse(module: string, status: 'trial' | 'free' | 'pro', role: string): boolean {
  return canAccess(module, status) && !getBlockedModules(role).includes(module);
}

describe('an active trial', () => {
  const status = getPlanStatus('trial', future());

  it('resolves as trial, not free', () => {
    expect(status).toBe('trial');
  });

  it('unlocks every module at the plan gate — the point of a trial', () => {
    for (const m of ALL_MODULES) {
      expect(canAccess(m, status)).toBe(true);
    }
  });

  it('gives a trial owner the whole product', () => {
    for (const m of ALL_MODULES) {
      expect(canUse(m, status, 'owner')).toBe(true);
    }
  });

  it('shows no upgrade watermark', () => {
    expect(needsWatermark(status)).toBe(false);
  });
});

describe('a trial must not override role limits', () => {
  const status = getPlanStatus('trial', future());

  it('still hides financials from a technician', () => {
    for (const m of ['invoices', 'payments', 'reports', 'settings']) {
      expect(TECHNICIAN_BLOCKED).toContain(m);
      expect(canUse(m, status, 'technician')).toBe(false);
    }
  });

  it('still hides financials and admin from a manager', () => {
    for (const m of ['invoices', 'payments', 'settings', 'subscriptions']) {
      expect(MANAGER_BLOCKED).toContain(m);
      expect(canUse(m, status, 'manager')).toBe(false);
    }
  });

  it('does give a trial technician their shop-floor tools', () => {
    for (const m of ['job-cards', 'inspections', 'repair-orders', 'parts']) {
      expect(canUse(m, status, 'technician')).toBe(true);
    }
  });

  it('blocks everything beyond the dashboard while the role is unknown', () => {
    // Roles resolve asynchronously; an empty role must fail closed, not open.
    for (const m of ['customers', 'invoices', 'settings']) {
      expect(canUse(m, status, '')).toBe(false);
    }
  });
});

describe('when the trial lapses', () => {
  const lapsed = getPlanStatus('trial', past());

  it('drops to free, not to locked-out', () => {
    expect(lapsed).toBe('free');
  });

  it('keeps the core workflow an owner needs to keep trading', () => {
    for (const m of ['dashboard', 'customers', 'vehicles', 'job-cards', 'estimates', 'invoices']) {
      expect(canUse(m, lapsed, 'owner')).toBe(true);
    }
  });

  it('withdraws the paid modules', () => {
    for (const m of PAID_ONLY) {
      expect(canAccess(m, lapsed)).toBe(false);
    }
  });

  it('leaves settings and subscriptions reachable so they can pay', () => {
    // Locking a lapsed customer out of billing would make recovery impossible.
    expect(canUse('settings', lapsed, 'owner')).toBe(true);
    expect(canUse('subscriptions', lapsed, 'owner')).toBe(true);
  });
});

describe('trial vs the other plans', () => {
  it('grants strictly more than free', () => {
    const trial = getPlanStatus('trial', future());
    const free = getPlanStatus('free', null);
    for (const m of PAID_ONLY) {
      expect(canAccess(m, trial)).toBe(true);
      expect(canAccess(m, free)).toBe(false);
    }
  });

  it('grants the same module set as pro while it runs', () => {
    const trial = getPlanStatus('trial', future());
    for (const m of ALL_MODULES) {
      expect(canAccess(m, trial)).toBe(canAccess(m, 'pro'));
    }
  });

  // Changed on 2026-08-03. This asserted that a trial date could not grant
  // access "once a plan says free", to stop a stale trial_ends_at re-opening a
  // Free Forever account. But plan 'free' with a future date is precisely what
  // a signup writes, so the rule locked new customers out of the trial they had
  // been promised.
  //
  // Access is now decided by the date, and a spent trial has none: lapsing
  // clears it. The second assertion is the one carrying that weight.
  it('is granted by an unexpired trial date, whatever the plan column says', () => {
    expect(getPlanStatus('free', future())).toBe('trial');
  });

  it('is over for good once the date is cleared, so it cannot be re-opened', () => {
    expect(getPlanStatus('free', null)).toBe('free');
  });
});
