/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import { OwnerOverviewView } from '../overview/OwnerOverviewView';
import type { OwnerOverview, OverviewStatusCounts, ReconciliationResult, CommercialOverview } from '@/lib/admin/accountsData';
import { ACCOUNT_STATUS_LABELS } from '@/lib/admin/accountStatus';
import type { ActivationSummary } from '@/lib/admin/activationData';
import { PROFILE_NOT_DERIVABLE, type ProfileDiagnosticsSummary } from '@/lib/admin/profileDiagnostics';
import type { SupportSummary } from '@/lib/admin/supportTriage';
import { buildTodaysActions } from '@/lib/admin/todaysActions';
import {
  TRIAL_ACCESS_LABEL, TRIAL_ACCESS_EXPLANATION, TRIAL_COUNTS_MAY_DIFFER, TRIAL_EXPIRED_LABEL,
  PAID_NO_BILLING_RECORD_LABEL, RECONCILIATION_READ_ONLY_NOTE,
} from '@/lib/admin/terminology';

// Deterministic fixture data — no production identifiers, no live DB access.
// next/link renders as a plain <a> under jsdom, so href assertions work.
const counts = (o: Partial<OverviewStatusCounts> = {}): OverviewStatusCounts => ({
  free: 0, trialing: 0, activePaid: 0, cancelScheduled: 0, pastDue: 0, cancelledAccessRetained: 0,
  expired: 0, paidUnverified: 0, billingMismatch: 0, ...o,
});

const commercial: CommercialOverview = {
  reconciliation: 'unverified',
  subscriptions: { total: 1, active: 1, cancelScheduled: 0, trialing: 0, pastDue: 0, cancelled: 0, expired: 0, suspended: 0, byPlan: { solo: 1 }, internalShops: 0, unverified: 1, mismatch: 0 },
  revenue: { mrr: 24, arr: 288, arpa: 24, mrrByPlan: { solo: 24 }, revenueAtRisk: 0, pastDueRevenue: 0, pricedRecurringShops: 1, excluded: { unverified: 1, mismatch: 0, notProviderBacked: 0, unrecognisedInterval: 0, unpriced: 0 }, assumedMonthlyInterval: 1 },
  orphanSubscriptions: 0, unattributedBillingEvents: 0, truncated: false,
};

const activation: ActivationSummary = {
  available: true, reason: null, genuineShops: 9, activatedShops: 2, signedUpNotActivated: 6, activationUnknown: 1,
  activationRatePercent: 25,
  stages: { signed_up_only: 3, onboarding_started: 2, operational_data: 1, activated: 1, paid: 1, unknown: 1 },
  newShopsNeedingOnboarding: 2, partialOnboarding: 3, approachingFreeLimit: 1, returnedAfterFirstSession: 2, returnedKnown: 8,
  paidShops: 1, paidConversionPercent: 11.1, activatedNotPaid: 1, unavailableSources: [], truncated: false,
  notDerivable: ['first customer communication', 'upgrade page viewed', 'checkout started'],
};

const diagnostics: ProfileDiagnosticsSummary = {
  available: true, reason: null, profilesWithoutMembership: 2,
  byCause: { email_unverified: 1, provisioning_claim_without_shop: 0, claim_shop_without_membership: 0, no_auth_user: 0, verified_no_provisioning_evidence: 1, unknown: 0 },
  duplicateEmailProfiles: 0, notExamined: 0, notDerivable: PROFILE_NOT_DERIVABLE,
};

const support: SupportSummary = { openTickets: 3, overdueTickets: 1, oldestOpenTicketAgeDays: 6, unreviewedOpenTickets: 2, newLeads: 1, confirmedNoise: 4 };

