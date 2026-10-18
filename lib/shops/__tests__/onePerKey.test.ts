/**
 * Reading per-vehicle intelligence across a merged scope must count each
 * vehicle once, preferring the copy computed for the shop that stays open.
 */
import { onePerKey } from '../onePerKey';

const LOC2 = 'loc2';
const D1 = 'd1';

describe('onePerKey', () => {
  it('keeps a merged shop\'s vehicle that has no copy here yet', () => {
    const rows = [
      { shop_id: LOC2, vehicle_id: 'v-loc2', health_status: 'ok' },
      { shop_id: D1, vehicle_id: 'v-d1', health_status: 'high_risk' },
    ];
    expect(onePerKey(rows, r => r.vehicle_id, LOC2)).toEqual(rows);
  });

  it('counts a recomputed vehicle once, using the active shop\'s copy', () => {
    const rows = [
      { shop_id: D1, vehicle_id: 'v1', health_status: 'high_risk' },
      { shop_id: LOC2, vehicle_id: 'v1', health_status: 'attention' },
    ];
    const out = onePerKey(rows, r => r.vehicle_id, LOC2);
    expect(out).toHaveLength(1);
    expect(out[0].health_status).toBe('attention');
  });

  it('keeps the active copy when it comes first', () => {
    const rows = [
      { shop_id: LOC2, vehicle_id: 'v1', n: 1 },
      { shop_id: D1, vehicle_id: 'v1', n: 2 },
    ];
    expect(onePerKey(rows, r => r.vehicle_id, LOC2).map(r => r.n)).toEqual([1]);
  });

  it('preserves the original order', () => {
    const rows = [
      { shop_id: D1, vehicle_id: 'a' },
      { shop_id: LOC2, vehicle_id: 'b' },
      { shop_id: LOC2, vehicle_id: 'a' },
    ];
    expect(onePerKey(rows, r => r.vehicle_id, LOC2).map(r => `${r.vehicle_id}:${r.shop_id}`)).toEqual(['a:loc2', 'b:loc2']);
  });
});
