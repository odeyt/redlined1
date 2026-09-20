import { buildTodaysActions, supportSummaryForToday } from '../todaysActions';
import { ACCOUNT_ARCHIVE_FILTERS, ACCOUNT_STATUS_FILTERS } from '../accountsData';
import { SUPPORT_VIEWS } from '../supportTriage';
import type { OwnerOverview } from '../accountsData';
import type { ActivationSummary } from '../activationData';
import type { SupportSummary } from '../supportTriage';
import { PROFILE_NOT_DERIVABLE, unavailableDiagnostics, type ProfileDiagnosticsSummary } from '../profileDiagnostics';

const zeroCounts = { free: 0, trialing: 0, activePaid: 0, cancelScheduled: 0, pastDue: 0, cancelledAccessRetained: 0, expired: 0, paidUnverified: 0, billingMismatch: 0 };

const activation = (o: Partial<ActivationSummary> = {}): ActivationSummary => ({
  available: true, reason: null, genuineShops: 0, activatedShops: 0, signedUpNotActivated: 0, activationUnknown: 0, activationRatePercent: null,
  stages: { signed_up_only: 0, onboarding_started: 0, operational_data: 0, activated: 0, paid: 0, unknown: 0 },
  newShopsNeedingOnboarding: 0, partialOnboarding: 0, approachingFreeLimit: 0, returnedAfterFirstSession: 0, returnedKnown: 0,
  paidShops: 0, paidConversionPercent: null, activatedNotPaid: 0, unavailableSources: [], truncated: false, notDerivable: [], ...o,
});

const overview = (active: Partial<typeof zeroCounts> = {}, act: Partial<ActivationSummary> = {}) =>
  ({ active: { ...zeroCounts, ...active }, activation: activation(act) }) as unknown as OwnerOverview;

const support = (o: Partial<SupportSummary> = {}): SupportSummary => ({
  openTickets: 0, overdueTickets: 0, oldestOpenTicketAgeDays: null, unreviewedOpenTickets: 0, newLeads: 0, confirmedNoise: 0, ...o,
});

const diag = (n: number): ProfileDiagnosticsSummary => ({
  available: true, reason: null, profilesWithoutMembership: n, duplicateEmailProfiles: 0, notExamined: 0, notDerivable: PROFILE_NOT_DERIVABLE,
  byCause: { email_unverified: 0, provisioning_claim_without_shop: 0, claim_shop_without_membership: 0, no_auth_user: 0, verified_no_provisioning_evidence: 0, unknown: 0 },
});

const ids = (r: ReturnType<typeof buildTodaysActions>) => r.actions.map(a => a.id);

// Found in review: the overview passed listSupportItems().summary straight through. When the ticket table could not be
// read, that summary is all zeros, so the panel said "Nothing needs attention right now" about a queue it never saw.
describe('supportSummaryForToday', () => {
  it('passes the summary through when the ticket source was read', () => {
    const s = support({ overdueTickets: 2 });
    expect(supportSummaryForToday({ sources: { supportTickets: 'available' }, summary: s })).toBe(s);
  });

  it('turns an unreadable ticket source into null, so the panel says "unavailable" and never "all clear"', () => {
    const zeros = support();
    const s = supportSummaryForToday({ sources: { supportTickets: 'unavailable' }, summary: zeros });
    expect(s).toBeNull();
    const r = buildTodaysActions({ overview: overview(), support: s, diagnostics: diag(0) });
    expect(r.allClear).toBe(false);
    expect(r.unavailable.map(u => u.id)).toContain('support');
    expect(r.actions).toEqual([]);
  });
});