const baseOverview: OwnerOverview = {
  totalShops: 15,
  activeExternalShops: 9,
  archivedExternalShops: 4,
  internalShops: 2,
  active: counts({ free: 5, trialing: 3, activePaid: 1 }),
  archived: counts({ free: 3, paidUnverified: 1 }),
  signupsToday: 1,
  signupsLast7Days: 3,
  signupsLast30Days: 6,
  trialEndingIn3Days: 1,
  trialEndingIn7Days: 3,
  billingReviewActive: 0,
  billingReviewArchived: 1,
  commercial,
  activation,
  profilesWithoutMembership: 2,
  truncated: false,
  maxScanRows: 2000,
  recentSignups: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      shopName: 'A Very Long Automotive Repair And Detailing Shop Name That Should Not Break Layout',
      shopArchived: false,
      createdAt: new Date().toISOString(),
      primaryContactEmail: 'somsak@example-test.com',
      primaryContactRole: 'Owner',
      ownerResolved: true,
      memberCount: 3,
      plan: 'professional',
      planDisplayName: 'Professional',
      status: 'trialing',
      trialExpired: false,
      trialEndsAt: new Date(Date.now() + 5 * 86400000).toISOString(),
      trialDaysLeft: 5,
      billingMismatch: false,
      policyNote: null,
      lastSignInAt: undefined,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      shopName: 'Second Shop',
      shopArchived: false,
      createdAt: new Date().toISOString(),
      primaryContactEmail: null,
      primaryContactRole: null,
      ownerResolved: false,
      memberCount: 0,
      plan: 'trial',
      planDisplayName: 'trial',
      status: 'free',
      trialExpired: true,
      trialEndsAt: null,
      trialDaysLeft: null,
      billingMismatch: false,
      policyNote: null,
      lastSignInAt: undefined,
    },
  ],
};

const emptyReconciliation: ReconciliationResult = {
  items: [], total: 0, page: 1, pageSize: 25, truncated: false, maxScanRows: 2000,
};

const reconciliation: ReconciliationResult = {
  items: [
    {
      accountRef: 'ref-0123456789', shopName: 'Reconcile Me Co', archived: true, entitlement: 'pro',
      profilePlan: 'pro', profileBillingStatus: 'inactive', subscriptionStatus: null, subscriptionPlanKey: null,
      hasSubscriptionReference: false, billingEventCount: 0, reasons: ['paid_no_billing_record'],
    },
  ],
  total: 1, page: 1, pageSize: 25, truncated: false, maxScanRows: 2000,
};

const view = (
  o: Partial<OwnerOverview> = {},
  r: ReconciliationResult = emptyReconciliation,
  d: ProfileDiagnosticsSummary | null = diagnostics,
  s: SupportSummary | null = support,
) => {
  const overview = { ...baseOverview, ...o };
  return render(<OwnerOverviewView overview={overview} reconciliation={r} diagnostics={d} today={buildTodaysActions({ overview, support: s, diagnostics: d })} />);
};

const tile = (id: string) => within(screen.getByTestId(id));

describe('OwnerOverviewView — shop counts', () => {
  it('shows active external, archived external and internal shops as separate figures', () => {
    view();
    expect(screen.getByText('Active external shops')).toBeTruthy();
    expect(screen.getByText('Archived external shops')).toBeTruthy();
    expect(screen.getByText('Internal shops')).toBeTruthy();
    expect(tile('kpi-active-external-shops').getByText('9')).toBeTruthy();
    expect(tile('kpi-archived-external-shops').getByText('4')).toBeTruthy();
    expect(tile('kpi-internal-shops').getByText('2')).toBeTruthy();
  });

  it('states plainly that the headline count excludes archived and internal shops', () => {
    view();
    expect(screen.getByTestId('kpi-active-external-shops').getAttribute('title')).toMatch(/excludes archived/i);
    expect(screen.getByTestId('kpi-active-external-shops').textContent).toMatch(/archived and internal shops are not included/i);
  });

  it('spells out how the directory total reconciles', () => {
    view();
    expect(screen.getByTestId('shop-reconciliation-line').textContent).toBe(
      '15 shops in the directory = 9 active external + 4 archived external + 2 internal',
    );
  });

  it('says that signup figures cover active external shops only', () => {
    view();
    expect(screen.getByText(/Signups today/)).toBeTruthy();
    expect(screen.getByTestId('signups-note').textContent).toMatch(/active external shops only/i);
  });

  it('does not use the misleading "Unlinked profiles" label', () => {
    view();
    expect(screen.queryByText('Unlinked profiles')).toBeNull();
  });
});

describe('OwnerOverviewView — profiles without shop membership', () => {
  it('shows the count, defined by missing shop_users membership rather than the legacy shop_id', () => {
    view();
    expect(screen.getByText('Profiles without shop membership')).toBeTruthy();
    expect(tile('kpi-profiles-without-membership').getByText('2')).toBeTruthy();
    expect(screen.getByTestId('kpi-profiles-without-membership').getAttribute('title')).toMatch(/shop_users/);
  });

  it('shows "Not available" and explains why, instead of an inaccurate number, when it cannot be computed safely', () => {
    view({ profilesWithoutMembership: null });
    expect(tile('kpi-profiles-without-membership').getByText('Not available')).toBeTruthy();
    expect(screen.getByTestId('kpi-profiles-without-membership').textContent).toMatch(/too many|scan limit/i);
  });
});

