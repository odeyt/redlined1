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
      .map(r => `${r.id ?? r.languageId ?? r.lang_id}:${r.name ?? r.language ?? r.code ?? '?'}`)
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

    line('');
    line('Catalogue/OEM search: NOT ATTEMPTED — the search endpoint is not');
    line('documented to this codebase. See AUTOPARTS_SEARCH_PATH in');
    line('lib/parts/providers/autopartsapi/provider.ts.');
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