describe('buildTodaysActions', () => {
  it('is all clear only when every source was readable and nothing needs doing', () => {
    const r = buildTodaysActions({ overview: overview(), support: support(), diagnostics: diag(0) });
    expect(r.actions).toEqual([]);
    expect(r.unavailable).toEqual([]);
    expect(r.allClear).toBe(true);
  });

  it('omits zero-count items and shows only what needs a human', () => {
    const r = buildTodaysActions({ overview: overview({ pastDue: 2 }), support: support(), diagnostics: diag(0) });
    expect(ids(r)).toEqual(['past-due']);
    expect(r.actions[0]).toMatchObject({ count: 2, href: '/admin/accounts?status=past_due&archived=active', urgent: true });
  });

  it('orders money/access and waiting customers ahead of growth items', () => {
    const r = buildTodaysActions({
      overview: overview({ billingMismatch: 1, pastDue: 1, paidUnverified: 1, cancelScheduled: 1 }, { newShopsNeedingOnboarding: 2, activatedNotPaid: 1, approachingFreeLimit: 1, partialOnboarding: 1 }),
      support: support({ overdueTickets: 1, unreviewedOpenTickets: 1, newLeads: 1, oldestOpenTicketAgeDays: 5 }),
      diagnostics: diag(3),
    });
    expect(ids(r)).toEqual([
      'billing-mismatch', 'overdue-tickets', 'past-due', 'paid-unverified', 'cancel-scheduled',
      'unreviewed-tickets', 'new-leads', 'approaching-free-limit', 'new-shops-onboarding', 'activated-not-paid',
      'partial-onboarding', 'profiles-without-membership',
    ]);
    expect(r.actions.find(a => a.id === 'overdue-tickets')?.detail).toMatch(/oldest open ticket: 5 days/);
  });

  it('marks an unreadable source as unavailable, never as all clear', () => {
    const r = buildTodaysActions({ overview: overview({}, { available: false, reason: 'x' }), support: null, diagnostics: unavailableDiagnostics('nope') });
    expect(r.unavailable.map(u => u.id).sort()).toEqual(['activation', 'profile-diagnostics', 'support']);
    expect(r.allClear).toBe(false);
  });

  it('flags shops that could not be classified instead of counting them as inactive', () => {
    const r = buildTodaysActions({ overview: overview({}, { activationUnknown: 2 }), support: support(), diagnostics: diag(0) });
    expect(r.unavailable.map(u => u.id)).toContain('activation-unknown');
  });

  it('says checkout-started is not derivable', () => {
    const r = buildTodaysActions({ overview: overview(), support: support(), diagnostics: diag(0) });
    expect(r.notDerivable.join(' ')).toMatch(/Checkout started/);
  });

  it('every link points at a page or API that exists in the owner portal', () => {
    const r = buildTodaysActions({
      overview: overview({ billingMismatch: 1, pastDue: 1, paidUnverified: 1, cancelScheduled: 1 }, { newShopsNeedingOnboarding: 1, activatedNotPaid: 1, approachingFreeLimit: 1, partialOnboarding: 1 }),
      support: support({ overdueTickets: 1, unreviewedOpenTickets: 1, newLeads: 1 }), diagnostics: diag(1),
    });
    for (const a of r.actions) expect(a.href).toMatch(/^\/(admin\/(accounts|support)|api\/admin\/profile-diagnostics)/);
  });

  it('only claims an exact link where a filter really reproduces the count, and says so where it does not', () => {
    const r = buildTodaysActions({
      overview: overview({ billingMismatch: 1, pastDue: 1, paidUnverified: 1, cancelScheduled: 1 }, { newShopsNeedingOnboarding: 1, activatedNotPaid: 1, approachingFreeLimit: 1, partialOnboarding: 1 }),
      support: support({ overdueTickets: 1, unreviewedOpenTickets: 1, newLeads: 1 }), diagnostics: diag(1),
    });
    const kind = (id: string) => r.actions.find(a => a.id === id)!.linkKind;
    for (const id of ['billing-mismatch', 'past-due', 'paid-unverified', 'cancel-scheduled', 'overdue-tickets']) expect(kind(id)).toBe('exact');
    for (const id of ['new-shops-onboarding', 'partial-onboarding', 'approaching-free-limit', 'activated-not-paid', 'unreviewed-tickets', 'new-leads']) {
      expect(kind(id)).toBe('broader');
      expect(r.actions.find(a => a.id === id)!.detail).toMatch(/No filter reproduces this set|lists (all|every)/);
    }
    expect(kind('profiles-without-membership')).toBe('api');
  });

  it('every exact link uses a directory or support filter that exists', () => {
    const r = buildTodaysActions({
      overview: overview({ billingMismatch: 1, pastDue: 1, paidUnverified: 1, cancelScheduled: 1 }), support: support({ overdueTickets: 1 }), diagnostics: diag(0),
    });
    for (const a of r.actions.filter(x => x.linkKind === 'exact')) {
      const url = new URL(a.href!, 'http://x');
      if (url.pathname === '/admin/accounts') {
        expect(ACCOUNT_STATUS_FILTERS).toContain(url.searchParams.get('status'));
        expect(ACCOUNT_ARCHIVE_FILTERS).toContain(url.searchParams.get('archived'));
      } else {
        expect(url.pathname).toBe('/admin/support');
        expect(SUPPORT_VIEWS).toContain(url.searchParams.get('view'));
      }
    }
  });

  it('never carries shop names, emails or identifiers', () => {
    const r = buildTodaysActions({ overview: overview({ pastDue: 1 }), support: support({ overdueTickets: 1 }), diagnostics: diag(1) });
    expect(JSON.stringify(r)).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