describe('OwnerOverviewView — status tiles', () => {
  it('shows the mutually exclusive statuses for active external shops, with the required labels', () => {
    view();
    for (const label of ['Free', TRIAL_ACCESS_LABEL, 'Active paid', ACCOUNT_STATUS_LABELS.cancel_scheduled, 'Past due', ACCOUNT_STATUS_LABELS.expired, ACCOUNT_STATUS_LABELS.paid_unverified, ACCOUNT_STATUS_LABELS.billing_mismatch]) {
      expect(within(screen.getByTestId('active-status-grid')).getByText(label)).toBeTruthy();
    }
    expect(within(screen.getByTestId('active-status-grid')).getByText(/^Cancelled/)).toBeTruthy();
    expect(tile('active-status-free').getByText('5')).toBeTruthy();
    expect(tile('active-status-trialing').getByText('3')).toBeTruthy();
    expect(tile('active-status-activePaid').getByText('1')).toBeTruthy();
  });

  it('adds up: the visible active tiles equal Active external shops', () => {
    view();
    const ids = ['free', 'trialing', 'activePaid', 'cancelScheduled', 'pastDue', 'cancelledAccessRetained', 'expired', 'paidUnverified', 'billingMismatch'];
    const total = ids.reduce((sum, id) => sum + Number(screen.getByTestId(`active-status-${id}`).getAttribute('data-count')), 0);
    expect(total).toBe(baseOverview.activeExternalShops);
    expect(screen.getByTestId('active-status-note').textContent).toMatch(/add up to Active external shops \(9\)/);
  });

  it('reports archived shops separately, by status, and says they are not in the active figures', () => {
    view();
    const archived = screen.getByTestId('archived-status-list');
    expect(archived.textContent).toMatch(/Archived external shops \(4\)/);
    expect(within(archived).getByTestId('archived-status-free').getAttribute('data-count')).toBe('3');
    expect(within(archived).getByTestId('archived-status-paidUnverified').getAttribute('data-count')).toBe('1');
    expect(archived.textContent).toMatch(/not included in the active figures/i);
  });

  it('links active tiles to the directory filtered to active shops', () => {
    view();
    const link = screen.getByTestId('active-status-free').closest('a');
    expect(link?.getAttribute('href')).toBe('/admin/accounts?status=free&archived=active');
  });

  it('shows the same verified MRR / ARR / ARPA as Billing Health, labelling ARR as run-rate', () => {
    view();
    const mrr = screen.getByTestId('verified-mrr');
    expect(mrr.textContent).toContain('$24.00');
    expect(mrr.textContent).toMatch(/ARR run-rate \(MRR × 12\): \$288\.00/);
    expect(mrr.textContent).toMatch(/1 verified subscription/);
    expect(mrr.closest('a')?.getAttribute('href')).toBe('/admin/billing-health');
  });

  it('shows the reconciliation indicator, and says unverified access is not revenue', () => {
    view();
    const el = screen.getByTestId('reconciliation-indicator');
    expect(el.textContent).toContain('Unverified');
    expect(el.textContent).toMatch(/not counted as revenue/i);
    view({ commercial: { ...commercial, reconciliation: 'reconciled' } });
    expect(screen.getAllByTestId('reconciliation-indicator').pop()!.textContent).toContain('Reconciled');
  });

  it('shows a mismatch as a mismatch and lists what was excluded from revenue', () => {
    view({ commercial: { ...commercial, reconciliation: 'mismatch', orphanSubscriptions: 2, revenue: { ...commercial.revenue, excluded: { unverified: 1, mismatch: 3, notProviderBacked: 0, unrecognisedInterval: 0, unpriced: 1 } } } });
    expect(screen.getByTestId('reconciliation-indicator').textContent).toContain('Mismatch');
    const note = screen.getByTestId('revenue-exclusions').textContent ?? '';
    expect(note).toMatch(/1 unverified/);
    expect(note).toMatch(/3 with contradictory billing records/);
    expect(note).toMatch(/1 on a plan with no known recurring price/);
    expect(note).toMatch(/2 billing records with no shop/);
  });

  it('lists subscriptions left out because their billing interval is unrecognised', () => {
    view({ commercial: { ...commercial, revenue: { ...commercial.revenue, excluded: { unverified: 0, mismatch: 0, notProviderBacked: 0, unrecognisedInterval: 2, unpriced: 0 } } } });
    expect(screen.getByTestId('revenue-exclusions').textContent).toMatch(/2 with an unrecognised billing interval/);
  });

  it('says nothing is excluded when nothing is', () => {
    view({ commercial: { ...commercial, revenue: { ...commercial.revenue, excluded: { unverified: 0, mismatch: 0, notProviderBacked: 0, unrecognisedInterval: 0, unpriced: 0 } } } });
    expect(screen.getByTestId('revenue-exclusions').textContent).toMatch(/No shops are excluded from revenue/);
  });

  it('never claims a cancelled-with-access-retained account is a synchronization defect', () => {
    view();
    expect(document.body.textContent).not.toMatch(/synchronization defect/i);
  });
});

