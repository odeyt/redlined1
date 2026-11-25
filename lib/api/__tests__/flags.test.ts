/**
 * The api_v1_documents gate: off unless it is on for every shop the key covers.
 */
import { apiFlagOnForShops, isApiFlagOn } from '../flags';
import type { FeatureFlag } from '@/lib/featureFlags/types';

const row = (r: Partial<FeatureFlag>): FeatureFlag =>
  ({ flag_key: 'api_v1_documents', enabled: false, scope: 'global', ...r }) as FeatureFlag;

const on = (rows: FeatureFlag[], shops: string[], env: 'production' | 'staging' = 'production') =>
  apiFlagOnForShops(rows, 'api_v1_documents', shops, env);

describe('apiFlagOnForShops', () => {
  it('is off with no row at all', () => {
    expect(on([], ['a'])).toBe(false);
  });

  it('is off as seeded (global row, disabled)', () => {
    expect(on([row({})], ['a'])).toBe(false);
  });

  it('follows the global row when nothing narrower exists', () => {
    expect(on([row({ enabled: true })], ['a', 'b'])).toBe(true);
  });

  it('a shop row turns it on for that shop only', () => {
    const rows = [row({}), row({ scope: 'shop', shop_id: 'a', enabled: true })];
    expect(on(rows, ['a'])).toBe(true);
    expect(on(rows, ['b'])).toBe(false);
  });

  it('stays off for a multi-shop key unless every shop is on', () => {
    const rows = [row({}), row({ scope: 'shop', shop_id: 'a', enabled: true })];
    expect(on(rows, ['a', 'b'])).toBe(false);
  });

  it('a shop row can switch one shop off under a global on', () => {
    const rows = [row({ enabled: true }), row({ scope: 'shop', shop_id: 'b', enabled: false })];
    expect(on(rows, ['a'])).toBe(true);
    expect(on(rows, ['b'])).toBe(false);
  });

  it('an environment row applies, so a preview can be on while production is off', () => {
    const rows = [row({}), row({ scope: 'environment', environment: 'staging', enabled: true })];
    expect(on(rows, ['a'], 'staging')).toBe(true);
    expect(on(rows, ['a'], 'production')).toBe(false);
  });

  it('a user-scoped row never applies to a key (no user)', () => {
    expect(on([row({}), row({ scope: 'user', user_id: '', enabled: true })], ['a'])).toBe(false);
  });

  it('is off for a key with no shops', () => {
    expect(on([row({ enabled: true })], [])).toBe(false);
  });
});

describe('isApiFlagOn fails closed', () => {
  const db = (result: unknown) => ({
    from: () => ({ select: () => ({ eq: () => Promise.resolve(result) }) }),
  });

  it('on a read error', async () => {
    expect(await isApiFlagOn(db({ data: null, error: { message: 'x' } }), 'api_v1_documents', ['a'])).toBe(false);
  });

  it('on an exception', async () => {
    const throwing = { from: () => { throw new Error('down'); } };
    expect(await isApiFlagOn(throwing, 'api_v1_documents', ['a'])).toBe(false);
  });

  it('reads only its own flag, fresh', async () => {
    const eq = jest.fn(() => Promise.resolve({ data: [row({ enabled: true })], error: null }));
    const fake = { from: jest.fn(() => ({ select: () => ({ eq }) })) };
    expect(await isApiFlagOn(fake, 'api_v1_documents', ['a'])).toBe(true);
    expect(await isApiFlagOn(fake, 'api_v1_documents', ['a'])).toBe(true);
    expect(fake.from).toHaveBeenCalledTimes(2); // no cache: an off switch acts at once
    expect(eq).toHaveBeenCalledWith('flag_key', 'api_v1_documents');
  });
});
