/**
 * Redline AI — query-layer regression tests.
 *
 * The vehicles table has no created_at column (vehicles are received —
 * date_received is its date column). searchVehicles once ordered by
 * created_at, which made vehicle search fail in production with
 * "column vehicles.created_at does not exist". This test pins the
 * ordering column so it cannot regress.
 */
import { fetchVehicleHistory, searchVehicles } from '../queries';

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

describe('fetchVehicleHistory', () => {
  // Regression: job_cards / estimates / invoices have NO vehicle_id column —
  // they store the vehicle as text in `vehicle`. History must match on that
  // text (production failed with "column job_cards.vehicle_id does not exist").
  const LABEL = 'BMW X6 xDrive35i 2014 #3377';
  const fixtures = {
    vehicles: [
      { id: 'v1', label: LABEL, plate: '3377', customer_id: 'c1' },
      { id: 'v2', label: 'Toyota Hilux #1111', plate: '1111', customer_id: 'c2' },
    ],
    customers: [
      { id: 'c1', name: 'Test Customer' },
      { id: 'c2', name: 'Other Customer' },
    ],
    job_cards: [
      { id: 'j1', ro: 'JC-1', customer: 'Test Customer', vehicle: LABEL, service_type: 'Brakes', status: 'Completed', created_at: '2026-10-02' },
      { id: 'j2', ro: 'JC-2', customer: 'Other Customer', vehicle: 'Toyota Hilux #1111', service_type: 'Oil', status: 'Completed', created_at: '2026-10-03' },
    ],
    estimates: [
      { id: 'e1', estimate_number: 'EST-1', status: 'Declined', vehicle: LABEL, customer_id: 'c1', total_amount: 200, created_at: '2026-09-01' },
    ],
    invoices: [
      { number: 'INV-1', customer: 'Test Customer', vehicle: LABEL, status: 'Paid', lines: [], created_at: '2026-10-05' },
    ],
    repair_orders: [],
    inspections: [],
  };

  it('builds the timeline by matching the vehicle TEXT, not a vehicle_id', async () => {
    const { db } = recordingDb(fixtures);
    const history = await fetchVehicleHistory(db, ['shop-1'], 'v1', '2026-11-22');
    expect(history).not.toBeNull();
    const kinds = history!.events.map(e => e.kind).sort();
    expect(kinds).toEqual(['estimate', 'invoice', 'job']);
    expect(history!.events.some(e => e.reference === 'JC-1')).toBe(true);
    expect(history!.events.some(e => e.reference === 'JC-2')).toBe(false);
    expect(history!.declinedEstimates.map(e => e.number)).toEqual(['EST-1']);
  });

  it('returns null for a vehicle outside the scope result', async () => {
    const { db } = recordingDb({ ...fixtures, vehicles: [] });
    await expect(fetchVehicleHistory(db, ['shop-1'], 'nope', '2026-11-22')).resolves.toBeNull();
  });
});
