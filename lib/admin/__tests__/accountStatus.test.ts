import { readFileSync } from 'fs';
import { join } from 'path';
import {
  deriveAccountStatus, isLoginInactive, reconciliationOf, isConfirmedSubscription,
  ACCOUNT_STATUS_LABELS, UNVERIFIED_REASON_LABELS, LOGIN_INACTIVITY_THRESHOLD_DAYS,
  type AccountStatusInput, type AccountStatus,
} from '../accountStatus';
import { getPlanStatus } from '@/lib/planGate';
import { TRIAL_ACCESS_LABEL, PAID_NO_BILLING_RECORD_LABEL } from '../terminology';

const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const past = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

const sub = (status: string, o: Partial<NonNullable<AccountStatusInput['subscription']>> = {}) =>
  ({ status, billingProvider: 'creem', hasProviderReference: true, cancelAtPeriodEnd: false, ...o });

const input = (o: Partial<AccountStatusInput>): AccountStatusInput => ({
  plan: null, trialEndsAt: null, billingStatus: null, isInternal: false, subscription: null, ...o,
});

describe('primary commercial states', () => {
  it('internal: only the explicit marker, and never a billing state', () => {
    const r = deriveAccountStatus(input({ plan: 'professional', isInternal: true, subscription: sub('active') }));
    expect(r.status).toBe('internal');
    expect(r.billingMismatch).toBe(false);
    expect(r.revenueVerified).toBe(false);
  });

  it('free: a null plan, a free plan, or a spent trial', () => {
    expect(deriveAccountStatus(input({})).status).toBe('free');
    expect(deriveAccountStatus(input({ plan: 'free' })).status).toBe('free');
    expect(deriveAccountStatus(input({ plan: 'free', trialEndsAt: past(1) })).status).toBe('free');
  });

  it('trialing ("Trial access"): an unexpired trial date wins whatever the plan column says (planGate tolerance)', () => {
    const r = deriveAccountStatus(input({ plan: 'free', trialEndsAt: future(5) }));
    expect(r.status).toBe('trialing');
    expect(r.trialDaysLeft).toBeGreaterThanOrEqual(4);
    expect(r.trialDaysLeft).toBeLessThanOrEqual(5);
  });

  it('active_paid: paid entitlement + active subscription + agreeing billing_status', () => {
    const r = deriveAccountStatus(input({ plan: 'professional', billingStatus: 'active', subscription: sub('active') }));
    expect(r.status).toBe('active_paid');
    expect(r.billingMismatch).toBe(false);
    expect(r.revenueVerified).toBe(true);
  });

  it('cancel_scheduled: an active subscription set to cancel at period end still pays this period', () => {
    const r = deriveAccountStatus(input({ plan: 'professional', billingStatus: 'active', subscription: sub('active', { cancelAtPeriodEnd: true }) }));
    expect(r.status).toBe('cancel_scheduled');
    expect(r.billingMismatch).toBe(false);
    expect(r.revenueVerified).toBe(true);
  });

  it('past_due: subscription past due, billing_status agreeing (or absent)', () => {
    const r = deriveAccountStatus(input({ plan: 'business', billingStatus: 'past_due', subscription: sub('past_due') }));
    expect(r.status).toBe('past_due');
    expect(r.billingMismatch).toBe(false);
    expect(r.revenueVerified).toBe(false); // at risk, not confirmed revenue
  });

  it('cancelled_access_retained: documented policy, not a defect and not a mismatch', () => {
    const r = deriveAccountStatus(input({ plan: 'professional', billingStatus: 'cancelled', subscription: sub('cancelled') }));
    expect(r.status).toBe('cancelled_access_retained');
    expect(r.billingMismatch).toBe(false);
    expect(r.mismatchReason).toBeNull();
    expect(r.policyNote).toMatch(/access retained/i);
    expect(r.policyNote).not.toMatch(/synchronization defect|sync defect/i);
    expect(r.revenueVerified).toBe(false);
  });

  it('expired: an expired subscription on a free entitlement', () => {
    const r = deriveAccountStatus(input({ plan: 'free', subscription: sub('expired') }));
    expect(r.status).toBe('expired');
    expect(r.planState).toBe('free');
    expect(r.billingMismatch).toBe(false);
  });

  it('a cancelled subscription on a free entitlement is just a free account', () => {
    const r = deriveAccountStatus(input({ plan: 'free', subscription: sub('cancelled') }));
    expect(r.status).toBe('free');
    expect(r.billingMismatch).toBe(false);
  });
});

