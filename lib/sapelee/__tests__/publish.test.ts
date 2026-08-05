import { publishSapeleeEvent } from '../publish';
import { SAPELEE_EVENT_TYPES } from '../types';

const ORIGINAL_ENABLED = process.env.SAPELEE_EVENTS_ENABLED;

afterEach(() => {
  process.env.SAPELEE_EVENTS_ENABLED = ORIGINAL_ENABLED;
});

function fakeSupabase(insertResult: { error: unknown }) {
  const insertMock = jest.fn().mockResolvedValue(insertResult);
  const fromMock = jest.fn(() => ({ insert: insertMock }));
  return { client: { from: fromMock } as never, insertMock, fromMock };
}

describe('publishSapeleeEvent', () => {
  it('is a complete no-op (no DB call at all) when SAPELEE_EVENTS_ENABLED is not "true"', async () => {
    delete process.env.SAPELEE_EVENTS_ENABLED;
    const { client, fromMock } = fakeSupabase({ error: null });

    const result = await publishSapeleeEvent(client, {
      eventType: SAPELEE_EVENT_TYPES.REPAIR_COMPLETED,
      payload: { jobCardId: 'jc-1', completedAt: new Date().toISOString() },
    });

    expect(result.queued).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('writes a row to sapelee_event_outbox when enabled', async () => {
    process.env.SAPELEE_EVENTS_ENABLED = 'true';
    const { client, insertMock, fromMock } = fakeSupabase({ error: null });

    const result = await publishSapeleeEvent(client, {
      eventType: SAPELEE_EVENT_TYPES.JOB_CARD_CREATED,
      payload: { jobCardId: 'jc-1' },
      shopId: 'shop-1',
    });

    expect(result.queued).toBe(true);
    expect(fromMock).toHaveBeenCalledWith('sapelee_event_outbox');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ shop_id: 'shop-1', event_type: 'job_card.created' })
    );
  });

  it('returns queued:false without throwing when the insert fails', async () => {
    process.env.SAPELEE_EVENTS_ENABLED = 'true';
    const { client } = fakeSupabase({ error: { message: 'db down' } });

    const result = await publishSapeleeEvent(client, {
      eventType: SAPELEE_EVENT_TYPES.JOB_CARD_CREATED,
      payload: {},
    });

    expect(result.queued).toBe(false);
  });

  it('returns queued:false without throwing when the client itself throws', async () => {
    process.env.SAPELEE_EVENTS_ENABLED = 'true';
    const client = { from: () => { throw new Error('boom'); } } as never;

    const result = await publishSapeleeEvent(client, {
      eventType: SAPELEE_EVENT_TYPES.JOB_CARD_CREATED,
      payload: {},
    });

    expect(result.queued).toBe(false);
  });
});
