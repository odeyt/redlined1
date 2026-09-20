/**
 * scripts/creem-subscription-shape.mjs
 *
 * READ-ONLY. Answers the one question Option B rests on and that no unit test can settle:
 *
 *     does Creem's GET /subscriptions/{id} response actually carry the fields AuthoritativeState needs?
 *
 * lib/billing/creemAuthoritative.ts reads the SUBSCRIPTION object for the shop identity (metadata.shop_id), the
 * plan (metadata.plan_key / plan_id, checked against the product), the period (current_period_*_date) and the
 * cancellation time (canceled_at). Those field names are known to be right for WEBHOOK EVENTS, because they were
 * read from stored production events. They are an ASSUMPTION for the subscriptions endpoint: metadata set at
 * checkout may live on the checkout session and not be echoed on the subscription.
 *
 * If it is not echoed, Option B does not misbehave quietly — resolvePlan returns plan_missing and every event is
 * held as provider_state_unusable. Fail-closed, but every purchase stops activating. That is worth ten minutes
 * with this script before the flag is ever turned on.
 *
 * SAFETY
 *   - one HTTP GET, no writes, no purchase, no Creem dashboard change;
 *   - refuses to run against the live API: test mode only;
 *   - prints PRESENCE and SHAPE only. No id, email, customer, amount or metadata VALUE is ever printed. The one
 *     exception is `status`, which is a fixed vocabulary this code must map and carries nothing personal.
 *
 * USAGE (PowerShell, with the Preview test credentials loaded)
 *   $env:CREEM_API_KEY='creem_test_...'; $env:CREEM_TEST_MODE='true'
 *   node scripts/creem-subscription-shape.mjs <subscription_id>
 *
 * Run it at each lifecycle stage of the staging test — after purchase, after cancellation, after resubscription.
 * The answers differ per stage, and the cancellation one is the only way to learn what canceled_at looks like.
 */

const SUBSCRIPTION_ID = process.argv[2];
const API_KEY = (process.env.CREEM_API_KEY ?? '').trim();
const TEST_MODE = (process.env.CREEM_TEST_MODE ?? '').trim() === 'true';

function die(message) { console.error(`STOP: ${message}`); process.exit(1); }

if (!SUBSCRIPTION_ID) die('pass a subscription id: node scripts/creem-subscription-shape.mjs <subscription_id>');
if (!API_KEY) die('CREEM_API_KEY is not set.');
if (!API_KEY.startsWith('creem_test_')) die('CREEM_API_KEY is not a test key. This script refuses to touch live billing.');
if (!TEST_MODE) die('CREEM_TEST_MODE is not "true". Refusing to run.');

const BASE_URL = process.env.CREEM_BASE_URL?.trim() || 'https://test-api.creem.io/v1';
if (!BASE_URL.includes('test-')) die(`CREEM_BASE_URL does not look like the test host: ${BASE_URL}`);

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 10000);

let res;
try {
  res = await fetch(`${BASE_URL}/subscriptions/${encodeURIComponent(SUBSCRIPTION_ID)}`, {
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    signal: controller.signal,
  });
} catch (err) {
  die(`request failed: ${err?.name === 'AbortError' ? 'timed out after 10000ms' : err?.message}`);
} finally {
  clearTimeout(timer);
}

if (res.status === 404) die('the provider does not know that subscription id (404).');
if (!res.ok) die(`the provider answered ${res.status}.`);

let body;
try { body = await res.json(); } catch { die('the response was not JSON.'); }
if (!body || typeof body !== 'object' || Array.isArray(body)) die('the response is not a JSON object.');

const meta = (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) ? body.metadata : null;
const has = (o, k) => !!o && o[k] !== undefined && o[k] !== null && String(o[k]).trim() !== '';
const mark = (ok) => (ok ? 'YES' : 'no ');
const idShape = (v) =>
  v === undefined || v === null ? 'absent'
    : typeof v === 'string' ? 'string'
      : typeof v === 'object' ? (has(v, 'id') ? 'object with .id' : 'object without .id')
        : typeof v;

console.log('\n─── Creem subscription response shape ───────────────────────────────');
console.log(`host              ${BASE_URL}`);
console.log(`top-level keys    ${Object.keys(body).sort().join(', ') || '(none)'}`);
console.log(`status            ${JSON.stringify(body.status ?? null)}`);
console.log(`metadata present  ${mark(!!meta)}${meta ? `  keys: ${Object.keys(meta).sort().join(', ')}` : ''}`);

console.log('\n─── What AuthoritativeState requires ────────────────────────────────');
const checks = [
  ['id',                        has(body, 'id'),                              'subscriptionId'],
  ['status (mappable)',         ['active', 'trialing', 'paid', 'canceled', 'cancelled', 'expired', 'past_due', 'unpaid']
                                  .includes(String(body.status ?? '').toLowerCase()),
                                                                              'status — anything else is held'],
  ['metadata.shop_id',          has(meta, 'shop_id'),                         'metadataShopId — the shop cross-check'],
  ['metadata.user_id',          has(meta, 'user_id'),                         'not read here, but proves metadata is echoed'],
  ['metadata.plan_key/plan_id', has(meta, 'plan_key') || has(meta, 'plan_id'), 'planKey via resolvePlan'],
  ['product id',                has(body, 'product') || has(body, 'product_id'), 'plan cross-check against CREEM_*_PRODUCT_ID'],
  ['current_period_start_date', has(body, 'current_period_start_date'),       'period.start'],
  ['current_period_end_date',   has(body, 'current_period_end_date'),         'period.end'],
  ['canceled_at',               has(body, 'canceled_at') || has(body, 'cancelled_at'), 'cancellation date (expected only once cancelled)'],
];
for (const [field, ok, why] of checks) console.log(`  [${mark(ok)}] ${field.padEnd(26)} ${why}`);

console.log('\n─── Shapes that have bitten before ──────────────────────────────────');
console.log(`  customer            ${idShape(body.customer)}`);
console.log(`  product             ${idShape(body.product ?? body.product_id)}`);
console.log(`  legacy period names ${has(body, 'current_period_start') || has(body, 'current_period_end')
  ? 'PRESENT — the legacy mapper names exist after all; re-check creemAuthoritative before changing anything'
  : 'absent, as expected'}`);

const blocking = [
  !has(body, 'id') && 'no subscription id',
  !meta && 'no metadata at all — the subscription does not echo what checkout set',
  meta && !has(meta, 'shop_id') && 'no metadata.shop_id — the shop cross-check can never fire',
  meta && !(has(meta, 'plan_key') || has(meta, 'plan_id')) && 'no plan in metadata — resolvePlan returns plan_missing',
].filter(Boolean);

console.log('\n─── Verdict ─────────────────────────────────────────────────────────');
if (blocking.length === 0) {
  console.log('  Option B can read this response. Re-run after cancellation to confirm canceled_at and the');
  console.log('  cancelled status string, and after resubscription to confirm the new id and period.');
} else {
  console.log('  BLOCKING — Option B would hold every event as provider_state_unusable:');
  for (const b of blocking) console.log(`    - ${b}`);
  console.log('\n  This does not mean Option B is wrong, it means the subscription endpoint is not the right');
  console.log('  source for identity. The alternative is to keep identity from the EVENT metadata (already');
  console.log('  proved against the shop and buyer) and take only status, plan-product and period from the');
  console.log('  provider. That is a code change to creemAuthoritative.ts, and it needs its own review.');
}
console.log('');
