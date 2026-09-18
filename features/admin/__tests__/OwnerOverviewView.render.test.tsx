/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { OwnerOverviewView } from '../overview/OwnerOverviewView';
import type { OwnerOverview } from '@/lib/admin/accountsData';

// Deterministic fixture data — no production identifiers, no live DB access.
// next/link renders as a plain <a> under jsdom, so href assertions work.
const baseOverview: OwnerOverview = {
  totalSignups: 12,
  signupsToday: 13,
  signupsLast7Days: 14,
  signupsLast30Days: 15,
  free: 16,
  trialing: 17,
  trialEndingIn3Days: 18,
  trialEndingIn7Days: 19,
  activePaid: 20,
  pastDue: 21,
  cancelledAccessRetained: 22,
  paidBillingUnverified: 23,
  billingMismatches: 24,
  internal: 25,
  unlinkedProfiles: 26,
  truncated: false,
  maxScanRows: 2000,
  recentSignups: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      shopName: 'A Very Long Automotive Repair And Detailing Shop Name That Should Not Break Layout',
      shopArchived: false,
      createdAt: new Date().toISOString(),
      primaryContactEmail: 'somsak@example-test.com',
      primaryContactRole: 'Owner',
      ownerResolved: true,
      memberCount: 3,
      plan: 'professional',
      planDisplayName: 'Professional',
      status: 'trialing',
      trialEndsAt: new Date(Date.now() + 5 * 86400000).toISOString(),
      trialDaysLeft: 5,
      billingMismatch: false,
      policyNote: null,
      lastSignInAt: undefined,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      shopName: 'Second Shop',
      shopArchived: false,
      createdAt: new Date().toISOString(),
      primaryContactEmail: null,
      primaryContactRole: null,
      ownerResolved: false,
      memberCount: 0,
      plan: null,
      planDisplayName: null,
      status: 'free',
      trialEndsAt: null,
      trialDaysLeft: null,
      billingMismatch: false,
      policyNote: null,
      lastSignInAt: undefined,
    },
  ],
};

describe('OwnerOverviewView', () => {
  it('renders signup counts and labels shops (not logins) as the signup unit', () => {
    render(<OwnerOverviewView overview={baseOverview} />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText(/Signups \(shops, not individual logins\)/)).toBeTruthy();
  });

  it('surfaces unlinked profiles as a distinct figure, not folded into total signups', () => {
    render(<OwnerOverviewView overview={baseOverview} />);
    expect(screen.getByText('Unlinked profiles')).toBeTruthy();
    expect(screen.getByText('26')).toBeTruthy();
  });

  it('links each KPI card to a pre-filtered account list', () => {
    render(<OwnerOverviewView overview={baseOverview} />);
    // "Free" also appears in the recent-signups table (a row with status
    // 'free'), so scope to the KPI label specifically — the small,
    // uppercase card heading, not the table cell.
    const freeLabels = screen.getAllByText('Free');
    const freeCardLabel = freeLabels.find(el => el.closest('a')?.getAttribute('href') === '/admin/accounts?status=free');
    expect(freeCardLabel).toBeTruthy();
    const mismatchLink = screen.getByText('Billing mismatches').closest('a');
    expect(mismatchLink?.getAttribute('href')).toBe('/admin/accounts?status=billing_mismatch');
  });

  it('does not compute its own MRR — links to Billing Health instead', () => {
    render(<OwnerOverviewView overview={baseOverview} />);
    const mrrLink = screen.getByText('Monthly recurring revenue').closest('a');
    expect(mrrLink?.getAttribute('href')).toBe('/admin/billing-health');
  });

  it('renders a long shop name without throwing, and an unresolved-owner row without a name', () => {
    render(<OwnerOverviewView overview={baseOverview} />);
    expect(screen.getByText(/Very Long Automotive Repair/)).toBeTruthy();
    expect(screen.getByText('Unresolved')).toBeTruthy();
  });

  it('shows the truncation banner with the exact scan cap when truncated', () => {
    render(<OwnerOverviewView overview={{ ...baseOverview, truncated: true, maxScanRows: 2000 }} />);
    expect(screen.getByText(/2000 most recently created shops/)).toBeTruthy();
  });

  it('shows no signups empty state', () => {
    render(<OwnerOverviewView overview={{ ...baseOverview, recentSignups: [] }} />);
    expect(screen.getByText('No signups recorded yet.')).toBeTruthy();
  });

  it('never claims a cancelled-with-access-retained account is a synchronization defect', () => {
    render(<OwnerOverviewView overview={baseOverview} />);
    expect(document.body.textContent).not.toMatch(/synchronization defect/i);
  });
});