describe('paid_unverified — paid entitlement the billing record does not confirm', () => {
  it('no subscription row and no corroborating billing_status', () => {
    for (const plan of ['pro', 'solo', 'starter', 'professional', 'enterprise']) {
      const r = deriveAccountStatus(input({ plan, billingStatus: 'inactive' }));
      expect(r.status).toBe('paid_unverified');
      expect(r.unverifiedReason).toBe('no_billing_record');
      expect(r.mismatchKind).toBeNull();
      expect(r.billingMismatch).toBe(true);
      expect(r.revenueVerified).toBe(false);
      expect(r.mismatchReason).toMatch(/no shop_subscriptions row/);
    }
  });

  it('a subscription in a status the live webhook never writes is not silently trusted', () => {
    for (const status of ['suspended', 'trialing', 'manual']) {
      const r = deriveAccountStatus(input({ plan: 'business', subscription: sub(status) }));
      expect(r.status).toBe('paid_unverified');
      expect(r.unverifiedReason).toBe('unrecognised_subscription_status');
      expect(r.revenueVerified).toBe(false);
    }
  });

  it('a UI plan label alone is never verified payment, whatever the email, name or plan looks like', () => {
    const r = deriveAccountStatus(input({ plan: 'pro', billingStatus: 'inactive' }));
    expect(r.status).not.toBe('active_paid');
    expect(r.status).not.toBe('internal');
    expect(r.revenueVerified).toBe(false);
  });

  it('only the explicit internal marker makes a shop internal', () => {
    const base = { plan: 'pro', billingStatus: 'inactive' };
    expect(deriveAccountStatus(input({ ...base })).status).not.toBe('internal');
    expect(deriveAccountStatus(input({ ...base, isInternal: true })).status).toBe('internal');
  });

  it('is labelled honestly: the no-record case keeps its exact label and is not called customer, complimentary, internal or a failure', () => {
    expect(UNVERIFIED_REASON_LABELS.no_billing_record).toBe(PAID_NO_BILLING_RECORD_LABEL);
    expect(PAID_NO_BILLING_RECORD_LABEL).toBe('Paid access, no billing record');
    expect(PAID_NO_BILLING_RECORD_LABEL).not.toMatch(/customer|subscription|active|complimentary|internal|fraud|fail/i);
    expect(ACCOUNT_STATUS_LABELS.paid_unverified).toBe('Paid access, unverified');
  });
});

describe('billing_mismatch — contradictory evidence fails closed', () => {
  const mismatchCases: Array<[string, AccountStatusInput, string]> = [
    ['free plan with an active subscription', input({ plan: 'free', billingStatus: 'inactive', subscription: sub('active') }), 'free_plan_active_subscription'],
    ['free plan with a past-due subscription', input({ plan: 'free', subscription: sub('past_due') }), 'free_plan_active_subscription'],
    ['free plan with a billing-provider trial', input({ plan: 'free', subscription: sub('trialing') }), 'billing_trial_free_entitlement'],
    ['profile trial with an active subscription', input({ plan: 'trial', trialEndsAt: future(3), subscription: sub('active') }), 'trial_entitlement_active_subscription'],
    ['active subscription, profile billing_status disagrees', input({ plan: 'professional', billingStatus: 'past_due', subscription: sub('active') }), 'billing_status_disagrees'],
    ['past-due subscription, profile billing_status disagrees', input({ plan: 'professional', billingStatus: 'active', subscription: sub('past_due') }), 'billing_status_disagrees'],
    ['paid plan after the subscription expired', input({ plan: 'professional', subscription: sub('expired') }), 'paid_access_after_expiry'],
  ];

  it.each(mismatchCases)('%s', (_name, i, kind) => {
    const r = deriveAccountStatus(i);
    expect(r.status).toBe('billing_mismatch');
    expect(r.mismatchKind).toBe(kind);
    expect(r.billingMismatch).toBe(true);
    expect(typeof r.mismatchReason).toBe('string');
    expect(r.revenueVerified).toBe(false);
  });

  it('never changes the entitlement: a paying free-plan shop is still entitled to Free', () => {
    const r = deriveAccountStatus(input({ plan: 'free', subscription: sub('active') }));
    expect(r.planState).toBe('free');
    expect(r.status).toBe('billing_mismatch');
  });
});

