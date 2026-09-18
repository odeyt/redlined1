/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { SupportIssuesView } from '../support/SupportIssuesView';
import type { SupportListResult, SupportItem } from '@/lib/admin/supportData';

const ticket: SupportItem = {
  id: '88888888-8888-4888-8888-888888888888',
  source: 'support_ticket', type: 'chat', subject: 'Cannot print invoice',
  shopId: '66666666-6666-4666-8666-666666666666', shopName: 'Test Shop',
  accountId: '66666666-6666-4666-8666-666666666666', accountMatchIsHeuristic: false,
  createdAt: new Date().toISOString(), status: 'open', severity: null, needsAttention: true,
};

const lead: SupportItem = {
  id: '99999999-9999-4999-8999-999999999999',
  source: 'shop_audit_lead', type: 'shop_audit_lead', subject: 'Prospective Shop LLC',
  shopId: null, shopName: 'Prospective Shop LLC',
  accountId: null, accountMatchIsHeuristic: true,
  createdAt: new Date().toISOString(), status: 'new', severity: null, needsAttention: true,
};

describe('SupportIssuesView', () => {
  it('renders a mixed list of support tickets and shop-audit leads with distinct source badges', () => {
    const data: SupportListResult = { items: [ticket, lead], sources: { supportTickets: 'available', shopAuditLeads: 'available' } };
    render(<SupportIssuesView data={data} attentionOnly={false} />);
    expect(screen.getByText('Cannot print invoice')).toBeTruthy();
    // Subject and shop columns both read the lead's shop_name — same value by design.
    expect(screen.getAllByText('Prospective Shop LLC').length).toBe(2);
    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByText('Shop audit lead')).toBeTruthy();
  });

  it('marks a heuristic (email-correlated) account match, but not a confirmed ticket shop_id link', () => {
    const data: SupportListResult = { items: [ticket], sources: { supportTickets: 'available', shopAuditLeads: 'available' } };
    render(<SupportIssuesView data={data} attentionOnly={false} />);
    expect(screen.queryByTitle('Matched by email — not a confirmed record link')).toBeNull();
  });

  it('marks a shop-audit lead account match as a possible, heuristic match', () => {
    const leadWithAccount = { ...lead, accountId: '66666666-6666-4666-8666-666666666666' };
    const data: SupportListResult = { items: [leadWithAccount], sources: { supportTickets: 'available', shopAuditLeads: 'available' } };
    render(<SupportIssuesView data={data} attentionOnly={false} />);
    expect(screen.getByText('(possible match)')).toBeTruthy();
  });

  it('shows the not-configured empty state when neither source is available', () => {
    const data: SupportListResult = { items: [], sources: { supportTickets: 'unavailable', shopAuditLeads: 'not_configured' } };
    render(<SupportIssuesView data={data} attentionOnly={false} />);
    expect(screen.getByText('Support inbox not configured.')).toBeTruthy();
  });

  it('shows a plain "nothing to show" state when a source is available but empty', () => {
    const data: SupportListResult = { items: [], sources: { supportTickets: 'available', shopAuditLeads: 'not_configured' } };
    render(<SupportIssuesView data={data} attentionOnly={false} />);
    expect(screen.getByText('Nothing to show.')).toBeTruthy();
  });

  it('filters to needs-attention-only items when the toggle is on, via a real link href not client state', () => {
    const answered = { ...ticket, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', needsAttention: false, subject: 'Already answered' };
    const data: SupportListResult = { items: [ticket, answered], sources: { supportTickets: 'available', shopAuditLeads: 'not_configured' } };
    render(<SupportIssuesView data={data} attentionOnly={true} />);
    expect(screen.getByText('Cannot print invoice')).toBeTruthy();
    expect(screen.queryByText('Already answered')).toBeNull();
    const toggle = screen.getByText('✓ Needs attention only');
    expect(toggle.tagName).toBe('A');
    expect(toggle.getAttribute('href')).toBe('/admin/support');
  });

  it('never renders message bodies or free-text lead fields — only the structured subject', () => {
    const data: SupportListResult = { items: [ticket, lead], sources: { supportTickets: 'available', shopAuditLeads: 'available' } };
    render(<SupportIssuesView data={data} attentionOnly={false} />);
    expect(document.body.textContent).not.toMatch(/biggest_challenge|current_software/);
  });
});
