import 'server-only';

/**
 * The one place Redlined1 talks to AutoPartsAPI.
 *
 * Every request in the codebase goes through `autoPartsApiRequest`. Header
 * construction, the base URL, the timeout, error classification and quota
 * protection live here and nowhere else — duplicating any of them is how one
 * call site quietly forgets the timeout, or sends the key to somewhere it
 * should not go.
 *
 * ## The key
 *
 * `AUTOPARTS_API_KEY`, read from the environment on the server, sent as
 * `x-apiprofile-key`. It is never logged, never returned, never placed in a
 * URL (a URL ends up in referrers, proxy logs and error messages), and there
 * is deliberately no `NEXT_PUBLIC_` variant — this module's `server-only`
 * import makes a client import a BUILD error rather than a runtime leak.
 *
 * ## The free tier is the real constraint
 *
 * The plan allows few calls per month, so an accidental request is not a
 * performance problem, it is a broken feature at month end. Two protections
 * are structural rather than advisory: reference data is cached for a day,
 * and identical in-flight requests are deduplicated so a double-click or two
 * components mounting at once cost one call, not two.
 */
import { logger } from '@/lib/logger';
import { recordUsage, type UsageContext } from './telemetry';
import { AutoPartsApiError, type AutoPartsLanguageRow, type AutoPartsLocale } from './types';

/**
 * Fixed, not an environment variable.
 *
 * The endpoint is a property of the provider, not of the deployment, and a
 * settable base URL is an SSRF lever: anything that can influence it can
 * point our authenticated, key-bearing request at a host of its choosing.
 * An override is honoured only for a host inside apiprofile.com, which keeps
 * a sandbox possible without opening that door.
 */
const DEFAULT_BASE_URL = 'https://auto-parts-catalog.apiprofile.com/api';

const ALLOWED_HOST_SUFFIX = '.apiprofile.com';

export function resolveBaseUrl(): string {
  const override = (process.env.AUTOPARTS_API_BASE_URL ?? '').trim();
  if (!override) return DEFAULT_BASE_URL;
  try {
    const u = new URL(override);
    if (u.protocol !== 'https:') throw new Error('not https');
    if (!u.hostname.endsWith(ALLOWED_HOST_SUFFIX)) throw new Error('host not allowed');
    return override.replace(/\/+$/, '');
  } catch {
    // A bad override falls back rather than failing the feature, and says so
    // once. Silently honouring it would be the dangerous choice.
    logger.warn('parts.autopartsapi.base_url_override_rejected', {});
    return DEFAULT_BASE_URL;
  }
}

const TIMEOUT_MS = Number(process.env.AUTOPARTS_API_TIMEOUT_MS ?? 8000);

export function hasCredentials(): boolean {
  return Boolean((process.env.AUTOPARTS_API_KEY ?? '').trim());
}

/** PRESENT / MISSING only. The value is never rendered anywhere. */
export function credentialStatus(): 'PRESENT' | 'MISSING' {
  return hasCredentials() ? 'PRESENT' : 'MISSING';
}

// ─── Path safety ─────────────────────────────────────────────────────────────

/**
 * A provider path we are willing to append to the base URL.
 *
 * A technician's search text must never be able to decide the upstream host.
 * Rather than sanitising a hostile path — which tends to produce a different
 * hostile path — anything with a scheme, an authority, a traversal segment or
 * a character outside the catalogue's own vocabulary is refused outright.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9._~-]+$/;

/**
 * Query parameters we are willing to send.
 *
 * Kept separate from the path deliberately. The path grammar refuses `?`
 * outright, so a caller cannot smuggle a query in through a path segment; a
 * query has to be declared as data and is then encoded by `URLSearchParams`,
 * which is the only thing that escapes it correctly.
 */
export type QueryParams = Record<string, string | number>;

const SAFE_PARAM_NAME = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;

