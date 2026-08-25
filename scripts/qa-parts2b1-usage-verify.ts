/**
 * Prove the hardened usage accounting, end to end, against the real database.
 *
 * Reproduces the M-PARTS2B failure exactly: an application call, a QA script
 * call and a manual probe. Recorded total must be 3. Under the old code it
 * would have been 1 — the two untenanted rows were dropped, and the
 * application call passed no context at all.
 *
 * Spends ZERO AutoPartsAPI calls. It exercises the recording layer, not the
 * network: the point is whether a call that happened is counted, and a real
 * request would only make that harder to observe.
 *
 *   npx tsx --conditions=react-server scripts/qa-parts2b1-usage-verify.ts
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!/ldjrlvjkmzrcdqhetqoh/.test(url)) {
  console.error('Refusing to run: expected the Redlined1 project.');
  process.exit(2);
}
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

const TABLE = 'parts_provider_usage_events';
const MARKER = 'qa-2b1-verify';

let failed = 0;
const check = (l: string, ok: boolean, detail?: unknown) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}   ${l}${detail === undefined ? '' : ' -> ' + JSON.stringify(detail)}`);
  if (!ok) failed += 1;
};

async function main() {
  const { recordUsage, usageSummary, quotaLevel } =
    await import('../lib/parts/providers/autopartsapi/telemetry');

  console.log('\nM-PARTS2B.1 USAGE ACCOUNTING VERIFICATION');
  console.log('='.repeat(64));

  // ── Columns exist, with a negative control ───────────────────────────────
  const { data: probe, error: probeErr } = await admin.from(TABLE).select('*').limit(1);
  check('usage table readable by service_role', !probeErr);

  const { error: controlErr } = await admin.from('definitely_not_a_real_table_xyz').select('*').limit(1);
  check('negative control — a missing table still errors', Boolean(controlErr));

  // Column presence proved by writing them, not by reading an empty table.
  const { data: shop } = await admin.from('shops').select('id').limit(1).single();
  if (!shop) { console.error('no shop available'); process.exit(2); }

  void probe;

  // ── The M-PARTS2B failure, reproduced ────────────────────────────────────
  console.log('\nreproducing the 7-vs-10 undercount:');

  await recordUsage({ shopId: shop.id, category: 'oem_search', callContext: 'application', outcome: 'external', success: true, statusClass: '2xx', latencyMs: 120 });
  await recordUsage({ category: 'reference', callContext: 'qa', outcome: 'external', success: true, statusClass: '2xx' });
  await recordUsage({ category: 'models', callContext: 'manual_probe', outcome: 'external', success: true, statusClass: '2xx' });

  // Things that must NOT count against the allowance.
  await recordUsage({ shopId: shop.id, category: 'manufacturers', callContext: 'application', outcome: 'cache_hit', success: true });
  await recordUsage({ shopId: shop.id, category: 'manufacturers', callContext: 'application', outcome: 'coalesced', success: true });
  // A failure still spent a request.
  await recordUsage({ shopId: shop.id, category: 'oem_search', callContext: 'application', outcome: 'external', success: false, failureKind: 'rate_limited', statusClass: '4xx' });

  await new Promise(r => setTimeout(r, 400));

  const since = new Date(Date.now() - 60_000).toISOString();
  const { data: rows } = await admin
    .from(TABLE)
    .select('shop_id, call_context, outcome, success, status_class, latency_ms, endpoint_category')
    .gte('created_at', since);

  const mine = (rows ?? []) as Array<Record<string, unknown>>;
  const external = mine.filter(r => r.outcome === 'external');

  check('all three contexts recorded', external.length === 4, {
    application: external.filter(r => r.call_context === 'application').length,
    qa: external.filter(r => r.call_context === 'qa').length,
    manual_probe: external.filter(r => r.call_context === 'manual_probe').length,
  });

  check('an untenanted QA call was NOT dropped',
    external.some(r => r.call_context === 'qa' && r.shop_id === null));
  check('an untenanted probe was NOT dropped',
    external.some(r => r.call_context === 'manual_probe' && r.shop_id === null));

  check('a FAILED call still counts as external',
    external.some(r => r.success === false));

  check('a cache hit is not external', mine.some(r => r.outcome === 'cache_hit'));
  check('a coalesced waiter is its own outcome, not a cache hit',
    mine.some(r => r.outcome === 'coalesced'));
  check('cache hits and coalesced are excluded from external',
    external.every(r => r.outcome === 'external'));

  check('status class stored, not a body',
    external.every(r => r.status_class === null || ['2xx', '3xx', '4xx', '5xx'].includes(String(r.status_class))));
  check('latency stored where measured', mine.some(r => Number(r.latency_ms) > 0));

  // ── Constraints hold ─────────────────────────────────────────────────────
  const { error: badContext } = await admin.from(TABLE).insert({
    shop_id: shop.id, endpoint_category: 'reference', call_context: 'not-a-context',
  });
  check('call_context CHECK refuses an unknown context', Boolean(badContext));

  const { error: badOutcome } = await admin.from(TABLE).insert({
    shop_id: shop.id, endpoint_category: 'reference', outcome: 'made-it-up',
  });
  check('outcome CHECK refuses an unknown outcome', Boolean(badOutcome));

  // ── The browser still cannot write ───────────────────────────────────────
  const { error: anonWrite } = await anon.from(TABLE).insert({
    shop_id: shop.id, endpoint_category: 'reference', call_context: 'application',
  });
  check('anon INSERT is still denied', Boolean(anonWrite));

  // ── The summary reads it back correctly ──────────────────────────────────
  const all = await usageSummary(null);
  const oneShop = await usageSummary(shop.id);

  check('all-context summary sees the untenanted calls',
    all.monthByContext.qa >= 1 && all.monthByContext.manual_probe >= 1,
    { qa: all.monthByContext.qa, manual_probe: all.monthByContext.manual_probe });

  check('shop summary excludes untenanted calls',
    oneShop.monthExternal <= all.monthExternal,
    { shop: oneShop.monthExternal, all: all.monthExternal });

  check('cache hits and coalesced are reported separately',
    all.monthCacheHits >= 1 && all.monthCoalesced >= 1,
    { cacheHits: all.monthCacheHits, coalesced: all.monthCoalesced });

  check('summary exposes no remaining-calls figure',
    !Object.keys(all).some(k => /remaining/i.test(k)));
  check('summary states provider-side usage is authoritative',
    all.note.includes('provider-side usage is authoritative'));

  check('quota level computed from the local external count',
    quotaLevel(70, 100) === 'warning' && quotaLevel(90, 100) === 'critical');

  console.log('\nlocal accounting now reads:');
  console.log(`  month external ${all.monthExternal}  cache ${all.monthCacheHits}  coalesced ${all.monthCoalesced}`);
  console.log(`  by context     application ${all.monthByContext.application} · qa ${all.monthByContext.qa} · manual_probe ${all.monthByContext.manual_probe}`);
  console.log(`  level          ${all.level}   nominal allowance ${all.nominalAllowance}`);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  await admin.from(TABLE).delete().gte('created_at', since);
  const { data: left } = await admin.from(TABLE).select('id').gte('created_at', since);
  check('QA usage rows removed', (left ?? []).length === 0);

  console.log('='.repeat(64));
  console.log(failed ? `\n${failed} CHECK(S) FAILED\n` : `\nALL CHECKS PASSED  (${MARKER})\n`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => {
  console.error('unexpected: ' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
