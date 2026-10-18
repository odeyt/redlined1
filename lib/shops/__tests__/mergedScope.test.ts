/**
 * Which shops the intelligence engines read source records for.
 * The D1 Imports -> Location 2 merge is the case that matters; a live second
 * location must stay separate, and any failure must narrow, never widen.
 */
import { mergedShopScope, pickMergedShops } from '../mergedScope';

const LOC2 = '90b72748-bf01-4456-999f-f4ba48091606';
const D1 = '38d55fae-741b-4bac-b520-f96eed65bf38';

describe('pickMergedShops', () => {
  it('folds in an archived shop mirrored both ways', () => {
    expect(pickMergedShops(LOC2, [D1], [D1], [D1])).toEqual([LOC2, D1]);
  });
  it('keeps a live mirrored location out', () => {
    expect(pickMergedShops(LOC2, [D1], [D1], [])).toEqual([LOC2]);
  });
  it('ignores a one-way link', () => {
    expect(pickMergedShops(LOC2, [D1], [], [D1])).toEqual([LOC2]);
  });
  it('never repeats the shop itself or returns empty for a real id', () => {
    expect(pickMergedShops(LOC2, [LOC2], [LOC2], [LOC2])).toEqual([LOC2]);
    expect(pickMergedShops('', [D1], [D1], [D1])).toEqual([]);
  });
});

/** A Supabase-shaped stub answering the three lookups. */
function db(state: { out: string[]; inc: string[]; archived: string[]; fail?: string }) {
  const calls: string[] = [];
  return {
    calls,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters[k] = v; return q; },
        in: (k: string, v: unknown) => { filters[k] = v; return q; },
        then: (resolve: (r: unknown) => unknown) => {
          calls.push(table);
          if (state.fail === table) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve);
          if (table === 'shop_mirrors' && 'shop_id' in filters && !('mirror_shop_id' in filters)) {
            return Promise.resolve({ data: state.out.map(id => ({ mirror_shop_id: id })), error: null }).then(resolve);
          }
          if (table === 'shop_mirrors') {
            return Promise.resolve({ data: state.inc.map(id => ({ shop_id: id })), error: null }).then(resolve);
          }
          return Promise.resolve({
            data: (filters.id as string[]).map(id => ({ id, archived_at: state.archived.includes(id) ? '2026-10-17T04:21:39Z' : null })),
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
  };
}

describe('mergedShopScope', () => {
  it('returns Location 2 plus the merged D1 Imports', async () => {
    expect(await mergedShopScope(db({ out: [D1], inc: [D1], archived: [D1] }), LOC2)).toEqual([LOC2, D1]);
  });

  it('returns only the shop when nothing is merged', async () => {
    expect(await mergedShopScope(db({ out: [D1], inc: [D1], archived: [] }), LOC2)).toEqual([LOC2]);
    expect(await mergedShopScope(db({ out: [], inc: [], archived: [] }), LOC2)).toEqual([LOC2]);
  });

  it('fails closed on any lookup error', async () => {
    for (const fail of ['shop_mirrors', 'shops']) {
      expect(await mergedShopScope(db({ out: [D1], inc: [D1], archived: [D1], fail }), LOC2)).toEqual([LOC2]);
    }
  });

  it('caches per client, and does not cache a failure', async () => {
    const ok = db({ out: [D1], inc: [D1], archived: [D1] });
    await mergedShopScope(ok, LOC2);
    const n = ok.calls.length;
    await mergedShopScope(ok, LOC2);
    expect(ok.calls.length).toBe(n);

    const state = { out: [D1], inc: [D1], archived: [D1], fail: 'shops' as string | undefined };
    const flaky = db(state);
    expect(await mergedShopScope(flaky, LOC2)).toEqual([LOC2]);
    state.fail = undefined;
    expect(await mergedShopScope(flaky, LOC2)).toEqual([LOC2, D1]);
  });

  it('returns nothing for no shop', async () => {
    expect(await mergedShopScope(db({ out: [], inc: [], archived: [] }), '')).toEqual([]);
  });
});
