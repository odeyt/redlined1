/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { TriageControl } from '../support/TriageControl';

const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const TICKET = '88888888-8888-4888-8888-888888888888';
const fetchMock = jest.fn();
const okResponse = (body: unknown = { ok: true }, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

const click = async (name: string) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };

describe('TriageControl', () => {
  it('posts exactly the ticket id and the chosen value as JSON, then refreshes the page', async () => {
    fetchMock.mockReturnValue(okResponse());
    render(<TriageControl ticketId={TICKET} current="unreviewed" />);
    await click('Real');
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/support/triage');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ ticketId: TICKET, triage: 'real' });
  });

  it('asks for confirmation before marking test or spam, and does nothing if declined', async () => {
    (window.confirm as jest.Mock).mockReturnValue(false);
    render(<TriageControl ticketId={TICKET} current="unreviewed" />);
    await click('Spam');
    await click('Test');
    expect(window.confirm).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says what marking does before it happens: counts change, the ticket is kept, it can be changed back', async () => {
    render(<TriageControl ticketId={TICKET} current="unreviewed" />);
    await click('Spam');
    const message = (window.confirm as jest.Mock).mock.calls[0][0] as string;
    expect(message).toMatch(/left out of the open, overdue and needs-attention counts/);
    expect(message).toMatch(/kept/);
    expect(message).toMatch(/change it back/);
  });

  it('marking a ticket real needs no confirmation because it changes no counts', async () => {
    fetchMock.mockReturnValue(okResponse());
    render(<TriageControl ticketId={TICKET} current="test" />);
    await click('Real');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('shows the current marking as pressed, and offers Clear only when something is marked', async () => {
    const { rerender } = render(<TriageControl ticketId={TICKET} current="unreviewed" />);
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    for (const b of screen.getAllByRole('button')) expect(b.getAttribute('aria-pressed')).toBe('false');
    rerender(<TriageControl ticketId={TICKET} current="spam" />);
    expect(screen.getByRole('button', { name: 'Spam' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
  });

  it('Clear sends "unreviewed"', async () => {
    fetchMock.mockReturnValue(okResponse());
    render(<TriageControl ticketId={TICKET} current="spam" />);
    await click('Clear');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).triage).toBe('unreviewed');
  });

  it('does not send anything when the ticket already has that marking', async () => {
    render(<TriageControl ticketId={TICKET} current="real" />);
    await click('Real');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the server\'s refusal and does not refresh when saving fails', async () => {
    fetchMock.mockReturnValue(okResponse({ error: 'Ticket marking is not available yet' }, 503));
    render(<TriageControl ticketId={TICKET} current="unreviewed" />);
    await click('Real');
    await waitFor(() => expect(screen.getByTestId('triage-error').textContent).toBe('Ticket marking is not available yet'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('survives a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<TriageControl ticketId={TICKET} current="unreviewed" />);
    await click('Real');
    await waitFor(() => expect(screen.getByTestId('triage-error').textContent).toBe('Could not save'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('is only a convenience: it holds no credentials and makes no authorization decision', async () => {
    // Authorization is the route's job; nothing in the component reads an email, token or role.
    const src = readFileSync(join(__dirname, '..', 'support', 'TriageControl.tsx'), 'utf8');
    expect(src).not.toMatch(/PLATFORM_OWNER|NEXT_PUBLIC|localStorage|sessionStorage|Authorization|Bearer|isPlatformOwner|\.email\b/);
  });
});
