import { demoTargetFailures, INTERNAL_SHOP_IDS, PRODUCTION_PROJECT_REF, type DemoTargetFacts } from '../guards';

const DEMO = '5b0e7c1a-1111-4222-8333-444455556666';

const ok = (over: Partial<DemoTargetFacts> = {}): DemoTargetFacts => ({
  mode: 'apply',
  env: { shopId: DEMO, allowWrite: 'true', allowProduction: 'true', projectRef: PRODUCTION_PROJECT_REF },
  shop: { id: DEMO, name: 'Summit Auto & Fleet Service', isSynthetic: true },
  mirrorLinks: 0,
  members: [{ userId: 'u1', role: 'owner' }],
  ownerPlan: 'pro',
  todayWindowUsable: true,
  ...over,
});

it('allows a verified synthetic shop, named explicitly, with every flag set', () => {
  expect(demoTargetFailures(ok())).toEqual([]);
});

describe('refuses to write when the shop cannot be proven to be a demo shop', () => {
  it.each<[string, Partial<DemoTargetFacts>]>([
    ['no DEMO_SHOP_ID', { env: { ...ok().env, shopId: undefined } }],
    ['DEMO_SHOP_ID not a UUID', { env: { ...ok().env, shopId: 'My Shop' } }],
    ['shop not found', { shop: null }],
    ['is_synthetic column missing', { shop: { id: DEMO, name: 'My Shop', isSynthetic: null } }],
    ['is_synthetic false (a real customer)', { shop: { id: DEMO, name: 'My Shop', isSynthetic: false } }],
    ['read back a different shop', { shop: { id: '5b0e7c1a-1111-4222-8333-000000000000', name: 'x', isSynthetic: true } }],
    ['mirrored with another shop', { mirrorLinks: 1 }],
    ['mirrors unreadable', { mirrorLinks: null }],
    ['members unreadable', { members: null }],
    ['a second member', { members: [{ userId: 'u1', role: 'owner' }, { userId: 'u2', role: 'technician' }] }],
    ['no owner', { members: [] }],
    ['owner on Free Forever (free-tier caps would reject part-way)', { ownerPlan: 'free' }],
    ['owner profile unreadable', { ownerPlan: undefined }],
    ['write flag missing', { env: { ...ok().env, allowWrite: undefined } }],
    ['production flag missing', { env: { ...ok().env, allowProduction: 'yes' } }],
    ['evening gap between Chicago and UTC', { todayWindowUsable: false }],
  ])('%s', (_label, over) => {
    expect(demoTargetFailures(ok(over)).length).toBeGreaterThan(0);
  });

  it.each(INTERNAL_SHOP_IDS)('D1 internal shop %s, even if someone flagged it synthetic', id => {
    const f = demoTargetFailures(ok({ env: { ...ok().env, shopId: id }, shop: { id, name: 'D1', isSynthetic: true } }));
    expect(f.join(' ')).toMatch(/internal shop/);
  });
});

describe('plan mode (read-only)', () => {
  it('needs no write flags, but still proves the target', () => {
    const env = { ...ok().env, allowWrite: undefined, allowProduction: undefined };
    expect(demoTargetFailures(ok({ mode: 'plan', env }))).toEqual([]);
    expect(demoTargetFailures(ok({ mode: 'plan', env, shop: { id: DEMO, name: 'x', isSynthetic: false } }))).not.toEqual([]);
  });

  it('reports a free owner only when something would be written', () => {
    expect(demoTargetFailures(ok({ mode: 'plan', ownerPlan: 'free' }))).toEqual([]);
  });
});

it('does not need the production flag for a non-production project', () => {
  expect(demoTargetFailures(ok({ env: { ...ok().env, projectRef: 'stagingref123', allowProduction: undefined } }))).toEqual([]);
});
