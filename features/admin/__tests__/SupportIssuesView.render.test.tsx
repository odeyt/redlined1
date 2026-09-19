/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import { SupportIssuesView } from '../support/SupportIssuesView';

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
import type { SupportListResult, SupportItem } from '@/lib/admin/supportData';
import { summarizeSupport, SUPPORT_OVERDUE_DAYS } from '@/lib/admin/supportTriage';

const ticket: SupportItem = {
  id: '88888888-8888-4888-8888-888888888888',
  source: 'support_ticket', type: 'chat', subject: 'Cannot print invoice',
  shopId: '66666666-6666-4666-8666-666666666666', shopName: 'Test Shop',
  accountId: '66666666-6666-4666-8666-666666666666', accountMatchIsHeuristic: false,
  createdAt: new Date().toISOString(), status: 'open', severity: null, needsAttention: true,
  triage: 'unreviewed', open: true, ageDays: 0, waitingDays: 0, overdue: false,
};

const lead: SupportItem = {
  id: '99999999-9999-4999-8999-999999999999',
  source: 'shop_audit_lead', type: 'shop_audit_lead', subject: 'Prospective Shop LLC',
  shopId: null, shopName: 'Prospective Shop LLC',
  accountId: null, accountMatchIsHeuristic: true,
  createdAt: new Date().toISOString(), status: 'new', severity: null, needsAttention: true,
  triage: 'unreviewed', open: true, ageDays: 0, waitingDays: null, overdue: false,
};

const sources = { supportTickets: 'available', shopAuditLeads: 'available' } as const;
const result = (items: SupportItem[], o: Partial<SupportListResult> = {}): SupportListResult => ({
  items, sources, triageSupported: true, summary: summarizeSupport(items), truncated: false, maxItemsPerSource: 200, ...o,
});

describe('SupportIssuesView', () => {
  it('renders a mixed list of support tickets and shop-audit leads with distinct source badges', () => {
    render(<SupportIssuesView data={result([ticket, lead])} view="all" />);
    expect(screen.getByText('Cannot print invoice')).toBeTruthy();
    // Subject and shop columns both read the lead's shop_name — same value by design.
    expect(screen.getAllByText('Prospective Shop LLC').length).toBe(2);
    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByText('Shop audit lead')).toBeTruthy();
  });

  it('marks a heuristic (email-correlated) account match, but not a confirmed ticket shop_id link', () => {
    render(<SupportIssuesView data={result([ticket])} view="all" />);
    expect(screen.queryByTitle('Matched by email — not a confirmed record link')).toBeNull();
    expect(screen.getByText('View account →').getAttribute('href')).toBe(`/admin/accounts/${ticket.accountId}`);
  });

  it('marks a shop-audit lead account match as a possible, heuristic match', () => {
    const leadWithAccount = { ...lead, accountId: '66666666-6666-4666-8666-666666666666' };
    render(<SupportIssuesView data={result([leadWithAccount])} view="all" />);
    expect(screen.getByText('(possible match)')).toBeTruthy();
  });

  it('never links an account from a matching shop name alone', () => {
    // Same display name as a real shop, but no shop_id and no matching email: no link.
    const lookalike = { ...lead, shopName: 'Test Shop', subject: 'Test Shop', accountId: null };
    render(<SupportIssuesView data={result([lookalike])} view="all" />);
    expect(screen.queryByText('View account →')).toBeNull();
  });

  it('shows the not-configured empty state when neither source is available', () => {
    render(<SupportIssuesView data={result([], { sources: { supportTickets: 'unavailable', shopAuditLeads: 'not_configured' } })} view="all" />);
    expect(screen.getByText('Support inbox not configured.')).toBeTruthy();
  });

  it('shows a plain "nothing to show" state when a source is available but empty', () => {
    render(<SupportIssuesView data={result([], { sources: { supportTickets: 'available', shopAuditLeads: 'not_configured' } })} view="all" />);
    expect(screen.getByText('Nothing to show.')).toBeTruthy();
  });

  it('never renders message bodies or free-text lead fields — only the structured subject', () => {
    render(<SupportIssuesView data={result([ticket, lead])} view="all" />);
    expect(document.body.textContent).not.toMatch(/biggest_challenge|current_software/);
  });
});

