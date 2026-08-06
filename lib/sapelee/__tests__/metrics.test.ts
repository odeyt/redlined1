import { getOutboxMetrics, listRecentOutboxRows } from '../metrics';

function countChain(count: number) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ count, error: null }),
  };
}

describe('getOutboxMetrics', () => {
  it('returns pending/delivered/failed counts and null age when nothing pending', async () => {
    let call = 0;
    const fromMock = jest.fn(() => {
      call += 1;
      if (call <= 3) return countChain([5, 10, 2][call - 1]);
      // 4th call: oldest-pending lookup
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const result = await getOutboxMetrics({ from: fromMock } as never);

    expect(result.pending).toBe(5);
    expect(result.delivered).toBe(10);
    expect(result.failed).toBe(2);
    expect(result.oldestPendingAgeSeconds).toBeNull();
  });

  it('computes oldestPendingAgeSeconds from the oldest pending row', async () => {
    const oldTimestamp = new Date(Date.now() - 90_000).toISOString();
    let call = 0;
    const fromMock = jest.fn(() => {
      call += 1;
      if (call <= 3) return countChain(1);
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { created_at: oldTimestamp }, error: null }),
      };
    });

    const result = await getOutboxMetrics({ from: fromMock } as never);

    expect(result.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(89);
  });
});

describe('listRecentOutboxRows', () => {
  it('returns rows ordered newest-first, up to the given limit', async () => {
    const rows = [{ id: 'row-1', event_type: 'repair.completed', status: 'delivered' }];
    const orderMock = jest.fn().mockReturnThis();
    const limitMock = jest.fn().mockResolvedValue({ data: rows, error: null });
    const fromMock = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      order: orderMock,
      limit: limitMock,
    }));

    const result = await listRecentOutboxRows({ from: fromMock } as never, 10);

    expect(result).toEqual(rows);
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(10);
  });

  it('returns an empty array on query failure rather than throwing', async () => {
    const fromMock = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
    }));

    const result = await listRecentOutboxRows({ from: fromMock } as never);

    expect(result).toEqual([]);
  });
});