describe('OwnerOverviewView — trial terminology', () => {
  it('labels the profile-based count "Trial access" and never the generic "Trialing" or "Trials"', () => {
    view();
    expect(screen.getAllByText(TRIAL_ACCESS_LABEL).length).toBeGreaterThanOrEqual(1);
    expect(within(screen.getByTestId('active-status-grid')).getByText(TRIAL_ACCESS_LABEL)).toBeTruthy();
    expect(screen.queryByText('Trialing')).toBeNull();
    expect(screen.queryByText('Trials')).toBeNull();
  });

  it('explains where the figure comes from and why it can differ from Billing Health', () => {
    view();
    const note = screen.getByTestId('trial-terminology-note').textContent ?? '';
    expect(note).toContain(TRIAL_ACCESS_EXPLANATION);
    expect(note).toContain(TRIAL_COUNTS_MAY_DIFFER);
    expect(within(screen.getByTestId('trial-terminology-note')).getByText('Billing Health').closest('a')?.getAttribute('href')).toBe('/admin/billing-health');
  });

  it('shows trials-ending figures as a subset of Trial access, not as separate statuses', () => {
    view();
    expect(screen.getByTestId('trial-timing').textContent).toMatch(/subset of Trial access/i);
  });
});

describe('OwnerOverviewView — expired trials', () => {
  it('shows "Trial expired" for a stored trial that has ended, while the effective status stays Free', () => {
    view();
    const row = screen.getByText('Second Shop').closest('tr')!;
    expect(within(row).getByText(TRIAL_EXPIRED_LABEL)).toBeTruthy();
    expect(within(row).getByText('Free')).toBeTruthy();
    expect(within(row).queryByText('Trial access')).toBeNull();
  });
});

