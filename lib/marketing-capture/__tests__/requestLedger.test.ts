/**
 * The browser request ledger's rules, including what an entry may never hold.
 */
import { PRODUCTION_REF } from '../../../tests/helpers/db-target';
import {
  APPROVED_MUTATIONS, APP_HOST, FIRST_PARTY_HOSTS, SELF_TEST_PROBES, SUPABASE_HOST,
  classifyRequest, isAnalytics, isSentry, ledgerFailures, redact, selfTestFailures, summarize,
  type LedgerEntry, type LedgerPhase,
} from '../requestLedger';

const walkthrough = (method: string, url: string) => classifyRequest('walkthrough', method, url);
const verdict = (method: string, url: string) => walkthrough(method, url).verdict;

describe('what may leave the browser', () => {
  it('reads allowed to the app and its Supabase project', () => {
    expect(verdict('GET', `https://${APP_HOST}/`)).toBe('allowed');
    expect(verdict('GET', `https://${SUPABASE_HOST}/rest/v1/repair_orders?select=*&shop_id=eq.1`)).toBe('allowed');
    expect(verdict('HEAD', `https://${SUPABASE_HOST}/rest/v1/alert_events`)).toBe('allowed');
  });

  it.each(APPROVED_MUTATIONS.walkthrough.map(m => [`${m.method} ${m.hostname}${m.pathname}`, m]))('allows %s', (_label, m) => {
    expect(verdict(m.method, `https://${m.hostname}${m.pathname}?x=1`)).toBe('allowed');
  });

  it.each([
    ['POST', `https://${APP_HOST}/api/send-message`],
    ['POST', `https://${APP_HOST}/api/job-notify`],
    ['POST', `https://${APP_HOST}/api/push/subscribe`],
    ['POST', `https://${APP_HOST}/api/provision`],
    ['POST', `https://${APP_HOST}/api/billing/checkout`],
    ['POST', `https://${SUPABASE_HOST}/rest/v1/sapelee_event_outbox`],
    ['POST', `https://${SUPABASE_HOST}/rest/v1/invoices`],
    ['PATCH', `https://${SUPABASE_HOST}/rest/v1/invoices`],
    ['DELETE', `https://${SUPABASE_HOST}/rest/v1/alert_events`],
    ['POST', `https://${SUPABASE_HOST}/rest/v1/rpc/next_document_number`],
    ['POST', `https://${APP_HOST}/_vercel/insights/event`],
  ])('blocks the unapproved mutation %s %s', (method, url) => {
    expect(verdict(method, url)).toBe('blocked-mutation');
  });

  it('blocks Google Analytics and counts it rather than failing the take', () => {
    for (const host of ['www.googletagmanager.com', 'www.google-analytics.com', 'region1.google-analytics.com', 'analytics.google.com', 'stats.g.doubleclick.net']) {
      expect(isAnalytics(host)).toBe(true);
      expect(verdict('GET', `https://${host}/g/collect?v=2`)).toBe('blocked-analytics');
    }
    const entries = [classifyRequest('walkthrough', 'GET', 'https://www.google-analytics.com/g/collect')];
    expect(ledgerFailures(entries)).toEqual([]);
    expect(summarize(entries).analyticsBlocked).toBe(1);
  });

  it('blocks Sentry by host, by envelope path and by tunnel route, and fails the take', () => {
    expect(isSentry('o1.ingest.sentry.io', '/api/1/envelope/')).toBe(true);
    expect(isSentry('sentry.io', '/')).toBe(true);
    expect(isSentry('example.invalid', '/api/12/envelope/')).toBe(true);
    expect(isSentry(APP_HOST, '/monitoring')).toBe(true);
    expect(verdict('POST', `https://${APP_HOST}/monitoring`)).toBe('blocked-sentry');
    expect(ledgerFailures([classifyRequest('walkthrough', 'POST', 'https://o1.ingest.sentry.io/api/1/envelope/')]))
      .toEqual(['Sentry report attempted: POST o1.ingest.sentry.io/api/1/envelope/ (walkthrough)']);
  });

  it('blocks every other host, and anything not https', () => {
    expect(verdict('GET', 'https://example.com/')).toBe('blocked-third-party');
    expect(verdict('GET', 'https://fonts.googleapis.com/css')).toBe('blocked-third-party');
    expect(verdict('GET', 'http://www.redlined1.com/')).toBe('blocked-third-party');
    expect(verdict('GET', 'file:///etc/passwd')).toBe('blocked-third-party');
    expect(verdict('GET', 'not a url')).toBe('blocked-third-party');
  });

  it('allows only the Supabase realtime WebSocket', () => {
    expect(classifyRequest('walkthrough', 'WS', `wss://${SUPABASE_HOST}/realtime/v1/websocket?apikey=x`, 'websocket').verdict).toBe('allowed');
    expect(classifyRequest('walkthrough', 'WS', `wss://${SUPABASE_HOST}/other`, 'websocket').verdict).toBe('blocked-third-party');
    expect(classifyRequest('walkthrough', 'WS', 'wss://example.com/', 'websocket').verdict).toBe('blocked-third-party');
    expect(classifyRequest('walkthrough', 'WS', `ws://${SUPABASE_HOST}/realtime/v1/websocket`, 'websocket').verdict).toBe('blocked-third-party');
  });

  it('the sign-in mutation is allowed only in the phases that sign in', () => {
    const token = `https://${SUPABASE_HOST}/auth/v1/token?grant_type=password`;
    expect(classifyRequest('prepare', 'POST', token).verdict).toBe('allowed');
    expect(classifyRequest('walkthrough', 'PATCH', `https://${SUPABASE_HOST}/rest/v1/job_cards`).verdict).toBe('allowed');
    expect(classifyRequest('prepare', 'PATCH', `https://${SUPABASE_HOST}/rest/v1/job_cards`).verdict).toBe('blocked-mutation');
    expect(classifyRequest('self-test', 'POST', token).verdict).toBe('blocked-mutation');
  });

  it('names the production Supabase project the capture reads', () => {
    expect(SUPABASE_HOST).toBe(`${PRODUCTION_REF}.supabase.co`);
    expect(FIRST_PARTY_HOSTS).toEqual([APP_HOST, SUPABASE_HOST]);
  });
});

