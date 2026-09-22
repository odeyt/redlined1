/**
 * The browser request ledger for the production marketing capture.
 *
 * Every request a capture browser context makes is classified here BEFORE it
 * leaves the browser. The Playwright side (tests/marketing-capture/request-ledger.ts)
 * aborts anything not `allowed` and records one entry per request.
 *
 * ## What an entry holds
 *
 * Method, hostname and pathname. Nothing else: no query string, fragment, user
 * info, body, cookie, authorization or other header ever reaches an entry, so
 * none can reach the ledger file. Supabase puts filters, ids and the apikey in
 * the query string, which is exactly why it is dropped.
 *
 * ## Rules, in order
 *
 *   1. Sentry, by host or envelope path          blocked-sentry     fails the take
 *   2. Google Analytics / Tag Manager / DoubleClick blocked-analytics counted only
 *   3. Any host that is not first-party            blocked-third-party fails the take
 *   4. A mutating method not approved for the phase blocked-mutation  fails the take
 *   5. Everything else                             allowed
 *
 * Pure, so every rule is unit-tested.
 */

export type LedgerPhase = 'self-test' | 'prepare' | 'probe' | 'walkthrough';

export type LedgerVerdict =
  | 'allowed'
  | 'blocked-sentry'
  | 'blocked-analytics'
  | 'blocked-third-party'
  | 'blocked-mutation';

export interface LedgerEntry {
  phase: LedgerPhase;
  kind: 'http' | 'websocket';
  method: string;
  hostname: string;
  pathname: string;
  verdict: LedgerVerdict;
}

export const APP_HOST = 'www.redlined1.com';
/** The production Supabase project. A test ties it to tests/helpers/db-target.ts. */
export const SUPABASE_HOST = 'ldjrlvjkmzrcdqhetqoh.supabase.co';
export const FIRST_PARTY_HOSTS: readonly string[] = [APP_HOST, SUPABASE_HOST];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface ApprovedMutation { method: string; hostname: string; pathname: string }

const TOKEN_REFRESH: ApprovedMutation = { method: 'POST', hostname: SUPABASE_HOST, pathname: '/auth/v1/token' };

/**
 * The only mutating requests each phase may send, matched exactly.
 *
 *   job_cards PATCH             Edit → Save (technician) and Approve
 *   repair_orders PATCH         status changes and QA sign-off
 *   rpc/record_audit_event      the audit row each job-card update writes
 *   /api/labor-guide/seed       QA sign-off's labour-guide upsert, demo shop only
 *   /auth/v1/token              session refresh (and the prepare step's login)
 */
export const APPROVED_MUTATIONS: Readonly<Record<LedgerPhase, readonly ApprovedMutation[]>> = {
  'self-test': [],
  prepare: [TOKEN_REFRESH],
  probe: [TOKEN_REFRESH],
  walkthrough: [
    { method: 'PATCH', hostname: SUPABASE_HOST, pathname: '/rest/v1/job_cards' },
    { method: 'PATCH', hostname: SUPABASE_HOST, pathname: '/rest/v1/repair_orders' },
    { method: 'POST', hostname: SUPABASE_HOST, pathname: '/rest/v1/rpc/record_audit_event' },
    { method: 'POST', hostname: APP_HOST, pathname: '/api/labor-guide/seed' },
    TOKEN_REFRESH,
  ],
};

const hostIs = (h: string, domain: string) => h === domain || h.endsWith(`.${domain}`);

export function isSentry(hostname: string, pathname: string): boolean {
  return hostIs(hostname, 'sentry.io') || hostIs(hostname, 'sentry-cdn.com')
    || /^\/api\/\d+\/(envelope|store|security|minidump)\/?$/.test(pathname)
    // @sentry/nextjs's conventional tunnel route, should one ever be configured.
    || (FIRST_PARTY_HOSTS.includes(hostname) && /^\/monitoring\/?$/.test(pathname));
}

export function isAnalytics(hostname: string): boolean {
  return hostIs(hostname, 'google-analytics.com') || hostIs(hostname, 'googletagmanager.com')
    || hostname === 'analytics.google.com' || hostIs(hostname, 'doubleclick.net');
}

/**
 * Reduces a URL to what the ledger may keep. Unparseable URLs keep nothing but
 * a marker, and are blocked as third-party.
 */
export function redact(url: string): { hostname: string; pathname: string; protocol: string } {
  try {
    const u = new URL(url);
    return { hostname: u.hostname.toLowerCase(), pathname: u.pathname, protocol: u.protocol };
  } catch {
    return { hostname: '(unparseable)', pathname: '', protocol: '' };
  }
}

