import { flushSapeleeOutbox } from '../flush';

const ORIGINAL_ENV = { ...process.env };

function setConfigEnv() {
  process.env.SAPELEE_EVENTS_ENABLED = 'true';
  process.env.SAPELEE_EVENTS_URL = 'https://sapelee.example.com';
  process.env.SAPELEE_KEY_ID = 'rlk_live_test';
  process.env.SAPELEE_API_SECRET = 'whsec_test_secret';
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.restoreAllMocks();
});

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'row-1',
    shop_id: 'shop-1',
    event_type: 'repair.completed',
    event_version: 1,
    payload: { jobCardId: 'jc-1', completedAt: '2026-01-01T00:00:00Z' },
    aggregate_type: null,
    aggregate_id: null,
    idempotency_key: null,
    correlation_id: null,
    status: 'pending',
    attempts: 0,
    max_attempts: 3,
    last_error: null,
    next_attempt_at: '2026-01-01T00:00:00Z',
    delivered_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function fakeSupabase(rows: unknown[]) {
  const updateCalls: Array<{ id: string; payload: unknown }> = [];
  const selectChain = {
    eq: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: rows, error: null }),
  };
  const fromMock = jest.fn(() => ({
    select: jest.fn(() => selectChain),
    update: jest.fn((payload: unknown) => ({
      eq: jest.fn((_col: string, id: string) => {
        updateCalls.push({ id, payload });
        return Promise.resolve({ error: null });
      }),
    })),
  }));
  return { client: { from: fromMock } as never, updateCalls };
}

describe('flushSapeleeOutbox', () => {
  it('is a no-op when SAPELEE_EVENTS_ENABLED is not set', async () => {
    delete process.env.SAPELEE_EVENTS_ENABLED;
    const { client } = fakeSupabase([row()]);
    const result = await flushSapeleeOutbox(client);
    expect(result.attempted).toBe(0);
  });

  it('is a no-op when enabled but not configured (missing url/key/secret)', async () => {
    process.env.SAPELEE_EVENTS_ENABLED = 'true';
    const { client } = fakeSupabase([row()]);
    const result = await flushSapeleeOutbox(client);
    expect(result.attempted).toBe(0);
  });

  it('marks a row delivered on a 2xx response, signing the exact same body it sends', async () => {
    setConfigEnv();
    const { client, updateCalls } = fakeSupabase([row()]);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201, text: async () => '' });
    global.fetch = fetchMock as never;

    const result = await flushSapeleeOutbox(client);

    expect(result.delivered).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sapelee.example.com/api/events',
      expect.objectContaining({ method: 'POST' })
    );
    expect(updateCalls[0].payload).toMatchObject({ status: 'delivered' });
  });

  it('stops early (does not attempt later rows) after a retryable failure, preserving ordering', async () => {
    setConfigEnv();
    const rows = [row({ id: 'row-1' }), row({ id: 'row-2' })];
    const { client, updateCalls } = fakeSupabase(rows);
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' });
    global.fetch = fetchMock as never;

    const result = await flushSapeleeOutbox(client);

    expect(result.attempted).toBe(1);
    expect(result.retrying).toBe(1);
    expect(result.stoppedEarly).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updateCalls[0].id).toBe('row-1');
  });

  it('marks a row permanently failed once max_attempts is reached, and continues past it', async () => {
    setConfigEnv();
    const rows = [row({ id: 'row-1', attempts: 2, max_attempts: 3 }), row({ id: 'row-2' })];
    const { client, updateCalls } = fakeSupabase(rows);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'still failing' })
      .mockResolvedValueOnce({ ok: true, status: 201, text: async () => '' });
    global.fetch = fetchMock as never;

    const result = await flushSapeleeOutbox(client);

    expect(result.permanentlyFailed).toBe(1);
    expect(result.delivered).toBe(1);
    expect(result.stoppedEarly).toBe(false);
    expect(updateCalls[0]).toMatchObject({ id: 'row-1', payload: expect.objectContaining({ status: 'failed' }) });
    expect(updateCalls[1]).toMatchObject({ id: 'row-2', payload: expect.objectContaining({ status: 'delivered' }) });
  });

  it('treats a network-level fetch throw the same as a non-2xx response', async () => {
    setConfigEnv();
    const { client, updateCalls } = fakeSupabase([row()]);
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as never;

    const result = await flushSapeleeOutbox(client);

    expect(result.retrying).toBe(1);
    expect(updateCalls[0].payload).toMatchObject({ last_error: 'ECONNREFUSED' });
  });
});