describe('revenueVerified — the only states allowed to count as revenue', () => {
  it('needs a recorded provider reference', () => {
    const r = deriveAccountStatus(input({ plan: 'solo', billingStatus: 'active', subscription: sub('active', { hasProviderReference: false }) }));
    expect(r.status).toBe('active_paid');
    expect(r.revenueVerified).toBe(false);
  });

  it('needs a real provider: manual and internal providers are not provider-backed recurring revenue', () => {
    for (const billingProvider of ['manual', 'internal', null]) {
      const r = deriveAccountStatus(input({ plan: 'solo', billingStatus: 'active', subscription: sub('active', { billingProvider }) }));
      expect(r.status).toBe('active_paid'); // classification does not depend on the provider…
      expect(r.revenueVerified).toBe(false); // …revenue does
    }
  });

  it('is true for exactly the confirmed states, and only with evidence', () => {
    const states: AccountStatus[] = [];
    for (const plan of [null, 'free', 'trial', 'pro', 'solo']) {
      for (const status of [null, 'active', 'past_due', 'cancelled', 'expired', 'trialing', 'suspended']) {
        for (const billingStatus of [null, 'active', 'past_due', 'cancelled', 'inactive']) {
          for (const cancelAtPeriodEnd of [false, true]) {
            const r = deriveAccountStatus(input({ plan, billingStatus, subscription: status ? sub(status, { cancelAtPeriodEnd }) : null }));
            if (r.revenueVerified) {
              expect(isConfirmedSubscription(r.status)).toBe(true);
              expect(r.planState).toBe('pro');
              states.push(r.status);
            }
          }
        }
      }
    }
    expect(new Set(states)).toEqual(new Set(['active_paid', 'cancel_scheduled']));
  });
});

describe('the resolver never changes what a shop is entitled to', () => {
  it('planState always equals lib/planGate getPlanStatus for the same plan and trial date', () => {
    const plans = [null, 'free', 'trial', 'pro', 'solo', 'starter', 'professional', 'business', 'enterprise', 'weird'];
    const dates = [null, past(5), future(5)];
    const subs = [null, sub('active'), sub('cancelled'), sub('past_due'), sub('expired'), sub('trialing')];
    for (const plan of plans) for (const trialEndsAt of dates) for (const subscription of subs) for (const billingStatus of [null, 'active', 'inactive']) {
      const r = deriveAccountStatus(input({ plan, trialEndsAt, billingStatus, subscription }));
      if (r.status === 'internal') continue;
      expect(r.planState).toBe(getPlanStatus(plan, trialEndsAt));
    }
  });
});

