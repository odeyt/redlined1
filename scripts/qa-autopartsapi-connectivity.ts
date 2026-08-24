/**
 * AutoPartsAPI connectivity proof.
 *
 * Isolates credentials, networking, base URL and authentication from OEM
 * lookup logic — so when something fails there is one answer to which of them
 * broke, rather than four candidates.
 *
 * It hits ONE documented reference endpoint, `/languages/list`, and it is not
 * part of any test suite: the free plan has few calls a month and a script
 * that runs in CI is a quota that disappears by the 12th.
 *
 *   npx tsx --conditions=react-server scripts/qa-autopartsapi-connectivity.ts
 *
 * The `--conditions` flag is required, not decoration: the client module is
 * `server-only`, whose default export throws outside a server context. That
 * condition resolves it to the no-op the React server build uses. Needing the
 * flag is the guard working.
 *
 * Exit codes: 0 proven · 1 a check failed · 2 could not run (no credentials).
 * Prints PRESENT/MISSING for the credential and never the value.
 */
import { config } from 'dotenv';
import {
  credentialStatus, hasCredentials, resolveBaseUrl, buildProviderUrl,
  listLanguages, resolveLocale, PHASE1_LANGUAGE_NAME,
} from '../lib/parts/providers/autopartsapi/client';
import { autoPartsApiRequest } from '../lib/parts/providers/autopartsapi/client';
import {
  SEARCH_BY_OEM, searchByOemQuery, AUTOPARTS_ENGLISH_LANG_ID,
} from '../lib/parts/providers/autopartsapi/endpoints';
import { normalizeAutoPartsResponse } from '../lib/parts/providers/autopartsapi/normalize';
import { AutoPartsApiError } from '../lib/parts/providers/autopartsapi/types';

config({ path: '.env.local' });

const line = (l: string) => console.log(l);
const pass = (l: string) => console.log(`  PASS   ${l}`);
const fail = (l: string) => { console.log(`  FAIL   ${l}`); process.exitCode = 1; };
const skip = (l: string) => console.log(`  BLOCKED ${l}`);

async function main() {
  line('');
  line('AUTOPARTSAPI LIVE PROOF');
  line('='.repeat(60));
  line(`Base URL:        ${resolveBaseUrl()}`);
  line(`AUTOPARTS_API_KEY: ${credentialStatus()}`);
  line('='.repeat(60));

  // 1. URL construction — provable with no network and no credentials.
  try {
    const url = buildProviderUrl('languages/list');
    if (url === `${resolveBaseUrl()}/languages/list`) pass(`URL construction -> ${url}`);
    else fail(`URL construction produced ${url}`);
  } catch (e) {
    fail(`URL construction threw: ${(e as Error).message}`);
  }

  // 2. SSRF refusal — also provable offline, and worth proving every time.
  const hostile = ['https://evil.example.com/x', '../../admin', '//evil.example.com'];
  const refused = hostile.filter(h => {
    try { buildProviderUrl(h); return false; } catch { return true; }
  });
  if (refused.length === hostile.length) pass('hostile paths refused (SSRF guard)');
  else fail(`a hostile path was accepted: ${hostile.filter(h => !refused.includes(h)).join(', ')}`);

  if (!hasCredentials()) {
    line('');
    skip('live connectivity — AUTOPARTS_API_KEY is not configured.');
    skip('authentication (x-apiprofile-key) — cannot be exercised without a key.');
    skip('reference lookup (/languages/list) — not attempted.');
    line('');
    line('NOT PROVEN. Add AUTOPARTS_API_KEY and re-run.');
    line('No request was made, and no result is being claimed.');
    line('');
    process.exitCode = 2;
    return;
  }

  // 3. Live reference call.
  try {
    const rows = await listLanguages();
    pass(`authentication (x-apiprofile-key) accepted`);
    pass(`GET /languages/list -> ${rows.length} records`);

    const sample = rows.slice(0, 5)
      .map(r => `${r.lngId ?? r.id ?? '?'}:${r.lngDescription ?? r.name ?? r.lngIso2 ?? '?'}`)
      .join('  ');
    line(`         sample: ${sample}`);

    // 4. Locale resolution — the point where an assumed lang-id would show up.
    try {
      const locale = await resolveLocale();
      pass(`locale resolved by NAME ("${PHASE1_LANGUAGE_NAME}") -> languageId ${locale.languageId}`);
      if (locale.countryFilterId === undefined) pass('no country filter assumed in Phase 1');
      else fail('a country filter was set without a documented meaning');
    } catch (e) {
      fail(`locale resolution: ${(e as AutoPartsApiError).kind ?? (e as Error).message}`);
    }

    // ── Gate 2: exactly ONE OEM search ──────────────────────────────────────
    //
    // One call, not a loop. The free plan is small and an exploratory sweep
    // is how a month's quota disappears in an afternoon.
    const oem = process.env.AUTOPARTS_TEST_OEM?.trim() || '04465-0K340';
    line('');
    line(`OEM search: GET /${SEARCH_BY_OEM}?langId=${AUTOPARTS_ENGLISH_LANG_ID}&articleOemNo=${oem}`);

    try {
      const payload = await autoPartsApiRequest<unknown>(
        SEARCH_BY_OEM, searchByOemQuery(oem, AUTOPARTS_ENGLISH_LANG_ID));

      // Sanitised evidence only — shape and counts, never a full payload.
      const topLevel = Array.isArray(payload)
        ? `array(${payload.length})`
        : `object{${Object.keys(payload as object).slice(0, 8).join(',')}}`;
      pass(`HTTP 200, top-level ${topLevel}`);

      const normalized = normalizeAutoPartsResponse(payload, {
        query: oem, oemNumber: oem, currency: 'USD',
      }, { checkedAt: new Date().toISOString() });

      if (!normalized.length) {
        fail('normalisation produced 0 records — the live shape differs from the fixtures');
        line('         Capture a sanitised fixture and update normalize.ts.');
        line('         Do NOT bend the live response to match guessed fields.');
      } else {
        pass(`normalisation -> ${normalized.length} article(s)`);
        const a = normalized[0];
        line('');
        line('  SANITISED SAMPLE RESULT');
        line(`    article id     ${a.providerListingId ?? '(none)'}`);
        line(`    article no     ${a.manufacturerPartNumber ?? '(none)'}`);
        line(`    brand          ${a.brand ?? '(none)'}`);
        line(`    description    ${(a.title ?? '').slice(0, 70)}`);
        line(`    OEM refs       ${a.oemNumbers?.length ?? 0}`);
        line(`    image          ${a.imageUrl ? 'present' : 'none'}`);
        line(`    price          ${a.itemPrice === undefined ? 'none (catalogue publishes identity, not offers)' : 'PRESENT — investigate'}`);
        line(`    fitment        ${a.fitmentStatus}`);
        line('');
        line('  Vehicle applicability: requires a provider manufacturer-id,');
        line('  which Redlined1 does not resolve yet. NOT ATTEMPTED (quota).');
      }
    } catch (e) {
      const kind = e instanceof AutoPartsApiError ? e.kind : 'unknown';
      fail(`OEM search failed: ${kind}`);
    }
  } catch (e) {
    const kind = e instanceof AutoPartsApiError ? e.kind : 'unknown';
    fail(`live call failed: ${kind}`);
    if (kind === 'unauthorized') line('         The key was rejected. Rotate/regenerate and re-check.');
    if (kind === 'rate_limited') line('         Free-tier quota reached.');
  }

  line('');
}

main().catch(e => {
  console.error('unexpected: ' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
});
