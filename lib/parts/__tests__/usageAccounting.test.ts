/**
 * Provider usage accounting, and the undercount that caused this milestone.
 *
 * M-PARTS2B recorded 7 calls and made 10. The reported cause was "ad-hoc probe
 * scripts", but the audit found something worse: `oem_search` — the lookup
 * every technician triggers — passed no usage context either. Ordinary
 * application traffic was invisible in the monthly figure.
 *
 * A number that silently excludes the main path is worse than no number,
 * because it reads as complete.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { quotaLevel, NOMINAL_MONTHLY_ALLOWANCE } from '../providers/autopartsapi/telemetry';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const CLIENT = read('lib/parts/providers/autopartsapi/client.ts');
const TELEMETRY = read('lib/parts/providers/autopartsapi/telemetry.ts');
const PROVIDER = read('lib/parts/providers/autopartsapi/provider.ts');
const CACHE = read('lib/parts/vehicleResolution/referenceCache.ts');

describe('a provider call cannot be made without declaring who made it', () => {
  it('the usage context is REQUIRED at the network boundary', () => {
    // Optional was tried. The calls that omitted it disappeared.
    const signature = CLIENT.slice(
      CLIENT.indexOf('export async function autoPartsApiRequest'),
      CLIENT.indexOf('const key = (process.env.AUTOPARTS_API_KEY'));
    expect(signature).toContain('usage: UsageContext,');
    expect(signature).not.toContain('usage?:');
    // Nothing anywhere in the client may take it optionally — a wrapper with
    // an optional context is a wrapper whose callers can be silent.
    expect(CLIENT).not.toContain('usage?: UsageContext');
  });

  it('records the reason it is required', () => {
    expect(CLIENT).toMatch(/REQUIRED/);
    expect(CLIENT).toMatch(/oem_search/);
  });

  it('every call site in application code passes a context', () => {
    // The compiler enforces this now, but the assertion documents WHICH
    // categories the application path uses.
    expect(PROVIDER).toContain("category: 'oem_search', callContext: 'application'");
    expect(PROVIDER).toContain("category: 'oem_applicability', callContext: 'application'");
    expect(PROVIDER).toContain("category: 'cross_reference', callContext: 'application'");
  });

  it('names all five call contexts', () => {
    for (const c of ['application', 'qa', 'migration', 'maintenance', 'manual_probe']) {
      expect(TELEMETRY).toContain(`'${c}'`);
    }
  });
});

describe('the three outcomes stay apart', () => {
  it('an external call is recorded as external', () => {
    expect(CLIENT).toContain("outcome: 'external', success: true");
  });

  it('a FAILED call is still external — it spent a request', () => {
    // Counting only successes understates the month in the direction that
    // hides a problem.
    expect(CLIENT).toContain("outcome: 'external', success: false");
  });

  it('a coalesced waiter is its own outcome, not a cache hit', () => {
    // Nothing was stored; two callers shared one journey. Collapsing them
    // makes the cache look more effective than it is.
    expect(CLIENT).toContain("outcome: 'coalesced'");
    expect(CACHE).toContain("outcome: 'cache_hit'");
  });

  it('only `external` counts against the allowance', () => {
    expect(TELEMETRY).toContain("cache_hit: record.outcome !== 'external'");
    expect(TELEMETRY).toContain("outcomeOf(r) === 'external'");
  });
});

describe('an untenanted call is still a call', () => {
  it('records rows with no shop rather than dropping them', () => {
    // `if (!record.shopId) return;` is exactly how QA calls vanished.
    expect(TELEMETRY).toContain('shop_id: record.shopId ?? null');
    expect(TELEMETRY).not.toMatch(/if \(!record\.shopId\) return;/);
  });

  it('the summary can report across every context', () => {
    expect(TELEMETRY).toMatch(/shopId: string \| null/);
    expect(TELEMETRY).toContain('if (shopId) q = q.eq');
  });
});

describe('sensitive material is never stored', () => {
  it('records a category, not a URL', () => {
    const insert = TELEMETRY.slice(TELEMETRY.indexOf('.insert({'), TELEMETRY.indexOf('} catch (err)'));
    for (const forbidden of ['url', 'query', 'oem', 'vin', 'authorization', 'apiKey', 'key']) {
      expect(insert.toLowerCase()).not.toContain(`${forbidden}:`);
    }
    expect(insert).toContain('endpoint_category');
  });

  it('records a status CLASS, not a body', () => {
    expect(CLIENT).toMatch(/statusClass: `\$\{Math\.floor\(res\.status \/ 100\)\}xx`/);
  });
});

describe('the quota figure never claims to be a balance', () => {
  it('says provider-side usage is authoritative', () => {
    expect(TELEMETRY).toContain('provider-side usage is authoritative');
  });

  it('exposes no remaining-calls figure', () => {
    // The word appears in prose explaining why we never present one — that is
    // the documentation working. What must not exist is a FIELD or a computed
    // balance a caller could render as authoritative.
    expect(TELEMETRY).not.toMatch(/\bremaining\s*[:=]/);
    expect(TELEMETRY).not.toMatch(/nominalAllowance\s*-\s*month/);
    expect(TELEMETRY).not.toMatch(/allowance\s*-\s*\w+External/);
  });

  it('crosses NORMAL / WARNING / CRITICAL at the documented points', () => {
    expect(quotaLevel(0, 100)).toBe('normal');
    expect(quotaLevel(69, 100)).toBe('normal');
    expect(quotaLevel(70, 100)).toBe('warning');
    expect(quotaLevel(89, 100)).toBe('warning');
    expect(quotaLevel(90, 100)).toBe('critical');
  });

  it('is configurable and defaults sensibly', () => {
    expect(NOMINAL_MONTHLY_ALLOWANCE).toBeGreaterThan(0);
    expect(TELEMETRY).toContain('AUTOPARTS_MONTHLY_ALLOWANCE');
    expect(TELEMETRY).toContain('AUTOPARTS_WARN_PCT');
  });
});

describe('no script can spend quota unaccounted, or in CI', () => {
  const SCRIPTS = readdirSync(join(process.cwd(), 'scripts'))
    .filter(f => /autoparts|parts2b/i.test(f) && f.endsWith('.ts'));

  it('finds the provider scripts', () => {
    expect(SCRIPTS.length).toBeGreaterThan(0);
  });

  it.each(['qa', 'manual_probe', 'migration', 'maintenance'])(
    'a script declaring %s is a recognised context', ctx => {
      expect(TELEMETRY).toContain(`'${ctx}'`);
    });

  it('every script that calls the provider declares a context', () => {
    const offenders: string[] = [];
    for (const f of SCRIPTS) {
      const src = read(join('scripts', f));
      if (!src.includes('autoPartsApiRequest') && !src.includes('listLanguages')) continue;
      if (!src.includes('callContext')) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('no script is wired into the test suite', () => {
    // A live provider call in CI is a quota that disappears by the 12th.
    const jestConfig = read('jest.config.ts');
    expect(jestConfig).not.toContain('scripts');
    expect(jestConfig).toContain("testMatch: ['**/__tests__/**/*.test.ts']");
  });
});
