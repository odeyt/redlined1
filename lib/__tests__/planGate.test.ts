import { getPlanStatus, canAccess, needsWatermark, seatLimitFor } from '../planGate';

const future = () => new Date(Date.now() + 7 * 86_400_000).toISOString();
const past   = () => new Date(Date.now() - 1 * 86_400_000).toISOString();

// Modules deliberately outside the Free Forever allowlist.
const PAID_MODULES = ['parts', 'reports', 'ai', 'technicians', 'payments'];
// A representative slice of the free allowlist.
const FREE_MODULES = ['dashboard', 'customers', 'vehicles', 'job-cards', 'invoices'];

describe('getPlanStatus', () => {
  it('treats an unexpired trial as trial', () => {
    expect(getPlanStatus('trial', future())).toBe('trial');
  });

  it('treats a lapsed trial as free', () => {
    expect(getPlanStatus('trial', past())).toBe('free');
  });

  it('treats a null plan with no trial date as free', () => {
    expect(getPlanStatus(null, null)).toBe('free');
  });

  // Changed on 2026-08-03, when new accounts began getting a trial.
  //
  // This previously asserted the opposite: plan 'free' with a future date read
  // as free, so that a stale trial_ends_at could not re-open access. But that
  // is exactly the row a signup trigger writes, so every new customer silently
  // lost the paid modules their trial included, while older accounts kept them.
  //
  // The protection now comes from the date rather than the column: lapsing
  // CLEARS trial_ends_at, so a spent trial has nothing left to re-open. The
  // two tests below are the ones that hold that guarantee.
  it('treats a future trial date as a trial, whatever the plan column says', () => {
    expect(getPlanStatus('free', future())).toBe('trial');
  });

  it('treats a cleared trial date as free — this is what a spent trial looks like', () => {
    expect(getPlanStatus('free', null)).toBe('free');
  });

  it('never re-opens a trial once the date has passed', () => {
    expect(getPlanStatus('free', past())).toBe('free');
  });

  it.each(['pro', 'solo', 'starter', 'professional', 'business', 'enterprise'])(
    'treats paid plan %s as pro', plan => {
      expect(getPlanStatus(plan, null)).toBe('pro');
    });

  it('keeps a paid plan as pro even if a stale trial date has lapsed', () => {
    expect(getPlanStatus('pro', past())).toBe('pro');
  });
});

describe('canAccess', () => {
  it('grants an active trial every paid module', () => {
    const status = getPlanStatus('trial', future());
    for (const m of PAID_MODULES) {
      expect(canAccess(m, status)).toBe(true);
    }
  });

  it('grants pro every paid module', () => {
    for (const m of PAID_MODULES) {
      expect(canAccess(m, 'pro')).toBe(true);
    }
  });

  it('denies free the paid modules', () => {
    for (const m of PAID_MODULES) {
      expect(canAccess(m, 'free')).toBe(false);
    }
  });

  it('grants free the core modules', () => {
    for (const m of FREE_MODULES) {
      expect(canAccess(m, 'free')).toBe(true);
    }
  });

  it('drops a lapsed trial to free-tier access', () => {
    const status = getPlanStatus('trial', past());
    expect(canAccess('parts', status)).toBe(false);
    expect(canAccess('customers', status)).toBe(true);
  });
});

describe('seatLimitFor', () => {
  it('caps Free at 1 seat', () => {
    expect(seatLimitFor(null, null)).toBe(1);
    expect(seatLimitFor('free', null)).toBe(1);
  });

  it('caps Solo at 1 seat, Starter at 3, Professional at 8', () => {
    expect(seatLimitFor('solo', null)).toBe(1);
    expect(seatLimitFor('starter', null)).toBe(3);
    expect(seatLimitFor('professional', null)).toBe(8);
  });

  it('leaves Business, Enterprise, and the generic "pro" value unlimited', () => {
    expect(seatLimitFor('business', null)).toBeNull();
    expect(seatLimitFor('enterprise', null)).toBeNull();
    expect(seatLimitFor('pro', null)).toBeNull();
  });

  it('does not cap an active trial that has not chosen a paid tier yet', () => {
    expect(seatLimitFor(null, future())).toBeNull();
  });

  it('caps a lapsed trial at the Free limit', () => {
    expect(seatLimitFor(null, past())).toBe(1);
  });

  it('a real paid plan value takes priority over a stale trial date either way', () => {
    expect(seatLimitFor('starter', future())).toBe(3);
    expect(seatLimitFor('starter', past())).toBe(3);
  });
});

describe('needsWatermark', () => {
  it('marks only free', () => {
    expect(needsWatermark('free')).toBe(true);
    expect(needsWatermark('trial')).toBe(false);
    expect(needsWatermark('pro')).toBe(false);
  });
});
