/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import { AccountDetailView } from '../accounts/AccountDetailView';
import type { AccountDetail } from '@/lib/admin/accountsData';

const baseAccount: AccountDetail = {
  shop: { id: '66666666-6666-4666-8666-666666666666', name: 'Test Shop', createdAt: new Date().toISOString(), archivedAt: null },
  primaryContact: {
    profileId: '77777777-7777-4777-8777-777777777777',
    email: 'jane@example-test.com', role: 'Owner', billingStatus: 'active',
    lastSignInAt: new Date().toISOString(),
  },
  ownerResolved: true,
  members: [
    { profileId: '77777777-7777-4777-8777-777777777777', email: 'jane@example-test.com', role: 'owner', isPrimaryContact: true },
  ],
  primaryContactOtherShops: [],
  mirroredShopIds: [],
  plan: { key: 'professional', displayName: 'Professional', trialEndsAt: null, trialExpired: false },
  status: { status: 'active_paid', planState: 'pro', trialDaysLeft: null, trialExpired: false, billingMismatch: false, mismatchKind: null, unverifiedReason: null, revenueVerified: false, mismatchReason: null, policyNote: null },
  subscription: {
    status: 'active', planKey: 'professional', billingProvider: 'creem',
    hasCustomerReference: true,
    hasSubscriptionReference: true,
    currentPeriodStart: new Date().toISOString(), currentPeriodEnd: new Date().toISOString(),
    cancelAtPeriodEnd: false, cancelledAt: null, pastDueAt: null,
  },
  billingEvents: [],
  usage: { users: 2, vehicles: 10 },
  supportTickets: [],
  dataQualityWarnings: [],
};

