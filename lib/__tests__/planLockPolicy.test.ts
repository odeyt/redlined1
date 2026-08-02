/**
 * The lapse policy: what a customer experiences when a trial or subscription
 * ends, expressed as the conditions AppShell renders on.
 *
 * The rule these encode is a commercial one, chosen deliberately on
 * 2026-08-02: billing being ON must NOT by itself lock anyone out. The product
 * is sold as "Free forever with core features", so a lapsed plan drops to the
 * free tier and keeps working unless the shop explicitly opts into requiring a
 * subscription (NEXT_PUBLIC_ENFORCE_PLAN_LOCK).
 *
 * Tying the two together is the specific mistake being guarded against: it
 * would mean switching on checkout also starts locking out every lapsed trial,
 * and a fault in the payment path would leave customers both locked out and
 * unable to pay.
 */
import { getPlanStatus, needsWatermark } from '../planGate';

/** Mirrors the lock condition in components/AppShell.tsx. */
function showsLockScreen(opts: {
  planStatus: 'trial' | 'free' | 'pro';
  profileLoaded: boolean;
  enforcePlanLock: boolean;
  isFreeForever: boolean;
}): boolean {
  return opts.planStatus === 'free'
    && opts.profileLoaded
    && opts.enforcePlanLock
    && !opts.isFreeForever;
}

/** Mirrors the watermark condition in components/AppShell.tsx. */
function showsWatermark(opts: {
  planStatus: 'trial' | 'free' | 'pro';
  enforcePlanLock: boolean;
  isFreeForever: boolean;
}): boolean {
  return needsWatermark(opts.planStatus) && opts.enforcePlanLock && !opts.isFreeForever;
}

const past = () => new Date(Date.now() - 86_400_000).toISOString();
const lapsedTrial = getPlanStatus('trial', past());

describe('billing enabled must not lock anyone out by itself', () => {
  it('a lapsed trial keeps working when the lock is not enforced', () => {
    expect(showsLockScreen({
      planStatus: lapsedTrial, profileLoaded: true,
      enforcePlanLock: false, isFreeForever: false,
    })).toBe(false);
  });

  it('and its invoices are not watermarked either', () => {
    expect(showsWatermark({
      planStatus: lapsedTrial, enforcePlanLock: false, isFreeForever: false,
    })).toBe(false);
  });

  it('locks only when the shop opts in', () => {
    expect(showsLockScreen({
      planStatus: lapsedTrial, profileLoaded: true,
      enforcePlanLock: true, isFreeForever: false,
    })).toBe(true);
  });
});

describe('who is never locked out, whatever the setting', () => {
  it('a Free Forever customer — they were promised exactly this', () => {
    for (const enforcePlanLock of [true, false]) {
      expect(showsLockScreen({
        planStatus: 'free', profileLoaded: true, enforcePlanLock, isFreeForever: true,
      })).toBe(false);
    }
  });

  it('an active trial', () => {
    const active = getPlanStatus('trial', new Date(Date.now() + 86_400_000).toISOString());
    expect(showsLockScreen({
      planStatus: active, profileLoaded: true, enforcePlanLock: true, isFreeForever: false,
    })).toBe(false);
  });

  it('a paying customer', () => {
    expect(showsLockScreen({
      planStatus: 'pro', profileLoaded: true, enforcePlanLock: true, isFreeForever: false,
    })).toBe(false);
  });

  it('anyone whose profile failed to load — infrastructure must not lock users out', () => {
    // profileLoaded false means the DB read failed, e.g. an RLS misconfiguration.
    expect(showsLockScreen({
      planStatus: 'free', profileLoaded: false, enforcePlanLock: true, isFreeForever: false,
    })).toBe(false);
  });
});