export function classifyRequest(phase: LedgerPhase, method: string, url: string, kind: 'http' | 'websocket' = 'http'): LedgerEntry {
  const m = method.toUpperCase();
  const { hostname, pathname, protocol } = redact(url);
  const entry = (verdict: LedgerVerdict): LedgerEntry => ({ phase, kind, method: m, hostname, pathname, verdict });

  if (isSentry(hostname, pathname)) return entry('blocked-sentry');
  if (isAnalytics(hostname)) return entry('blocked-analytics');
  const secure = kind === 'websocket' ? protocol === 'wss:' : protocol === 'https:';
  if (!secure || !FIRST_PARTY_HOSTS.includes(hostname)) return entry('blocked-third-party');
  if (kind === 'websocket') {
    // Supabase Realtime only. Messages on it are channel joins, not writes.
    return pathname === '/realtime/v1/websocket' && hostname === SUPABASE_HOST ? entry('allowed') : entry('blocked-third-party');
  }
  if (!SAFE_METHODS.has(m)) {
    const approved = APPROVED_MUTATIONS[phase].some(a => a.method === m && a.hostname === hostname && a.pathname === pathname);
    if (!approved) return entry('blocked-mutation');
  }
  return entry('allowed');
}

export interface LedgerSummary {
  total: number;
  allowed: number;
  analyticsBlocked: number;
  sentryAttempts: number;
  thirdPartyBlocked: number;
  mutationsBlocked: number;
}

export function summarize(entries: readonly LedgerEntry[], phases: readonly LedgerPhase[] = ['prepare', 'probe', 'walkthrough']): LedgerSummary {
  const e = entries.filter(x => phases.includes(x.phase));
  const n = (v: LedgerVerdict) => e.filter(x => x.verdict === v).length;
  return {
    total: e.length,
    allowed: n('allowed'),
    analyticsBlocked: n('blocked-analytics'),
    sentryAttempts: n('blocked-sentry'),
    thirdPartyBlocked: n('blocked-third-party'),
    mutationsBlocked: n('blocked-mutation'),
  };
}

/** Why the take fails, from the ledger alone. Analytics is counted, never a failure. */
export function ledgerFailures(entries: readonly LedgerEntry[]): string[] {
  const failures: string[] = [];
  for (const x of entries) {
    if (x.phase === 'self-test') continue;
    const at = `${x.method} ${x.hostname}${x.pathname} (${x.phase})`;
    if (x.verdict === 'blocked-sentry') failures.push(`Sentry report attempted: ${at}`);
    if (x.verdict === 'blocked-third-party') failures.push(`third-party request blocked: ${at}`);
    if (x.verdict === 'blocked-mutation') failures.push(`unapproved mutation aborted before leaving the browser: ${at}`);
  }
  return failures;
}

/**
 * Probes the self-test sends from a blank page in the capture's own context.
 * Every one must be aborted in the browser: none may reach the network. They
 * use no-cors simple requests, so no preflight is involved.
 */
export const SELF_TEST_PROBES: readonly { method: 'GET' | 'POST'; url: string; expect: LedgerVerdict }[] = [
  { method: 'GET', url: 'https://www.google-analytics.com/g/collect', expect: 'blocked-analytics' },
  { method: 'GET', url: 'https://www.googletagmanager.com/gtag/js', expect: 'blocked-analytics' },
  { method: 'POST', url: 'https://o1.ingest.sentry.io/api/1/envelope/', expect: 'blocked-sentry' },
  { method: 'POST', url: `https://${APP_HOST}/api/send-message`, expect: 'blocked-mutation' },
  { method: 'POST', url: `https://${SUPABASE_HOST}/rest/v1/sapelee_event_outbox`, expect: 'blocked-mutation' },
  { method: 'GET', url: 'https://example.com/', expect: 'blocked-third-party' },
];

export interface SelfTestOutcome { url: string; reachedNetwork: boolean }

/**
 * Judges the self-test: each probe produced exactly one ledger entry with its
 * expected verdict, no probe's fetch resolved, and nothing else was recorded.
 */
export function selfTestFailures(entries: readonly LedgerEntry[], outcomes: readonly SelfTestOutcome[]): string[] {
  const failures: string[] = [];
  const recorded = entries.filter(e => e.phase === 'self-test');
  if (outcomes.length !== SELF_TEST_PROBES.length) failures.push(`self-test ran ${outcomes.length} of ${SELF_TEST_PROBES.length} probes`);
  if (recorded.length !== SELF_TEST_PROBES.length) failures.push(`self-test recorded ${recorded.length} entries, expected ${SELF_TEST_PROBES.length}`);
  SELF_TEST_PROBES.forEach((p, i) => {
    const want = classifyRequest('self-test', p.method, p.url);
    if (want.verdict !== p.expect) failures.push(`self-test rule mismatch for ${want.hostname}${want.pathname}: rules say ${want.verdict}`);
    const got = recorded[i];
    if (!got || got.verdict !== p.expect || got.hostname !== want.hostname || got.pathname !== want.pathname || got.method !== p.method) {
      failures.push(`self-test probe ${i + 1} (${want.hostname}${want.pathname}) was not recorded as ${p.expect}`);
    }
    const o = outcomes[i];
    if (!o || o.reachedNetwork) failures.push(`self-test probe ${i + 1} (${want.hostname}${want.pathname}) was not aborted in the browser`);
  });
  return failures;
}
