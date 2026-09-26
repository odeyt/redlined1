/**
 * Writing a feature-flag row without ON CONFLICT.
 *
 * feature_flags' uniqueness is an expression index over COALESCE'd scope
 * columns, which `upsert({ onConflict: 'flag_key,scope,shop_id,…' })` cannot
 * target — Postgres refused every toggle from Settings with a 500. These pin
 * the replacement: match the row NULL-aware (IS NULL, never "any"), update it
 * if it exists, insert only if it does not, and survive losing an insert race.
 */
import { matchScope, normalizeScopeKey, saveFlagRow } from '@/lib/featureFlags/saveFlagRow';

type Op = { kind: 'update' | 'insert'; payload: Record<string, unknown>; filters: [string, string, unknown][] };

/** A stand-in for the Supabase query builder that records filters and replays scripted results. */
function fakeDb(script: { updateMatches: number[]; insertError?: { code?: string; message: string } | null }) {
  const ops: Op[] = [];
  let updateCall = 0;
  const db = {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        const op: Op = { kind: 'update', payload, filters: [] };
        ops.push(op);
        const q = {
          eq: (c: string, v: unknown) => { op.filters.push(['eq', c, v]); return q; },
          is: (c: string, v: unknown) => { op.filters.push(['is', c, v]); return q; },
          select: async () => {
            const n = script.updateMatches[updateCall++] ?? 0;
            return { data: Array.from({ length: n }, (_, i) => ({ id: `row-${i}` })), error: null };
          },
        };
        return q;
      },
      insert: async (payload: Record<string, unknown>) => {
        ops.push({ kind: 'insert', payload, filters: [] });
        return { error: script.insertError ?? null };
      },
      upsert: () => { throw new Error('upsert must not be used: ON CONFLICT cannot target the expression index'); },
    }),
  };
  return { db: db as never, ops };
}

const GLOBAL = normalizeScopeKey({ flag_key: 'intent_intake' });

describe('matchScope', () => {
  it('filters empty scope targets with IS NULL, never by skipping them', () => {
    const calls: [string, string, unknown][] = [];
    const q = { eq: (c: string, v: string) => { calls.push(['eq', c, v]); return q; }, is: (c: string, v: null) => { calls.push(['is', c, v]); return q; } };
    matchScope(q, normalizeScopeKey({ flag_key: 'x', scope: 'shop', shop_id: 'shop-1', role: '' }));
    expect(calls).toEqual([
      ['eq', 'flag_key', 'x'], ['eq', 'scope', 'shop'],
      ['eq', 'shop_id', 'shop-1'], ['is', 'user_id', null], ['is', 'role', null], ['is', 'environment', null],
    ]);
  });
});

describe('saveFlagRow', () => {
  it('updates the existing global row in place', async () => {
    const { db, ops } = fakeDb({ updateMatches: [1] });
    const res = await saveFlagRow(db, GLOBAL, { enabled: false });

    expect(res).toEqual({ error: null, created: false });
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe('update');
    expect(ops[0].payload).toMatchObject({ enabled: false });
    expect(ops[0].filters).toContainEqual(['is', 'shop_id', null]);
  });

  it('inserts when no row exists for that scope', async () => {
    const { db, ops } = fakeDb({ updateMatches: [0] });
    const res = await saveFlagRow(db, GLOBAL, { enabled: true });

    expect(res).toEqual({ error: null, created: true });
    expect(ops.map(o => o.kind)).toEqual(['update', 'insert']);
    expect(ops[1].payload).toMatchObject({ flag_key: 'intent_intake', scope: 'global', shop_id: null, enabled: true });
  });

  it('falls back to updating when another request inserted first', async () => {
    const { db, ops } = fakeDb({ updateMatches: [0, 1], insertError: { code: '23505', message: 'duplicate key' } });
    const res = await saveFlagRow(db, GLOBAL, { enabled: true });

    expect(res).toEqual({ error: null, created: false });
    expect(ops.map(o => o.kind)).toEqual(['update', 'insert', 'update']);
  });

  it('reports any other insert error', async () => {
    const { db } = fakeDb({ updateMatches: [0], insertError: { code: '42501', message: 'permission denied' } });
    expect(await saveFlagRow(db, GLOBAL, { enabled: true })).toEqual({ error: 'permission denied', created: false });
  });
});
