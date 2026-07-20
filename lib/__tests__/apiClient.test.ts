const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
    },
  },
}));

import { authedFetch, AuthSessionError, readJsonBody, apiErrorMessage } from '../apiClient';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockGetSession.mockReset();
  mockRefreshSession.mockReset();
  mockFetch.mockReset();
});

describe('authedFetch', () => {
  it('throws AuthSessionError and never calls fetch when there is no session at all', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(authedFetch('/api/invite')).rejects.toThrow(AuthSessionError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('attaches the current session access token as a Bearer header', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-1' } } });
    mockFetch.mockResolvedValue({ status: 200, ok: true });
    await authedFetch('/api/members?shopId=abc', { method: 'GET' });
    expect(mockFetch).toHaveBeenCalledWith('/api/members?shopId=abc', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer tok-1' }),
    }));
  });

  it('preserves caller-supplied headers and body alongside the auth header', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-1' } } });
    mockFetch.mockResolvedValue({ status: 200, ok: true });
    await authedFetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com' }),
    });
    expect(mockFetch).toHaveBeenCalledWith('/api/invite', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.com' }),
      headers: expect.objectContaining({ 'Content-Type': 'application/json', Authorization: 'Bearer tok-1' }),
    }));
  });

  it('retries once, with a refreshed token, after an expired-token 401', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'expired-tok' } } });
    mockRefreshSession.mockResolvedValue({ data: { session: { access_token: 'fresh-tok' } }, error: null });
    mockFetch
      .mockResolvedValueOnce({ status: 401, ok: false })
      .mockResolvedValueOnce({ status: 200, ok: true });

    const res = await authedFetch('/api/job-status', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/job-status', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer expired-tok' }),
    }));
    expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/job-status', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer fresh-tok' }),
    }));
  });

  it('throws AuthSessionError (not a generic error) when the session refresh itself fails', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'expired-tok' } } });
    mockRefreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'refresh token invalid' } });
    mockFetch.mockResolvedValue({ status: 401, ok: false });

    await expect(authedFetch('/api/job-notify')).rejects.toThrow(AuthSessionError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws AuthSessionError if the retried request is still 401 even after a successful refresh', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'expired-tok' } } });
    mockRefreshSession.mockResolvedValue({ data: { session: { access_token: 'still-rejected' } }, error: null });
    mockFetch.mockResolvedValue({ status: 401, ok: false });

    await expect(authedFetch('/api/job-notify')).rejects.toThrow(AuthSessionError);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('passes through non-401 error responses (403 Forbidden, 400, etc.) as a normal Response, not an exception', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok-1' } } });
    mockFetch.mockResolvedValue({ status: 403, ok: false, json: () => Promise.resolve({ error: 'Forbidden' }) });

    const res = await authedFetch('/api/members', { method: 'DELETE' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });
});

describe('readJsonBody', () => {
  it('parses a normal JSON body', async () => {
    const res = new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 });
    await expect(readJsonBody(res)).resolves.toEqual({ error: 'Bad request' });
  });

  it('returns null for an empty body, instead of throwing', async () => {
    const res = new Response(null, { status: 204 });
    await expect(readJsonBody(res)).resolves.toBeNull();
  });

  it('returns null for a non-JSON body (e.g. an HTML error page from a proxy), instead of throwing', async () => {
    const res = new Response('<html><body>502 Bad Gateway</body></html>', { status: 502 });
    await expect(readJsonBody(res)).resolves.toBeNull();
  });
});

describe('apiErrorMessage', () => {
  it('prefers the route\'s own { error } message when present', async () => {
    const res = new Response(JSON.stringify({ error: 'Not enabled' }), { status: 400 });
    await expect(apiErrorMessage(res)).resolves.toBe('Not enabled');
  });

  it('falls back to the HTTP status when the body is empty', async () => {
    const res = new Response('', { status: 502, statusText: 'Bad Gateway' });
    const message = await apiErrorMessage(res, 'Unable to save');
    expect(message).toContain('Unable to save');
    expect(message).toContain('502');
  });

  it('falls back to the HTTP status when the body is non-JSON (e.g. an HTML error page)', async () => {
    const res = new Response('<html>Internal Server Error</html>', { status: 500 });
    const message = await apiErrorMessage(res, 'Unable to load status');
    expect(message).toContain('Unable to load status');
    expect(message).toContain('500');
    expect(message).not.toContain('<html>');
  });

  it('falls back to the HTTP status when the body is valid JSON but has no error field', async () => {
    const res = new Response(JSON.stringify({ unexpected: 'shape' }), { status: 400 });
    const message = await apiErrorMessage(res, 'Request failed');
    expect(message).toContain('400');
  });
});
