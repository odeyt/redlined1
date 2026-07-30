import { getPlanStatus, canAccess, needsWatermark } from '../planGate';

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

  it('treats an explicit free plan as free even with a future trial date', () => {
    expect(getPlanStatus('free', future())).toBe('free');
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

describe('needsWatermark', () => {
  it('marks only free', () => {
    expect(needsWatermark('free')).toBe(true);
    expect(needsWatermark('trial')).toBe(false);
    expect(needsWatermark('pro')).toBe(false);
  });
});
