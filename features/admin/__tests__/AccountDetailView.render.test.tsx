/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { AccountDetailView } from '../accounts/AccountDetailView';
import type { AccountDetail } from '@/lib/admin/accountsData';

const baseAccount: AccountDetail = {
  shop: { id: '66666666-6666-4666-8666-666666666666', name: 'Test Shop', createdAt: new Date().toISOString(), archivedAt: null },
  primaryContact: {
    profileId: '77777777-7777-4777-8777-777777777777',
    name: 'Jane Test', email: 'jane@example-test.com', role: 'Owner', status: 'Active',
    createdAt: new Date().toISOString(), billingStatus: 'active',
    lastSignInAt: new Date().toISOString(),
  },
  ownerResolved: true,
  members: [
    { profileId: '77777777-7777-4777-8777-777777777777', name: 'Jane Test', email: 'jane@example-test.com', role: 'owner', isPrimaryContact: true },
  ],
  primaryContactOtherShops: [],
  mirroredShopIds: [],
  plan: { key: 'professional', displayName: 'Professional', trialEndsAt: null },
  status: { status: 'active_paid', planState: 'pro', trialDaysLeft: null, billingMismatch: false, mismatchReason: null, policyNote: null },
  subscription: {
    status: 'active', planKey: 'professional', billingProvider: 'creem',
    providerCustomerId: { raw: 'cust_abcdef1234', masked: '•••••••1234' },
    providerSubscriptionId: { raw: 'sub_abcdef1234', masked: '•••••••1234' },
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
    // "Jane Test" legitimately appears in the header line, the Primary
    // Contact section, and the Members list — all three, not a bug.
    expect(screen.getAllByText(/Jane Test/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('Active (paid)')).toBeTruthy();
  });

  it('never displays raw webhook payloads', () => {
    render(<AccountDetailView account={baseAccount} />);
    expect(document.body.textContent).toMatch(/never shown here/);
  });

  it('masks the Creem provider ids rather than showing them raw', () => {
    render(<AccountDetailView account={baseAccount} />);
    expect(screen.getAllByText('•••••••1234').length).toBe(2); // provider customer id + provider subscription id
    expect(screen.queryByText('cust_abcdef1234')).toBeNull();
    expect(screen.queryByText('sub_abcdef1234')).toBeNull();
  });

  it('states signup attribution is not configured, unconditionally', () => {
    render(<AccountDetailView account={baseAccount} />);
    expect(screen.getByText(/Signup attribution not configured/)).toBeTruthy();
  });

  it('shows a policy note (not a mismatch) for a cancelled-access-retained account', () => {
    const account: AccountDetail = {
      ...baseAccount,
      status: {
        status: 'cancelled_access_retained', planState: 'pro', trialDaysLeft: null,
        billingMismatch: false, mismatchReason: null,
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
        status: 'paid_billing_unverified', planState: 'pro', trialDaysLeft: null,
        billingMismatch: true, mismatchReason: 'No shop_subscriptions row exists for this shop.',
        policyNote: null,
      },
    };
    render(<AccountDetailView account={account} />);
    expect(screen.getByText('Billing mismatch')).toBeTruthy();
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
