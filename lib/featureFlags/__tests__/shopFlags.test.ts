/**
 * Shop-scoped flag resolution for the intelligence routes.
 *
 * The routes used to read `.eq('flag_key', key).maybeSingle()`. With a second
 * row for the same key, that query errors, and several routes treated the
 * error as ENABLED — so a shop-only override turned a feature on for every
 * shop. These tests pin the replacement: a shop row affects that shop only,
 * and anything that cannot be read is off.
 */

type Row = {
  flag_key: string; enabled: boolean; scope: string;
  shop_id: string | null; user_id: string | null; role: string | null; environment: string | null;
};

let mockResult: { data: Row[] | null; error: { message: string } | null } = { data: [], error: null };
let mockThrow = false;
// Typed parameters so toHaveBeenLastCalledWith checks the column and keys.
const mockIn = jest.fn((...args: [col: string, keys: string[]]) => {
  void args;
  if (mockThrow) throw new Error('network down');
  return Promise.resolve(mockResult);
});
jest.mock('@/lib/supabaseServer', () => ({
  getAdminDb: () => ({
    from: () => ({ select: () => ({ in: (c: string, k: string[]) => mockIn(c, k) }) }),
  }),
}));

import { isShopFlagEnabled, resolveShopFlags } from '../shopFlags';

const DEMO = '11111111-1111-4111-8111-111111111111';
const D1 = '38d55fae-741b-4bac-b520-f96eed65bf38';

function row(p: Partial<Row> & Pick<Row, 'flag_key' | 'enabled'>): Row {
  return { scope: 'global', shop_id: null, user_id: null, role: null, environment: null, ...p };
}

beforeEach(() => {
  mockResult = { data: [], error: null };
  mockThrow = false;
  mockIn.mockClear();
});

describe('isShopFlagEnabled', () => {
  it('a shop-scoped row enables the flag for that shop only', async () => {
    mockResult.data = [
      row({ flag_key: 'morning_brief_engine', enabled: false }),
      row({ flag_key: 'morning_brief_engine', enabled: true, scope: 'shop', shop_id: DEMO }),
    ];
    expect(await isShopFlagEnabled('morning_brief_engine', { shopId: DEMO })).toBe(true);
    expect(await isShopFlagEnabled('morning_brief_engine', { shopId: D1 })).toBe(false);
  });

  it('a shop-scoped off row overrides a global on', async () => {
    mockResult.data = [
      row({ flag_key: 'recommendation_engine', enabled: true }),
      row({ flag_key: 'recommendation_engine', enabled: false, scope: 'shop', shop_id: DEMO }),
    ];
    expect(await isShopFlagEnabled('recommendation_engine', { shopId: DEMO })).toBe(false);
    expect(await isShopFlagEnabled('recommendation_engine', { shopId: D1 })).toBe(true);
  });

  it('a single global row behaves exactly as before', async () => {
    mockResult.data = [row({ flag_key: 'recommendation_engine', enabled: true })];
    expect(await isShopFlagEnabled('recommendation_engine', { shopId: D1 })).toBe(true);
  });

  it('no row is off', async () => {
    expect(await isShopFlagEnabled('morning_brief_engine', { shopId: D1 })).toBe(false);
  });

  it('a query error is off, never on', async () => {
    mockResult = { data: null, error: { message: 'boom' } };
    expect(await isShopFlagEnabled('recommendation_engine', { shopId: D1 })).toBe(false);
  });

  it('a thrown error is off, never on', async () => {
    mockThrow = true;
    expect(await isShopFlagEnabled('recommendation_engine', { shopId: D1 })).toBe(false);
  });

  it('an empty shop id is off without querying', async () => {
    mockResult.data = [row({ flag_key: 'recommendation_engine', enabled: true })];
    expect(await isShopFlagEnabled('recommendation_engine', { shopId: '' })).toBe(false);
    expect(mockIn).not.toHaveBeenCalled();
  });

  it('a user-scoped row beats the shop row', async () => {
    mockResult.data = [
      row({ flag_key: 'evidence_engine', enabled: true, scope: 'shop', shop_id: DEMO }),
      row({ flag_key: 'evidence_engine', enabled: false, scope: 'user', user_id: 'u-1' }),
    ];
    expect(await isShopFlagEnabled('evidence_engine', { shopId: DEMO, userId: 'u-1' })).toBe(false);
    expect(await isShopFlagEnabled('evidence_engine', { shopId: DEMO, userId: 'u-2' })).toBe(true);
  });
});

describe('resolveShopFlags', () => {
  it('resolves several keys in one query; missing keys are false', async () => {
    mockResult.data = [
      row({ flag_key: 'vehicle_intelligence_engine', enabled: true }),
      row({ flag_key: 'vehicle_intelligence_command_center', enabled: true, scope: 'shop', shop_id: DEMO }),
    ];
    const keys = ['vehicle_intelligence_engine', 'vehicle_intelligence_command_center', 'unknown_flag'];
    expect(await resolveShopFlags(keys, { shopId: DEMO })).toEqual({
      vehicle_intelligence_engine: true,
      vehicle_intelligence_command_center: true,
      unknown_flag: false,
    });
    expect(await resolveShopFlags(keys, { shopId: D1 })).toEqual({
      vehicle_intelligence_engine: true,
      vehicle_intelligence_command_center: false,
      unknown_flag: false,
    });
    expect(mockIn).toHaveBeenCalledTimes(2);
    expect(mockIn).toHaveBeenLastCalledWith('flag_key', keys);
  });
});
