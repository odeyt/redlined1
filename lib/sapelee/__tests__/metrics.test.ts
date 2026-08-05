import { getOutboxMetrics } from '../metrics';

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
