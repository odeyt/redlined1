/**
 * Redline AI — query-layer regression tests.
 *
 * The vehicles table has no created_at column (vehicles are received —
 * date_received is its date column). searchVehicles once ordered by
 * created_at, which made vehicle search fail in production with
 * "column vehicles.created_at does not exist". This test pins the
 * ordering column so it cannot regress.
 */
import { searchVehicles } from '../queries';

/** A Supabase-shaped stub that records order() calls per table. */
function recordingDb(fixtures: Record<string, Record<string, unknown>[]>) {
  const orders: Record<string, string[]> = {};
  const db = {
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        or: () => chain,
        order: (col: string) => {
          (orders[table] ??= []).push(col);
          return chain;
        },
        limit: () => chain,
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: fixtures[table] ?? [], error: null }),
      };
      return chain;
    },
  };
  return { db, orders };
}

describe('searchVehicles', () => {
  it('orders vehicles by date_received, never created_at', async () => {
    const { db, orders } = recordingDb({
      vehicles: [
        { id: 'v1', label: '2014 BMW X6', plate: 'ABC123', customer_id: 'c1' },
      ],
      customers: [{ id: 'c1', name: 'Test Customer' }],
    });
    const found = await searchVehicles(db, ['shop-1'], 'BMW');
    expect(found).toHaveLength(1);
    expect(found[0].label).toBe('2014 BMW X6');
    expect(orders.vehicles).toEqual(['date_received']);
  });

  it('returns an empty list when nothing matches', async () => {
    const { db } = recordingDb({ vehicles: [], customers: [] });
    await expect(searchVehicles(db, ['shop-1'], 'zzz')).resolves.toEqual([]);
  });
});