describe('every result carries exactly one primary status and coherent flags', () => {
  it('status is always a known state; billingMismatch is set exactly when a kind or reason is', () => {
    const known = new Set(Object.keys(ACCOUNT_STATUS_LABELS));
    for (const plan of [null, 'free', 'trial', 'pro', 'solo']) for (const trialEndsAt of [null, past(2), future(2)]) {
      for (const subscription of [null, sub('active'), sub('expired'), sub('suspended')]) for (const billingStatus of [null, 'active', 'past_due', 'cancelled']) {
        const r = deriveAccountStatus(input({ plan, trialEndsAt, billingStatus, subscription }));
        expect(known.has(r.status)).toBe(true);
        expect(r.billingMismatch).toBe(r.mismatchKind !== null || r.unverifiedReason !== null);
        expect(r.mismatchKind !== null).toBe(r.status === 'billing_mismatch');
        expect(r.unverifiedReason !== null).toBe(r.status === 'paid_unverified');
      }
    }
  });

  it('gives every status a distinct label, and profile trials are "Trial access"', () => {
    const labels = Object.values(ACCOUNT_STATUS_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
    expect(ACCOUNT_STATUS_LABELS.trialing).toBe(TRIAL_ACCESS_LABEL);
  });
});

describe('expired stored trials', () => {
  it('resolve to Free, keep the historical trial state, and never imply current access', () => {
    const r = deriveAccountStatus(input({ plan: 'trial', trialEndsAt: past(10), billingStatus: 'inactive' }));
    expect(r.status).toBe('free');
    expect(r.planState).toBe('free');
    expect(r.trialExpired).toBe(true);
    expect(r.trialDaysLeft).toBeNull();
    expect(r.billingMismatch).toBe(false);
  });

  it('a live trial, a free plan and a paid plan are not "expired trials"', () => {
    expect(deriveAccountStatus(input({ plan: 'trial', trialEndsAt: future(3) })).trialExpired).toBe(false);
    expect(deriveAccountStatus(input({ plan: 'free' })).trialExpired).toBe(false);
    expect(deriveAccountStatus(input({ plan: 'solo', trialEndsAt: past(20), billingStatus: 'active', subscription: sub('active') })).trialExpired).toBe(false);
  });
});

describe('reconciliationOf — the portfolio indicator shared by the Overview and Billing Health', () => {
  const r = (i: Partial<AccountStatusInput>) => deriveAccountStatus(input(i));
  const paid = r({ plan: 'solo', billingStatus: 'active', subscription: sub('active') });
  const unverified = r({ plan: 'pro', billingStatus: 'inactive' });
  const mismatch = r({ plan: 'free', subscription: sub('active') });
  const internal = r({ plan: 'pro', isInternal: true });

  it('reconciled with zero shops, zero paid shops, or only agreeing shops', () => {
    expect(reconciliationOf([])).toBe('reconciled');
    expect(reconciliationOf([r({}), r({ plan: 'free' })])).toBe('reconciled');
    expect(reconciliationOf([paid, r({})])).toBe('reconciled');
  });

  it('unverified when a paid entitlement is unconfirmed but nothing contradicts', () => {
    expect(reconciliationOf([paid, unverified])).toBe('unverified');
  });

  it('mismatch wins over unverified', () => {
    expect(reconciliationOf([unverified, mismatch, paid])).toBe('mismatch');
  });

  it('internal shops never affect it', () => {
    expect(reconciliationOf([internal, paid])).toBe('reconciled');
    expect(reconciliationOf([internal])).toBe('reconciled');
  });
});

describe('there is no complimentary status', () => {
  it('a manual billing provider does not change the classification', () => {
    const withManual = deriveAccountStatus(input({ plan: 'business', billingStatus: 'active', subscription: sub('active', { billingProvider: 'manual' }) }));
    const withCreem = deriveAccountStatus(input({ plan: 'business', billingStatus: 'active', subscription: sub('active') }));
    expect(withManual.status).toBe(withCreem.status);
  });

  it('the AccountStatus union has no complimentary member, and no branch ever returns one', () => {
    const src = readFileSync(join(__dirname, '..', 'accountStatus.ts'), 'utf8');
    expect(src).not.toMatch(/\|\s*'complimentary'/);
    expect(src).not.toMatch(/status:\s*'complimentary'/);
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
    expect(isLoginInactive(new Date(Date.now() - 1 * 86400000).toISOString())).toBe(false);
  });

  it('is true for a login older than the documented threshold', () => {
    expect(isLoginInactive(new Date(Date.now() - (LOGIN_INACTIVITY_THRESHOLD_DAYS + 5) * 86400000).toISOString())).toBe(true);
  });
});