describe('SupportIssuesView — queue operations', () => {
  const old = { ...ticket, id: 'b0000000-0000-4000-8000-000000000001', subject: 'Old unanswered ticket', createdAt: new Date(Date.now() - 46 * 86400000).toISOString(), ageDays: 46, waitingDays: 46, overdue: true };
  const answered = { ...ticket, id: 'b0000000-0000-4000-8000-000000000002', subject: 'Already answered', needsAttention: false, status: 'answered' };
  const closed = { ...ticket, id: 'b0000000-0000-4000-8000-000000000003', subject: 'Closed one', status: 'closed', open: false, needsAttention: false, ageDays: 20 };
  const spamLead = { ...lead, id: 'b0000000-0000-4000-8000-000000000004', subject: 'Spam submission', status: 'spam', triage: 'spam' as const, open: false, needsAttention: false };
  const all = [old, ticket, answered, closed, lead, spamLead];

  it('distinguishes support tickets from shop-audit leads, and shows ticket age and overdue state', () => {
    render(<SupportIssuesView data={result(all)} view="all" />);
    const row = screen.getByText('Old unanswered ticket').closest('tr')!;
    expect(within(row).getByText(/46d · overdue, waiting 46d/)).toBeTruthy();
    expect(within(screen.getByText('Cannot print invoice').closest('tr')!).getByText('today')).toBeTruthy();
    expect(within(row).getByText('Support')).toBeTruthy();
    expect(within(screen.getByText('Spam submission').closest('tr')!).getByText('Shop audit lead')).toBeTruthy();
  });

  it('offers the marking control on tickets only, once marking is available', () => {
    render(<SupportIssuesView data={result(all)} view="all" />);
    expect(screen.getByText('Mark ticket')).toBeTruthy();
    expect(screen.getByTestId(`triage-control-${old.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`triage-control-${lead.id}`)).toBeNull(); // leads have their own status
    expect(screen.getByTestId('triage-help').textContent).toMatch(/recorded with your sign-in/);
  });

  it('shows no control, only the explanation, while marking is not available (migration not applied)', () => {
    render(<SupportIssuesView data={result(all, { triageSupported: false })} view="all" />);
    expect(screen.queryByText('Mark ticket')).toBeNull();
    expect(document.querySelector('[data-testid^="triage-control-"]')).toBeNull();
    expect(screen.getByTestId('triage-unsupported')).toBeTruthy();
  });

  it('an old ticket that only recently became unanswered shows its age but is not marked overdue', () => {
    const followedUp = { ...old, id: 'b0000000-0000-4000-8000-000000000009', subject: 'Old ticket, fresh follow-up', waitingDays: 1, overdue: false };
    render(<SupportIssuesView data={result([followedUp])} view="all" />);
    const row = screen.getByText('Old ticket, fresh follow-up').closest('tr')!;
    expect(row.textContent).toContain('46d');
    expect(row.textContent).not.toMatch(/overdue/);
  });

  it('says so when a source returned its full cap, so the counts are known to be incomplete', () => {
    render(<SupportIssuesView data={result([ticket], { truncated: true, maxItemsPerSource: 200 })} view="all" />);
    expect(screen.getByTestId('support-truncated').textContent).toMatch(/200 most recent/);
  });

  it('shows no truncation notice when nothing was capped', () => {
    render(<SupportIssuesView data={result([ticket])} view="all" />);
    expect(screen.queryByTestId('support-truncated')).toBeNull();
  });

  it('states that overdue is counted from the first unanswered customer message', () => {
    render(<SupportIssuesView data={result([ticket])} view="all" />);
    expect(screen.getByTestId('support-predicates').textContent).toMatch(/first customer message nobody has answered/);
  });

  it('summarises open tickets, overdue tickets and the oldest open ticket, excluding confirmed test/spam', () => {
    render(<SupportIssuesView data={result(all)} view="all" />);
    expect(within(screen.getByTestId('stat-open-tickets')).getByText('3')).toBeTruthy(); // old, ticket, answered
    expect(within(screen.getByTestId('stat-overdue')).getByText('1')).toBeTruthy();
    expect(within(screen.getByTestId('stat-oldest')).getByText('46d')).toBeTruthy();
    expect(within(screen.getByTestId('stat-noise')).getByText('1')).toBeTruthy();
    expect(screen.getByTestId('stat-overdue').textContent).toContain(`${SUPPORT_OVERDUE_DAYS}+ days`);
  });

  it('shows "—" for the oldest open ticket when there is none', () => {
    render(<SupportIssuesView data={result([closed, lead])} view="all" />);
    expect(within(screen.getByTestId('stat-oldest')).getByText('—')).toBeTruthy();
  });

  it.each([
    ['needs_attention', ['Old unanswered ticket', 'Cannot print invoice', 'Prospective Shop LLC']],
    ['overdue', ['Old unanswered ticket']],
    ['open', ['Old unanswered ticket', 'Cannot print invoice', 'Already answered', 'Prospective Shop LLC']],
    ['resolved', ['Closed one']],
    ['tickets', ['Old unanswered ticket', 'Cannot print invoice', 'Already answered', 'Closed one']],
    ['test_spam', ['Spam submission']],
  ] as const)('the "%s" filter shows exactly the right records', (view, subjects) => {
    render(<SupportIssuesView data={result(all)} view={view} />);
    const shown = Array.from(document.querySelectorAll('tbody tr')).map(r => r.querySelectorAll('td')[1].textContent!.replace(/[⚠]|spam|test/g, '').trim());
    expect(shown.sort()).toEqual([...subjects].sort());
  });

  it('preserves confirmed test/spam records: they are viewable, just not in operational counts', () => {
    render(<SupportIssuesView data={result(all)} view="all" />);
    expect(screen.getByText('Spam submission')).toBeTruthy();
    render(<SupportIssuesView data={result(all)} view="open" />);
    expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });

  it('filters are real links, and the active filter is marked', () => {
    render(<SupportIssuesView data={result(all)} view="overdue" />);
    const filters = within(screen.getByTestId('support-filters'));
    expect(filters.getByText('Overdue').getAttribute('href')).toBe('/admin/support?view=overdue');
    expect(filters.getByText('All').getAttribute('href')).toBe('/admin/support');
    expect(filters.getByText('Overdue').style.color).not.toBe(filters.getByText('Resolved').style.color);
  });

  it('documents the needs-attention predicate on the page', () => {
    render(<SupportIssuesView data={result(all)} view="all" />);
    const note = screen.getByTestId('support-predicates').textContent ?? '';
    expect(note).toMatch(/not closed and whose latest message is not from support/);
    expect(note).toMatch(/status .new./);
    expect(note).toMatch(/never inferred from a subject, shop name or message/);
  });

  it('says test/spam marking for tickets is unavailable until the migration is applied', () => {
    render(<SupportIssuesView data={result(all, { triageSupported: false })} view="all" />);
    expect(screen.getByTestId('triage-unsupported').textContent).toMatch(/every ticket is shown as unreviewed/);
  });

  it('does not show that notice once ticket triage is supported', () => {
    render(<SupportIssuesView data={result(all)} view="all" />);
    expect(screen.queryByTestId('triage-unsupported')).toBeNull();
  });

  it('keeps the table inside a horizontally scrolling box', () => {
    render(<SupportIssuesView data={result(all)} view="all" />);
    expect((document.querySelector('table')!.parentElement as HTMLElement).style.overflowX).toBe('auto');
  });
});
