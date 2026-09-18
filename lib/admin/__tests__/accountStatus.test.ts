import { readFileSync } from 'fs';
import { join } from 'path';
import { deriveAccountStatus, isLoginInactive, LOGIN_INACTIVITY_THRESHOLD_DAYS } from '../accountStatus';

const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const past = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

describe('deriveAccountStatus', () => {
  it('classifies internal D1 shops without touching billing framing', () => {
    const r = deriveAccountStatus({
      plan: 'professional', trialEndsAt: null, billingStatus: null,
      isInternal: true, subscription: null,
    });
    expect(r.status).toBe('internal');
    expect(r.billingMismatch).toBe(false);
  });

  it('a null plan with no trial is free', () => {
    const r = deriveAccountStatus({
      plan: null, trialEndsAt: null, billingStatus: null,
      isInternal: false, subscription: null,
    });
    expect(r.status).toBe('free');
  });

  it('a spent trial (past trial_ends_at, no paid plan) is free, not trialing', () => {
    const r = deriveAccountStatus({
      plan: 'free', trialEndsAt: past(1), billingStatus: null,
      isInternal: false, subscription: null,
    });
    expect(r.status).toBe('free');
  });

  it('an unexpired trial date is trialing whatever the plan column says (planGate tolerance)', () => {
    const r = deriveAccountStatus({
      plan: 'free', trialEndsAt: future(5), billingStatus: null,
      isInternal: false, subscription: null,
    });
    expect(r.status).toBe('trialing');
    expect(r.trialDaysLeft).toBeGreaterThanOrEqual(4);
    expect(r.trialDaysLeft).toBeLessThanOrEqual(5);
  });

  it('a paid plan with an active subscription is active_paid, no mismatch', () => {
    const r = deriveAccountStatus({
      plan: 'professional', trialEndsAt: null, billingStatus: 'active',
      isInternal: false, subscription: { status: 'active', billingProvider: 'creem' },
    });
    expect(r.status).toBe('active_paid');
    expect(r.billingMismatch).toBe(false);
  });

  it('a free plan with an active subscription stays free but is flagged as a mismatch (paying without paid access)', () => {
    const r = deriveAccountStatus({
      plan: 'free', trialEndsAt: null, billingStatus: 'inactive',
      isInternal: false, subscription: { status: 'active', billingProvider: 'creem' },
    });
    expect(r.status).toBe('free');
    expect(r.billingMismatch).toBe(true);
    expect(r.mismatchReason).toMatch(/paying without receiving paid features/);
  });

  it('a free plan with no subscription, or a cancelled one, is an ordinary free account', () => {
    for (const subscription of [null, { status: 'cancelled', billingProvider: 'creem' }]) {
      const r = deriveAccountStatus({ plan: 'free', trialEndsAt: null, billingStatus: null, isInternal: false, subscription });
      expect(r.status).toBe('free');
      expect(r.billingMismatch).toBe(false);
    }
  });

  it('active subscription but profiles.billing_status disagrees is a genuine mismatch (both fields are written by the same handler)', () => {
    const r = deriveAccountStatus({
      plan: 'professional', trialEndsAt: null, billingStatus: 'past_due',
      isInternal: false, subscription: { status: 'active', billingProvider: 'creem' },
    });
    expect(r.status).toBe('active_paid');
    expect(r.billingMismatch).toBe(true);
  });

  it('a cancelled subscription with a still-paid profile is documented policy, not a billing mismatch', () => {
    const r = deriveAccountStatus({
      plan: 'professional', trialEndsAt: null, billingStatus: 'cancelled',
      isInternal: false, subscription: { status: 'cancelled', billingProvider: 'creem' },
    });
    expect(r.status).toBe('cancelled_access_retained');
    expect(r.billingMismatch).toBe(false);
    expect(r.mismatchReason).toBeNull();
    expect(r.policyNote).toMatch(/access retained/i);
    expect(r.policyNote).not.toMatch(/synchronization defect|sync defect/i);
  });

  it('past_due subscription status wins regardless of billing_status agreement, and is not flagged when they agree', () => {
    const r = deriveAccountStatus({
      plan: 'business', trialEndsAt: null, billingStatus: 'past_due',
      isInternal: false, subscription: { status: 'past_due', billingProvider: 'creem' },
    });
    expect(r.status).toBe('past_due');
    expect(r.billingMismatch).toBe(false);
  });

  it('there is no complimentary status — a manual billing provider does not change the classification', () => {
    const withManual = deriveAccountStatus({
      plan: 'business', trialEndsAt: null, billingStatus: 'active',
      isInternal: false, subscription: { status: 'active', billingProvider: 'manual' },
    });
    const withCreem = deriveAccountStatus({
      plan: 'business', trialEndsAt: null, billingStatus: 'active',
      isInternal: false, subscription: { status: 'active', billingProvider: 'creem' },
    });
    expect(withManual.status).toBe(withCreem.status);
    expect(withManual.status).toBe('active_paid');
  });

  it('the AccountStatus union has no complimentary member, and no branch ever returns one', () => {
    // Doc comments are allowed to explain why "complimentary" was removed
    // (and do) — what must never reappear is the string used as an actual
    // status value: a type-union member or a `status: 'complimentary'` return.
    const src = readFileSync(join(__dirname, '..', 'accountStatus.ts'), 'utf8');
    expect(src).not.toMatch(/\|\s*'complimentary'/);
    expect(src).not.toMatch(/status:\s*'complimentary'/);
  });

  it('a paid plan with no subscription row and no corroborating billing_status is paid_billing_unverified, flagged', () => {
    const r = deriveAccountStatus({
      plan: 'starter', trialEndsAt: null, billingStatus: null,
      isInternal: false, subscription: null,
    });
    expect(r.status).toBe('paid_billing_unverified');
    expect(r.billingMismatch).toBe(true);
    expect(r.mismatchReason).toMatch(/no shop_subscriptions row/);
  });

  it('a subscription row in a status the live webhook never writes is flagged as paid_billing_unverified, not silently trusted', () => {
    const r = deriveAccountStatus({
      plan: 'business', trialEndsAt: null, billingStatus: null,
      isInternal: false, subscription: { status: 'suspended', billingProvider: 'creem' },
    });
    expect(r.status).toBe('paid_billing_unverified');
    expect(r.billingMismatch).toBe(true);
  });

  it('every mismatch has a reason, and every non-mismatch has none', () => {
    const cases: Array<Parameters<typeof deriveAccountStatus>[0]> = [
      { plan: 'professional', trialEndsAt: null, billingStatus: 'active', isInternal: false, subscription: { status: 'active', billingProvider: 'creem' } },
      { plan: 'professional', trialEndsAt: null, billingStatus: null, isInternal: false, subscription: null },
    ];
    for (const c of cases) {
      const r = deriveAccountStatus(c);
      expect(r.billingMismatch ? typeof r.mismatchReason === 'string' : r.mismatchReason === null).toBe(true);
    }
  });
});

describe('isLoginInactive — a login-recency badge, never a product-activity claim', () => {
  it('is false when last_sign_in_at was never fetched (undefined) — unknown is not asserted inactive', () => {
    expect(isLoginInactive(undefined)).toBe(false);
  });

  it('is true when the account has never signed in (null)', () => {
    expect(isLoginInactive(null)).toBe(true);
  });

  it('is false for a login within the documented threshold', () => {
    const recent = new Date(Date.now() - 1 * 86400000).toISOString();
    expect(isLoginInactive(recent)).toBe(false);
  });

  it('is true for a login older than the documented threshold', () => {
    const old = new Date(Date.now() - (LOGIN_INACTIVITY_THRESHOLD_DAYS + 5) * 86400000).toISOString();
    expect(isLoginInactive(old)).toBe(true);
  });
});