describe('what an entry may hold', () => {
  it('keeps method, hostname and pathname; never a query, fragment, credentials or port', () => {
    const entry = walkthrough('POST', 'https://user:pw@www.redlined1.com:443/api/labor-guide/seed?token=secret#frag');
    expect(Object.keys(entry).sort()).toEqual(['hostname', 'kind', 'method', 'pathname', 'phase', 'verdict']);
    const serialized = JSON.stringify(entry);
    for (const forbidden of ['secret', 'token', 'user', 'pw', 'frag', '?', '#']) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(entry).toMatchObject({ hostname: APP_HOST, pathname: '/api/labor-guide/seed', method: 'POST' });
  });

  it('redact keeps nothing from an unparseable URL', () => {
    expect(redact('::::')).toEqual({ hostname: '(unparseable)', pathname: '', protocol: '' });
  });

  it('summarize and ledgerFailures ignore the self-test phase', () => {
    const entries: LedgerEntry[] = [
      classifyRequest('self-test', 'POST', `https://${APP_HOST}/api/send-message`),
      classifyRequest('walkthrough', 'GET', `https://${APP_HOST}/`),
    ];
    expect(ledgerFailures(entries)).toEqual([]);
    expect(summarize(entries)).toMatchObject({ total: 1, allowed: 1, mutationsBlocked: 0 });
  });
});

describe('the self-test', () => {
  const probeEntries = (phase: LedgerPhase = 'self-test') => SELF_TEST_PROBES.map(p => classifyRequest(phase, p.method, p.url));
  const aborted = SELF_TEST_PROBES.map(p => ({ url: p.url, reachedNetwork: false }));

  it('passes when every probe was recorded with its expected verdict and none reached the network', () => {
    expect(selfTestFailures(probeEntries(), aborted)).toEqual([]);
  });

  it('covers analytics, Sentry, an app mutation, a Supabase mutation and a third party', () => {
    expect([...new Set(SELF_TEST_PROBES.map(p => p.expect))].sort())
      .toEqual(['blocked-analytics', 'blocked-mutation', 'blocked-sentry', 'blocked-third-party']);
  });

  it('fails when a probe reached the network', () => {
    const reached = aborted.map((o, i) => (i === 2 ? { ...o, reachedNetwork: true } : o));
    expect(selfTestFailures(probeEntries(), reached)).toEqual([expect.stringContaining('was not aborted in the browser')]);
  });

  it('fails when a probe was not recorded, or recorded with the wrong verdict', () => {
    expect(selfTestFailures(probeEntries().slice(1), aborted)).toEqual([
      expect.stringContaining('recorded 5 entries'),
      ...Array(6).fill(expect.stringContaining('was not recorded as')).slice(0, 6),
    ].slice(0, 7));
    const wrong = probeEntries();
    wrong[0] = { ...wrong[0], verdict: 'allowed' };
    expect(selfTestFailures(wrong, aborted)).toEqual([expect.stringContaining('was not recorded as blocked-analytics')]);
  });

  it('fails when the routes were never installed', () => {
    expect(selfTestFailures([], [])).toEqual([
      expect.stringContaining('self-test ran 0 of'),
      expect.stringContaining('recorded 0 entries'),
      ...SELF_TEST_PROBES.flatMap(() => [expect.stringContaining('was not recorded as'), expect.stringContaining('was not aborted')]),
    ]);
  });
});