describe('OwnerOverviewView — billing review (reconciliation)', () => {
  it('lists masked accounts with a plain-language reason, read-only', () => {
    view({}, reconciliation);
    const section = within(screen.getByTestId('billing-review'));
    expect(section.getByText('ref-0123456789')).toBeTruthy();
    expect(section.getByText('Reconcile Me Co')).toBeTruthy();
    expect(section.getByText(PAID_NO_BILLING_RECORD_LABEL)).toBeTruthy();
    expect(screen.getByTestId('billing-review').textContent).toContain(RECONCILIATION_READ_ONLY_NOTE);
    expect(screen.getByTestId('billing-review').textContent).toMatch(/showing 1 of 1/i);
  });

  it('never renders a full identifier, a provider reference or a form/button that could change data', () => {
    view({}, reconciliation);
    const el = screen.getByTestId('billing-review');
    expect(el.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(el.textContent).not.toMatch(/\bsub_|\bcus_/);
    expect(el.querySelector('form, button, input')).toBeNull();
  });

  it('shows an empty state when nothing needs review', () => {
    view();
    expect(within(screen.getByTestId('billing-review')).getByText(/Nothing needs reconciliation/i)).toBeTruthy();
  });

  it('states when the list is truncated to its bound', () => {
    view({}, { ...reconciliation, total: 60, pageSize: 25 });
    expect(screen.getByTestId('billing-review').textContent).toMatch(/showing 1 of 60/i);
  });
});

describe('OwnerOverviewView — activation', () => {
  it('shows the counts, the rate and the documented definition', () => {
    view();
    expect(tile('activation-genuine').getByText('9')).toBeTruthy();
    expect(tile('activation-activated').getByText('2')).toBeTruthy();
    expect(screen.getByTestId('activation-activated').textContent).toMatch(/25%/);
    expect(screen.getByTestId('activation-paid').textContent).toMatch(/11\.1%/);
    expect(screen.getByTestId('activation-definition').textContent).toMatch(/customer and a vehicle, and at least one repair order\/job or estimate/);
    expect(screen.getByTestId('activation-stage-signed_up_only').getAttribute('data-count')).toBe('3');
  });

  it('says what could not be classified and what is not tracked anywhere', () => {
    view();
    const note = screen.getByTestId('activation-definition').textContent ?? '';
    expect(note).toMatch(/1 shop could not be classified/);
    expect(note).toMatch(/checkout started/);
  });

  it('shows "not available" with no figures — not zeros — when activation could not be computed', () => {
    view({ activation: { ...activation, available: false, reason: 'boom', genuineShops: 0 } });
    expect(screen.getByTestId('activation-unavailable').textContent).toMatch(/not available/i);
    expect(screen.queryByTestId('activation-panel')).toBeNull();
  });
});

describe('OwnerOverviewView — unlinked-profile diagnostics', () => {
  it('shows counts by established cause, read-only, with what cannot be determined', () => {
    view();
    const el = screen.getByTestId('profile-diagnostics');
    expect(within(el).getByTestId('diagnostic-email_unverified').getAttribute('data-count')).toBe('1');
    expect(el.textContent).toMatch(/Read-only: nothing is linked, changed or removed/);
    expect(el.textContent).toMatch(/invited team member pending/);
    expect(el.querySelector('form, button, input')).toBeNull();
  });

  it('says so when diagnostics are unavailable', () => {
    view({}, emptyReconciliation, null);
    expect(screen.getByTestId('diagnostics-unavailable')).toBeTruthy();
  });
});

describe("OwnerOverviewView — Today's actions", () => {
  it('lists actions with counts and links to filtered views that exist', () => {
    view();
    const el = screen.getByTestId('todays-actions');
    expect(within(el).getByTestId('action-overdue-tickets').querySelector('a')?.getAttribute('href')).toBe('/admin/support?view=overdue');
    expect(within(el).getByTestId('action-overdue-tickets').getAttribute('data-count')).toBe('1');
    expect(within(el).getByTestId('action-activated-not-paid').getAttribute('data-count')).toBe('1');
  });

  it('shows billing exceptions when there are some, linked to the filtered directory', () => {
    view({ active: counts({ billingMismatch: 2, paidUnverified: 1 }) });
    const el = screen.getByTestId('todays-actions');
    expect(within(el).getByTestId('action-billing-mismatch').querySelector('a')?.getAttribute('href')).toBe('/admin/accounts?status=billing_mismatch&archived=active');
    expect(within(el).getByTestId('action-paid-unverified').querySelector('a')?.getAttribute('href')).toBe('/admin/accounts?status=paid_unverified&archived=active');
  });

  it('labels a link "Open" only when it lists exactly the counted records, and "wider list" otherwise', () => {
    view();
    const label = (id: string) => within(screen.getByTestId(id)).getByRole('link').textContent;
    expect(label('action-overdue-tickets')).toBe('Open →');
    expect(label('action-activated-not-paid')).toBe('Browse wider list →');
    expect(label('action-profiles-without-membership')).toMatch(/JSON/);
  });

  it('states that checkout-started is not derivable rather than approximating it', () => {
    view();
    expect(screen.getByTestId('todays-actions-not-derivable').textContent).toMatch(/Checkout started/);
  });

  it('flags an unreadable support queue instead of showing it as all clear', () => {
    view({}, emptyReconciliation, diagnostics, null);
    expect(screen.getByTestId('action-unavailable-support')).toBeTruthy();
    expect(screen.queryByTestId('todays-actions-clear')).toBeNull();
  });
});

describe('OwnerOverviewView — layout and states', () => {
  it('keeps tables inside a horizontally scrolling box so narrow screens do not overflow the page', () => {
    view({}, reconciliation);
    const tables = Array.from(document.querySelectorAll('table'));
    expect(tables.length).toBeGreaterThanOrEqual(2);
    for (const t of tables) {
      expect((t.parentElement as HTMLElement).style.overflowX).toBe('auto');
    }
  });

  it('renders a long shop name without throwing, and an unresolved-owner row without a contact', () => {
    view();
    expect(screen.getByText(/Very Long Automotive Repair/)).toBeTruthy();
    expect(screen.getByText('Unresolved')).toBeTruthy();
  });

  it('shows the truncation banner with the exact scan cap when truncated', () => {
    view({ truncated: true, maxScanRows: 2000 });
    expect(screen.getByText(/2000 most recently created shops/)).toBeTruthy();
  });

  it('shows the no-signups empty state', () => {
    view({ recentSignups: [] });
    expect(screen.getByText('No signups recorded yet.')).toBeTruthy();
  });
});