describe('AccountDetailView', () => {
  it('renders shop name, primary contact, and status', () => {
    render(<AccountDetailView account={baseAccount} />);
    expect(screen.getByText('Test Shop')).toBeTruthy();
    // The contact email legitimately appears in the header line, the Primary
    // Contact section, and the Members list — all three, not a bug.
    expect(screen.getAllByText(/jane@example-test.com/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('Active paid')).toBeTruthy();
  });

  it('never displays raw webhook payloads', () => {
    render(<AccountDetailView account={baseAccount} />);
    expect(document.body.textContent).toMatch(/never shown here/);
  });

  it('shows provider linkage as linked / not linked, never an identifier — not even a masked one', () => {
    render(<AccountDetailView account={baseAccount} />);
    expect(screen.getByText('Provider customer').parentElement?.textContent).toMatch(/Linked/);
    expect(document.body.textContent).not.toMatch(/•|\bsub_|\bcus_|\bcust_/);
  });

  it('says "Not linked" when the subscription row carries no provider reference', () => {
    const account: AccountDetail = { ...baseAccount, subscription: { ...baseAccount.subscription!, hasCustomerReference: false, hasSubscriptionReference: false } };
    render(<AccountDetailView account={account} />);
    expect(screen.getByText('Provider subscription').parentElement?.textContent).toMatch(/Not linked/);
  });

  it('states signup attribution is not configured, unconditionally', () => {
    render(<AccountDetailView account={baseAccount} />);
    expect(screen.getByText(/Signup attribution not configured/)).toBeTruthy();
  });

  it('shows a policy note (not a mismatch) for a cancelled-access-retained account', () => {
    const account: AccountDetail = {
      ...baseAccount,
      status: {
        status: 'cancelled_access_retained', planState: 'pro', trialDaysLeft: null, trialExpired: false,
        billingMismatch: false, mismatchKind: null, unverifiedReason: null, revenueVerified: false, mismatchReason: null,
        policyNote: 'Billing cancelled — access retained. Current product policy.',
      },
    };
    render(<AccountDetailView account={account} />);
    expect(screen.getByText('Current product policy — not a defect')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/synchronization defect/i);
  });

  it('shows a billing-mismatch warning only when one is genuinely flagged', () => {
    const account: AccountDetail = {
      ...baseAccount,
      status: {
        status: 'billing_mismatch', planState: 'free', trialDaysLeft: null, trialExpired: false,
        billingMismatch: true, mismatchKind: 'free_plan_active_subscription', unverifiedReason: null, revenueVerified: false, mismatchReason: 'No shop_subscriptions row exists for this shop.',
        policyNote: null,
      },
    };
    render(<AccountDetailView account={account} />);
    expect(screen.getAllByText('Billing mismatch').length).toBeGreaterThanOrEqual(2); // status pill + warning heading
    expect(screen.getByText(/No shop_subscriptions row exists/)).toBeTruthy();
  });

  it('shows the "Complimentary status: Not tracked" note only for a manual billing provider, never as a status', () => {
    const account: AccountDetail = {
      ...baseAccount,
      subscription: { ...baseAccount.subscription!, billingProvider: 'manual' },
    };
    render(<AccountDetailView account={account} />);
    expect(screen.getByText(/Complimentary status: Not tracked/)).toBeTruthy();
  });

  it('does not show the complimentary note for a normal creem subscription', () => {
    render(<AccountDetailView account={baseAccount} />);
    expect(screen.queryByText(/Complimentary status/)).toBeNull();
  });

  it('handles a missing primary contact and unresolved owner gracefully', () => {
    const account: AccountDetail = { ...baseAccount, primaryContact: null, ownerResolved: false, members: [] };
    render(<AccountDetailView account={account} />);
    expect(screen.getByText('No primary contact resolved')).toBeTruthy();
    expect(screen.getByText('No profile could be associated with this shop.')).toBeTruthy();
  });

  it('handles no subscription record gracefully', () => {
    const account: AccountDetail = { ...baseAccount, subscription: null };
    render(<AccountDetailView account={account} />);
    expect(screen.getByText('No shop_subscriptions record for this shop.')).toBeTruthy();
  });

  it('renders a long shop name without throwing', () => {
    const account: AccountDetail = {
      ...baseAccount,
      shop: { ...baseAccount.shop, name: 'An Extremely Long Shop Name That Could Wrap Or Overflow A Narrow Header Layout If Not Handled' },
    };
    render(<AccountDetailView account={account} />);
    expect(screen.getByText(/Extremely Long Shop Name/)).toBeTruthy();
  });

  it('data quality warnings render when present', () => {
    const account: AccountDetail = { ...baseAccount, dataQualityWarnings: ['Usage data could not be loaded.'] };
    render(<AccountDetailView account={account} />);
    expect(screen.getByText('Usage data could not be loaded.')).toBeTruthy();
  });
});

describe('AccountDetailView — clearer terminology and safer responses', () => {
  it('labels paid access without a billing record plainly, without calling it a customer, subscription or internal', () => {
    const account: AccountDetail = {
      ...baseAccount, subscription: null,
      status: { status: 'paid_unverified', planState: 'pro', trialDaysLeft: null, trialExpired: false, billingMismatch: true, mismatchKind: null, unverifiedReason: 'no_billing_record', revenueVerified: false, mismatchReason: 'No subscription row.', policyNote: null },
    };
    render(<AccountDetailView account={account} />);
    expect(screen.getByText('Paid access, unverified')).toBeTruthy(); // the primary state
    expect(screen.getByText('Paid access, no billing record')).toBeTruthy(); // the exact reason
    expect(document.body.textContent).not.toMatch(/complimentary status: (yes|granted)|internal account|fraud/i);
  });

  it('explains an expired stored trial without implying current trial access', () => {
    const account: AccountDetail = {
      ...baseAccount, subscription: null,
      plan: { key: 'trial', displayName: 'trial', trialEndsAt: new Date(Date.now() - 5 * 86400000).toISOString(), trialExpired: true },
      status: { status: 'free', planState: 'free', trialDaysLeft: null, trialExpired: true, billingMismatch: false, mismatchKind: null, unverifiedReason: null, revenueVerified: false, mismatchReason: null, policyNote: null },
    };
    render(<AccountDetailView account={account} />);
    expect(screen.getByText('Trial expired')).toBeTruthy();
    expect(screen.getByTestId('expired-trial-note').textContent).toMatch(/on Free/);
    expect(screen.queryByText('Trial access')).toBeNull();
  });

  it('shows a failed billing event as "Failed" without any provider error text', () => {
    const account: AccountDetail = {
      ...baseAccount,
      billingEvents: [
        { id: 'evt-1', eventType: 'subscription.update', processed: false, processedAt: null, failed: true, createdAt: new Date().toISOString() },
        { id: 'evt-2', eventType: 'subscription.paid', processed: true, processedAt: new Date().toISOString(), failed: false, createdAt: new Date().toISOString() },
      ],
    };
    render(<AccountDetailView account={account} />);
    const failedRow = screen.getByText('subscription.update').closest('tr')!;
    expect(within(failedRow).getByText('Failed')).toBeTruthy();
    expect(within(screen.getByText('subscription.paid').closest('tr')!).getByText('Processed')).toBeTruthy();
  });
});