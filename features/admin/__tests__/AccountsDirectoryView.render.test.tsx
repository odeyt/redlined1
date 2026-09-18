/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { AccountsDirectoryView } from '../accounts/AccountsDirectoryView';
import type { AccountListResult, AccountListItem } from '@/lib/admin/accountsData';

const item = (overrides: Partial<AccountListItem>): AccountListItem => ({
  id: '33333333-3333-4333-8333-333333333333',
  shopName: 'Test Shop',
  shopArchived: false,
  createdAt: new Date().toISOString(),
  primaryContactEmail: 'jane@example-test.com',
  primaryContactRole: 'Owner',
  ownerResolved: true,
  memberCount: 2,
  plan: 'starter',
  planDisplayName: 'Starter',
  status: 'active_paid',
  trialEndsAt: null,
  trialDaysLeft: null,
  billingMismatch: false,
  policyNote: null,
  lastSignInAt: new Date().toISOString(),
  ...overrides,
});

const defaultParams = { page: 1, search: '', status: 'all' as const, sortKey: 'created_at' as const, sortDir: 'desc' as const };

describe('AccountsDirectoryView', () => {
  it('renders a normal list of accounts with search, status pills, and sortable columns', () => {
    const result: AccountListResult = { items: [item({})], total: 1, page: 1, pageSize: 25, truncated: false, maxScanRows: 2000 };
    render(<AccountsDirectoryView result={result} params={defaultParams} />);
    expect(screen.getByPlaceholderText(/Search shop name/)).toBeTruthy();
    expect(screen.getByText('Test Shop')).toBeTruthy();
    expect(screen.getByText('All').closest('a')?.getAttribute('href')).toBe('/admin/accounts');
  });

  it('shows the empty state when nothing matches', () => {
    const result: AccountListResult = { items: [], total: 0, page: 1, pageSize: 25, truncated: false, maxScanRows: 2000 };
    render(<AccountsDirectoryView result={result} params={defaultParams} />);
    expect(screen.getByText('No accounts match this filter.')).toBeTruthy();
  });

  it('states the exact scan cap when the underlying scan is truncated', () => {
    const result: AccountListResult = { items: [item({})], total: 1, page: 1, pageSize: 25, truncated: true, maxScanRows: 2000 };
    render(<AccountsDirectoryView result={result} params={defaultParams} />);
    expect(screen.getByText(/2000 most recently created shops/)).toBeTruthy();
  });

  it('renders a long shop name and missing optional fields without throwing', () => {
    const result: AccountListResult = {
      items: [item({
        shopName: 'An Extremely Long Shop Name That Could Wrap Or Overflow A Narrow Table Column If Not Handled',
        primaryContactEmail: null,
        ownerResolved: false,
        trialEndsAt: null,
        lastSignInAt: undefined,
      })],
      total: 1, page: 1, pageSize: 25, truncated: false, maxScanRows: 2000,
    };
    render(<AccountsDirectoryView result={result} params={defaultParams} />);
    expect(screen.getByText(/Extremely Long Shop Name/)).toBeTruthy();
    expect(screen.getByText('Unavailable')).toBeTruthy(); // last login, undefined = not fetched
    expect(screen.getByText('Unresolved')).toBeTruthy(); // no owner-role member
  });

  it('shows "Never" for a resolved contact who has never signed in (null, not undefined)', () => {
    const result: AccountListResult = {
      items: [item({ lastSignInAt: null })],
      total: 1, page: 1, pageSize: 25, truncated: false, maxScanRows: 2000,
    };
    render(<AccountsDirectoryView result={result} params={defaultParams} />);
    expect(screen.getByText('Never')).toBeTruthy();
  });

  it('flags a billing mismatch visibly, without alarming language for the unrelated cancelled-access-retained status', () => {
    const result: AccountListResult = {
      items: [
        item({ id: '44444444-4444-4444-8444-444444444444', status: 'active_paid', billingMismatch: true }),
      ],
      total: 1, page: 1, pageSize: 25, truncated: false, maxScanRows: 2000,
    };
    render(<AccountsDirectoryView result={result} params={defaultParams} />);
    expect(screen.getByTitle('Billing mismatch — see account detail')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/synchronization defect/i);
  });

  it('disables the Prev link on page 1 and Next when there is no further page', () => {
    const result: AccountListResult = { items: [item({})], total: 1, page: 1, pageSize: 25, truncated: false, maxScanRows: 2000 };
    render(<AccountsDirectoryView result={result} params={defaultParams} />);
    const prev = screen.getByText('← Prev');
    const next = screen.getByText('Next →');
    expect(prev.tagName).toBe('SPAN');
    expect(next.tagName).toBe('SPAN');
  });

  it('enables pagination links preserving other params when there are more pages', () => {
    const items = Array.from({ length: 25 }, (_, i) => item({ id: `55555555-5555-4555-8555-55555555555${i % 10}`, shopName: `Shop ${i}` }));
    const result: AccountListResult = { items, total: 60, page: 2, pageSize: 25, truncated: false, maxScanRows: 2000 };
    render(<AccountsDirectoryView result={result} params={{ ...defaultParams, page: 2, status: 'active_paid' }} />);
    const next = screen.getByText('Next →');
    expect(next.tagName).toBe('A');
    expect(next.getAttribute('href')).toContain('page=3');
    expect(next.getAttribute('href')).toContain('status=active_paid');
    const prev = screen.getByText('← Prev');
    expect(prev.tagName).toBe('A');
    expect(prev.getAttribute('href')).not.toContain('page='); // page 1 omits the param
  });
});