export function buildProviderUrl(
  path: string,
  query?: QueryParams,
  baseUrl = resolveBaseUrl(),
): string {
  const raw = String(path ?? '').trim();

  if (!raw) throw new AutoPartsApiError('bad_request', undefined, 'empty path');
  if (raw.length > 512) throw new AutoPartsApiError('bad_request', undefined, 'path too long');
  // Scheme, protocol-relative, backslash, or an encoded traversal.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) throw new AutoPartsApiError('bad_request', undefined, 'scheme in path');
  if (raw.startsWith('//') || raw.includes('\\')) throw new AutoPartsApiError('bad_request', undefined, 'authority in path');
  if (raw.includes('..') || /%2e%2e/i.test(raw)) throw new AutoPartsApiError('bad_request', undefined, 'traversal in path');
  if (raw.includes('?') || raw.includes('#')) throw new AutoPartsApiError('bad_request', undefined, 'query in path');

  const segments = raw.replace(/^\/+/, '').split('/');
  for (const s of segments) {
    if (!SAFE_SEGMENT.test(s)) {
      throw new AutoPartsApiError('bad_request', undefined, 'illegal segment');
    }
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/${segments.join('/')}`;

  // Belt and braces: whatever the pieces were, the result must still be a
  // https URL on the allowed host.
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith(ALLOWED_HOST_SUFFIX)) {
    throw new AutoPartsApiError('bad_request', undefined, 'resolved host not allowed');
  }

  for (const [name, value] of Object.entries(query ?? {})) {
    if (!SAFE_PARAM_NAME.test(name)) {
      throw new AutoPartsApiError('bad_request', undefined, 'illegal query name');
    }
    const v = String(value);
    if (v.length > 200) throw new AutoPartsApiError('bad_request', undefined, 'query value too long');
    // set(), not string concatenation: this is what encodes a value correctly.
    parsed.searchParams.set(name, v);
  }

  // Re-checked AFTER the query is applied. A value cannot move the host, but
  // asserting it costs nothing and this is the function that must not be
  // wrong.
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith(ALLOWED_HOST_SUFFIX)) {
    throw new AutoPartsApiError('bad_request', undefined, 'resolved host not allowed');
  }
  return parsed.toString();
}

/** Numeric provider ids, made safe to place in a path segment. */
export function idSegment(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 9_999_999) {
    throw new AutoPartsApiError('bad_request', undefined, 'invalid id');
  }
  return String(value);
}

// ─── Request ─────────────────────────────────────────────────────────────────

/** Identical concurrent requests share one upstream call. Quota protection. */
const inFlight = new Map<string, Promise<unknown>>();

function classify(status: number): AutoPartsApiError {
  if (status === 401 || status === 403) return new AutoPartsApiError('unauthorized', status);
  if (status === 404) return new AutoPartsApiError('not_found', status);
  if (status === 429) return new AutoPartsApiError('rate_limited', status);
  if (status >= 500) return new AutoPartsApiError('provider_error', status);
  return new AutoPartsApiError('bad_request', status);
}

/**
 * `usage` is REQUIRED.
 *
 * It was optional, and the calls that omitted it disappeared from accounting
 * — including `oem_search`, the lookup every technician triggers. Ten real
 * requests were recorded as seven. Requiring it turns "remember to pass a
 * context" into "will not compile", which is the only version that stays true
 * as the codebase grows.
 */
export async function autoPartsApiRequest<T>(
  path: string,
  query: QueryParams | undefined,
  usage: UsageContext,
): Promise<T> {
  const key = (process.env.AUTOPARTS_API_KEY ?? '').trim();
  if (!key) throw new AutoPartsApiError('no_credentials');

  const url = buildProviderUrl(path, query);
  const startedAt = Date.now();

  /**
   * Coalescing, and why it is not just a performance trick.
   *
   * Two components mounting at once, or a double-clicked Search, would
   * otherwise spend two calls from a hundred-a-month allowance for one
   * answer. The in-flight entry is cleared in `finally`, so a rejection
   * cannot poison the key — the next caller retries rather than inheriting
   * an old failure forever.
   *
   * A coalesced caller is a cache hit: it consumed no upstream request, and
   * counting it as external would overstate the month.
   */
  const existing = inFlight.get(url);
  if (existing) {
    // A coalesced waiter, recorded as its own outcome. It spent nothing
    // upstream, but it is not a cache hit either — nothing was stored, two
    // callers shared one journey. Collapsing the two would make the cache
    // look more effective than it is.
    void recordUsage({ ...usage, outcome: 'coalesced', success: true });
    return existing as Promise<T>;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const run = (async () => {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-apiprofile-key': key,
        },
        signal: controller.signal,
        // Our own cache layer decides what is reused; Next must not add a
        // second one with different rules.
        cache: 'no-store',
      });

      if (!res.ok) {
        // Status only. A provider error body can echo the request, and the
        // request carried the key.
        logger.warn('parts.autopartsapi.http_error', { status: res.status, path });
        const err = classify(res.status);
        // A failed call still SPENT a request at the provider, so it is
        // recorded as external. Counting only successes would understate the
        // month in the direction that hides a problem.
        void recordUsage({
          ...usage, outcome: 'external', success: false, failureKind: err.kind,
          latencyMs: Date.now() - startedAt,
          statusClass: `${Math.floor(res.status / 100)}xx`,
        });
        throw err;
      }

      void recordUsage({
        ...usage, outcome: 'external', success: true,
        latencyMs: Date.now() - startedAt,
        statusClass: `${Math.floor(res.status / 100)}xx`,
      });

      const text = await res.text();
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new AutoPartsApiError('malformed', res.status, 'non-JSON body');
      }
    } catch (err) {
      if (err instanceof AutoPartsApiError) throw err;
      if (err instanceof Error && /abort/i.test(err.name + err.message)) {
        throw new AutoPartsApiError('timeout');
      }
      throw new AutoPartsApiError('provider_error', undefined, 'network');
    } finally {
      clearTimeout(timer);
      inFlight.delete(url);
    }
  })();

  inFlight.set(url, run);
  return run as Promise<T>;
}

// ─── Reference data ──────────────────────────────────────────────────────────

/**
 * Languages and other reference data change roughly never, and every call
 * spends quota, so they are held for a day. Nothing on the estimate screen
 * triggers this on render — it is fetched only when a catalogue search is
 * actually submitted.
 */
const REFERENCE_TTL_MS = Number(process.env.AUTOPARTS_REFERENCE_TTL_MS ?? 24 * 60 * 60_000);
let languageCache: { rows: AutoPartsLanguageRow[]; expiresAt: number } | null = null;

export function __resetAutoPartsCaches() {
  languageCache = null;
  inFlight.clear();
}

/** GET /languages/list — the documented reference endpoint. */
export async function listLanguages(
  now = Date.now(),
  usage: UsageContext = { category: 'reference', callContext: 'application' },
): Promise<AutoPartsLanguageRow[]> {
  if (languageCache && languageCache.expiresAt > now) {
    void recordUsage({ ...usage, outcome: 'cache_hit', success: true });
    return languageCache.rows;
  }

  const payload = await autoPartsApiRequest<unknown>('languages/list', undefined, usage);

  // The envelope is not documented to us, so several shapes are tolerated
  // rather than one being assumed.
  const rows: AutoPartsLanguageRow[] = Array.isArray(payload)
    ? payload as AutoPartsLanguageRow[]
    : Array.isArray((payload as { data?: unknown })?.data)
      ? (payload as { data: AutoPartsLanguageRow[] }).data
      : Array.isArray((payload as { items?: unknown })?.items)
        ? (payload as { items: AutoPartsLanguageRow[] }).items
        : [];

  if (!rows.length) throw new AutoPartsApiError('malformed', undefined, 'no language rows');

  languageCache = { rows, expiresAt: now + REFERENCE_TTL_MS };
  return rows;
}

function rowId(row: AutoPartsLanguageRow): number | null {
  // `lngId` arrives as a STRING ("4"). Coerced, because a NaN in a path reads
  // downstream as an authentication failure rather than as a parsing one.
  const raw = row.lngId ?? row.id ?? row.languageId ?? row.lang_id;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function rowLabel(row: AutoPartsLanguageRow): string {
  return String(
    row.lngDescription ?? row.name ?? row.language ?? row.title ?? '',
  ).toLowerCase();
}

function rowIso(row: AutoPartsLanguageRow): string {
  return String(row.lngIso2 ?? row.code ?? row.iso ?? '').toLowerCase();
}

/**
 * The catalogue locale Phase 1 uses.
 *
 * ENGLISH, resolved by name from the provider's own list rather than by
 * assuming the `lang-id/4` seen in a dashboard example. The shop is in Laos
 * and bilingual, but the catalogue is a source of part numbers and brand
 * names — English is the language those are published in, and Redlined1
 * already translates customer-facing description text separately.
 *
 * `countryFilterId` is left UNSET in Phase 1. The example showed
 * `country-filter-id/63` with no statement of what 63 is, and a country
 * filter silently narrows which parts exist. Filtering a catalogue by a
 * guessed country is worse than not filtering it.
 */
export const PHASE1_LANGUAGE_NAME = 'english';

export async function resolveLocale(
  usage: UsageContext = { category: 'reference', callContext: 'application' },
): Promise<AutoPartsLocale> {
  const rows = await listLanguages(Date.now(), usage);

  // The live catalogue names it "English (GB)", so an exact-equality check on
  // "english" finds nothing — startsWith and the ISO code both do.
  const match =
    rows.find(r => rowLabel(r) === PHASE1_LANGUAGE_NAME) ??
    rows.find(r => rowLabel(r).startsWith(PHASE1_LANGUAGE_NAME)) ??
    rows.find(r => ['en', 'eng'].includes(rowIso(r)));

  const id = match ? rowId(match) : null;
  if (id === null) {
    // Refused rather than defaulted. Picking the first row would give a
    // catalogue in an unknown language that looks like it worked.
    throw new AutoPartsApiError('malformed', undefined, 'english not present in language list');
  }
  return { languageId: id };
}
