/**
 * ONE plan rule, asked of every path that turns Creem data into a plan:
 *
 *   resolvePlan                      lib/billing/creemPlan.ts — app/api/billing/webhook/creem and Option B
 *   CreemPaymentProvider.getSubscription   lib/payments/providers/creem-provider.ts — /api/webhooks/creem
 *   creemProvider.handleWebhook      commercial/providers/creemProvider.ts — processWebhook
 *
 * At 172f5a9 resolvePlan carried its own copy of the rule, and it disagreed with the other two in one case: with a
 * product mapping configured and data naming NO product, it accepted the metadata plan on its own while the others
 * refused. Every row below is asked of all paths, and they must agree on accept/refuse AND on the plan.
 *
 * No path may ever answer with a plan the row did not prove — in particular, never a paid default.
 */
import { resolvePlan } from '../billing/creemPlan';
import { CreemPaymentProvider } from '../payments/providers/creem-provider';
import { creemProvider as commercialProvider } from '../../commercial/providers/creemProvider';

type Row = {
  name: string;
  mapping: Record<string, string>;          // CREEM_*_PRODUCT_ID variables to configure
  product?: string;
  meta: Record<string, string>;
  expect: string | null;                    // the plan, or null for refused
};

const BIZ = { CREEM_BUSINESS_MONTHLY_PRODUCT_ID: 'prod_biz' };

const ROWS: Row[] = [
  { name: 'mapped product, agreeing metadata',                 mapping: BIZ, product: 'prod_biz', meta: { plan_key: 'business' }, expect: 'business' },
  { name: 'mapped product, no metadata plan',                  mapping: BIZ, product: 'prod_biz', meta: {},                       expect: 'business' },
  { name: 'THE DISAGREEMENT: mapping configured, no product',  mapping: BIZ,                      meta: { plan_key: 'business' }, expect: null },
  { name: 'mapping configured, unknown product',               mapping: BIZ, product: 'prod_x',   meta: { plan_key: 'business' }, expect: null },
  { name: 'mapped product, contradicting metadata',            mapping: BIZ, product: 'prod_biz', meta: { plan_key: 'starter' },  expect: null },
  { name: 'metadata keys contradict each other',               mapping: BIZ, product: 'prod_biz', meta: { plan_key: 'business', plan_id: 'starter' }, expect: null },
  { name: 'one product configured for two plans',
    mapping: { ...BIZ, CREEM_STARTER_MONTHLY_PRODUCT_ID: 'prod_biz' }, product: 'prod_biz', meta: {},  expect: null },
  { name: 'no mapping, validated metadata',                    mapping: {},                       meta: { plan_key: 'business' }, expect: 'business' },
  { name: 'no mapping, unsold plan (enterprise)',              mapping: {},                       meta: { plan_key: 'enterprise' }, expect: null },
  { name: 'no mapping, no plan, no product',                   mapping: {},                       meta: {},                       expect: null },
];

function configure(mapping: Record<string, string>) {
  for (const k of Object.keys(process.env)) if (/^CREEM_.*_PRODUCT_ID$/.test(k)) delete process.env[k];
  Object.assign(process.env, mapping);
}

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

/** What lib getSubscription says, given the same facts in a subscription response. */
async function viaLibProvider(row: Row): Promise<string | null> {
  process.env.CREEM_API_KEY = 'creem_test_key_for_unit_tests';
  const body = { id: 'sub_1', status: 'active', ...(row.product ? { product: row.product } : {}), metadata: row.meta };
  global.fetch = (async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response) as unknown as typeof fetch;
  try {
    return (await new CreemPaymentProvider().getSubscription('sub_1'))?.planId ?? null;
  } catch {
    return null;
  }
}

/** What the commercial activation says, given the same facts in a checkout event. */
async function viaCommercial(row: Row): Promise<string | null> {
  delete process.env.CREEM_WEBHOOK_SECRET;
  const data = {
    customer: { id: 'cus_1' }, subscription: { id: 'sub_1' },
    ...(row.product ? { product: row.product } : {}),
    metadata: { shop_id: 'shop-1', ...row.meta },
  };
  const r = await commercialProvider.handleWebhook(JSON.stringify({ type: 'checkout.completed', id: 'e', data }), '');
  return (r.subscriptionUpdate?.planKey as string | undefined) ?? null;
}

describe('every path answers the same', () => {
  it.each(ROWS.map(r => [r.name, r] as const))('%s', async (_name, row) => {
    configure(row.mapping);
    const data = row.product ? { product: row.product } : {};

    const pr37 = resolvePlan(row.meta, data);
    const pr37Plan = pr37.kind === 'plan' ? pr37.planKey : null;

    expect(pr37Plan).toBe(row.expect);
    expect(await viaLibProvider(row)).toBe(row.expect);
    expect(await viaCommercial(row)).toBe(row.expect);
  });
});

describe('Solo', () => {
  it('is sold through the lib paths, and REFUSED by the commercial layer, which does not sell it', async () => {
    configure({ CREEM_SOLO_MONTHLY_PRODUCT_ID: 'prod_solo' });
    const row: Row = { name: 'solo', mapping: {}, product: 'prod_solo', meta: { plan_key: 'solo' }, expect: 'solo' };

    const pr37 = resolvePlan(row.meta, { product: row.product });
    expect(pr37).toEqual({ kind: 'plan', planKey: 'solo' });
    expect(await viaLibProvider(row)).toBe('solo');
    expect(await viaCommercial(row)).toBeNull();
  });
});
