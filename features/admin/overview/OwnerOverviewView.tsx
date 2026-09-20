/**
 * features/admin/overview/OwnerOverviewView.tsx
 * INTERNAL PLATFORM-OWNER ONLY. A plain Server Component — no 'use client',
 * no hooks. Authorization is enforced by app/admin/page.tsx
 * (requirePlatformOwnerPage) before this ever renders, and data is read
 * directly from lib/admin/accountsData.ts on the server, not fetched.
 *
 * Counting rules shown here (see OwnerOverview in lib/admin/accountsData.ts):
 * every shop is exactly one of active external, archived external or internal;
 * the status tiles partition the active external shops, and archived external
 * shops are listed separately with their own statuses.
 */
import Link from 'next/link';
import { C, fmtDate } from '@/features/admin/shared/theme';
import { AdminHeader } from '@/features/admin/shared/AdminHeader';
import type { OwnerOverview, OverviewStatusCounts, ReconciliationResult } from '@/lib/admin/accountsData';
import { ACCOUNT_STATUS_LABELS, type AccountStatus } from '@/lib/admin/accountStatus';
import { ACTIVATION_DEFINITION, ACTIVATION_STAGE_LABELS, ACTIVATION_STAGES, NEW_SHOP_WINDOW_DAYS } from '@/lib/admin/activationRules';
import { PROFILE_CAUSE_LABELS, PROFILE_CAUSES, type ProfileDiagnosticsSummary } from '@/lib/admin/profileDiagnostics';
import type { TodaysActions } from '@/lib/admin/todaysActions';
import {
  displayPlan, EXPIRED_TRIAL_NOTE, RECONCILIATION_READ_ONLY_NOTE, RECONCILIATION_REASON_LABELS,
  RECONCILIATION_STATE_EXPLANATIONS, RECONCILIATION_STATE_LABELS,
  TRIAL_ACCESS_EXPLANATION, TRIAL_ACCESS_LABEL, TRIAL_COUNTS_MAY_DIFFER,
} from '@/lib/admin/terminology';

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);

function excludedSummary(c: OwnerOverview['commercial']): string {
  const x = c.revenue.excluded;
  const parts = [
    x.unverified > 0 && `${x.unverified} unverified`,
    x.mismatch > 0 && `${x.mismatch} with contradictory billing records`,
    x.notProviderBacked > 0 && `${x.notProviderBacked} not provider-backed`,
    x.unrecognisedInterval > 0 && `${x.unrecognisedInterval} with an unrecognised billing interval`,
    x.unpriced > 0 && `${x.unpriced} on a plan with no known recurring price`,
    c.orphanSubscriptions ? `${c.orphanSubscriptions} billing record${c.orphanSubscriptions === 1 ? '' : 's'} with no shop` : false,
  ].filter(Boolean) as string[];
  const base = parts.length === 0 ? 'No shops are excluded from revenue.' : `Excluded from revenue: ${parts.join('; ')}.`;
  return `${base} Revenue counts only verified, provider-backed active subscriptions. These figures cover every non-internal shop with a billing record, archived shops included, so they can exceed the active-shop tiles above.`;
}

function KpiCard({
  label, value, sub, href, warn, tooltip, testId, count,
}: {
  label: string; value: string; sub?: string; href?: string; warn?: boolean; tooltip?: string;
  testId?: string; count?: number;
}) {
  const body = (
    <div title={tooltip} data-testid={testId} data-count={count} style={{
      background: C.card, border: `1px solid ${warn ? C.warning : C.border}`,
      borderRadius: 10, padding: '18px 20px', height: '100%',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: C.muted, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
  if (!href) return body;
  return <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{body}</Link>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

const GRID: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 };
const NOTE: React.CSSProperties = { fontSize: 12, color: C.muted, lineHeight: 1.5, margin: '12px 0 0' };

// The order the tiles are shown in; the keys and statuses line up with OverviewStatusCounts.
const STATUS_TILES: Array<{
  key: keyof OverviewStatusCounts; status: Exclude<AccountStatus, 'internal'>; filter: string; warn?: boolean; tooltip?: string;
}> = [
  { key: 'free', status: 'free', filter: 'free' },
  { key: 'trialing', status: 'trialing', filter: 'trialing', tooltip: TRIAL_ACCESS_EXPLANATION },
  { key: 'activePaid', status: 'active_paid', filter: 'active_paid', tooltip: 'Paid entitlement confirmed by an active subscription record.' },
  { key: 'cancelScheduled', status: 'cancel_scheduled', filter: 'cancel_scheduled', warn: true, tooltip: 'Still paying this period, but the subscription is set to cancel at period end. Counted in verified MRR and in revenue at risk.' },
  { key: 'pastDue', status: 'past_due', filter: 'past_due', warn: true },
  { key: 'cancelledAccessRetained', status: 'cancelled_access_retained', filter: 'cancelled_access_retained', tooltip: 'Documented product policy — the Creem webhook does not revoke access on cancellation. Not a defect.' },
  { key: 'expired', status: 'expired', filter: 'expired', tooltip: 'The subscription period ended and was not renewed; entitlement is Free.' },
  { key: 'paidUnverified', status: 'paid_unverified', filter: 'paid_unverified', warn: true, tooltip: 'A paid plan the billing record does not confirm — no subscription row, or one in a status the live billing webhook does not write. Not counted as revenue. The data does not say whether this is a customer, an internal login or something else.' },
  { key: 'billingMismatch', status: 'billing_mismatch', filter: 'billing_mismatch', warn: true, tooltip: 'Billing records contradict each other. Fails closed: excluded from revenue until reviewed.' },
];

const ENTITLEMENT_LABEL: Record<'free' | 'trial' | 'pro', string> = { free: 'Free', trial: TRIAL_ACCESS_LABEL, pro: 'Paid' };

function BillingReview({ data }: { data: ReconciliationResult }) {
  return (
    <div data-testid="billing-review">
      <p style={{ ...NOTE, margin: '0 0 12px' }}>{RECONCILIATION_READ_ONLY_NOTE}</p>
      {data.items.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 13 }}>Nothing needs reconciliation.</p>
      ) : (
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, textAlign: 'left', color: C.muted }}>
                <th style={{ padding: '8px 12px' }}>Account</th>
                <th style={{ padding: '8px 12px' }}>Shop</th>
                <th style={{ padding: '8px 12px' }}>Entitlement</th>
                <th style={{ padding: '8px 12px' }}>Profile plan</th>
                <th style={{ padding: '8px 12px' }}>Subscription</th>
                <th style={{ padding: '8px 12px' }}>Events</th>
                <th style={{ padding: '8px 12px' }}>Why it is listed</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(item => (
                <tr key={item.accountRef + item.shopName} style={{ borderBottom: `1px solid ${C.border}44` }}>
                  <td style={{ padding: '8px 12px', color: C.muted, whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{item.accountRef}</td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    <Link href={`/admin/accounts?search=${encodeURIComponent(item.shopName)}`} style={{ color: C.info, textDecoration: 'none' }}>{item.shopName}</Link>
                    {item.archived ? ' (archived)' : ''}
                  </td>
                  <td style={{ padding: '8px 12px' }}>{ENTITLEMENT_LABEL[item.entitlement]}</td>
                  <td style={{ padding: '8px 12px', color: C.muted }}>{item.profilePlan ?? '—'}</td>
                  <td style={{ padding: '8px 12px', color: C.muted }}>
                    {item.subscriptionStatus
                      ? `${item.subscriptionStatus}${item.subscriptionPlanKey ? ` · ${item.subscriptionPlanKey}` : ''}`
                      : 'No row'}
                  </td>
                  <td style={{ padding: '8px 12px', color: C.muted }}>{item.billingEventCount}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {item.reasons.map(r => (
                      <div key={r}>{RECONCILIATION_REASON_LABELS[r]}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={NOTE}>
        Showing {data.items.length} of {data.total} account{data.total === 1 ? '' : 's'} that need review
        {data.truncated ? ` (scan limited to ${data.maxScanRows} rows — the true total may be higher)` : ''}.
        {' '}This list also includes accounts that have billing events but no subscription row; the &ldquo;flagged for billing review&rdquo; count above does not.
        {data.total > data.pageSize ? ' The rest are available page by page from the read-only reconciliation API.' : ''}
      </p>
    </div>
  );
}

function TodaysActionsPanel({ today }: { today: TodaysActions }) {
  return (
    <div data-testid="todays-actions">
      {today.actions.length === 0 && today.unavailable.length === 0 ? (
        <p data-testid="todays-actions-clear" style={{ color: C.muted, fontSize: 13 }}>Nothing needs attention right now.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
          {today.actions.map(a => (
            <li key={a.id} data-testid={`action-${a.id}`} data-count={a.count} style={{ background: C.card, border: `1px solid ${a.urgent ? C.warning : C.border}`, borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14 }}>{a.count} — {a.label}</strong>
                {a.href && (
                  <Link href={a.href} style={{ color: C.info, textDecoration: 'none', fontSize: 13 }}>
                    {a.linkKind === 'exact' ? 'Open →' : a.linkKind === 'api' ? 'View JSON (read-only) →' : 'Browse wider list →'}
                  </Link>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{a.detail}</div>
            </li>
          ))}
          {today.unavailable.map(u => (
            <li key={u.id} data-testid={`action-unavailable-${u.id}`} style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: C.muted }}>
              <strong>{u.label}: not available.</strong> {u.reason}
            </li>
          ))}
        </ul>
      )}
      <p data-testid="todays-actions-not-derivable" style={NOTE}>Not shown because nothing records it: {today.notDerivable.join('; ')}.</p>
    </div>
  );
}

function ActivationPanel({ activation }: { activation: OwnerOverview['activation'] }) {
  if (!activation.available) {
    return (
      <p data-testid="activation-unavailable" style={{ color: C.muted, fontSize: 13 }}>
        Activation is not available: {activation.reason ?? 'the underlying records could not be read'}. No figures are shown rather than showing zeros.
      </p>
    );
  }
  const pct = (v: number | null) => (v === null ? 'n/a' : `${v}%`);
  return (
    <div data-testid="activation-panel">
      <div style={GRID}>
        <KpiCard testId="activation-genuine" label="Genuine shops" value={String(activation.genuineShops)} sub="Active, non-internal" />
        <KpiCard testId="activation-activated" label="Activated" value={String(activation.activatedShops)} sub={`Rate ${pct(activation.activationRatePercent)} of shops that can be decided`} tooltip={ACTIVATION_DEFINITION} />
        <KpiCard testId="activation-not-activated" label="Signed up, not activated" value={String(activation.signedUpNotActivated)} warn={activation.signedUpNotActivated > 0} />
        <KpiCard testId="activation-new" label={`New, not started (≤${NEW_SHOP_WINDOW_DAYS}d)`} value={String(activation.newShopsNeedingOnboarding)} />
        <KpiCard testId="activation-approaching-limit" label="Approaching Free limit" value={String(activation.approachingFreeLimit)} />
        <KpiCard testId="activation-paid" label="Paid conversion" value={pct(activation.paidConversionPercent)} sub={`${activation.paidShops} verified paid of ${activation.genuineShops}`} />
        <KpiCard testId="activation-returned" label="Returned after first session" value={`${activation.returnedAfterFirstSession} of ${activation.returnedKnown}`} sub="Where sign-in history is readable" />
      </div>
      <div data-testid="activation-stages" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
        {ACTIVATION_STAGES.map(st => (
          <span key={st} data-testid={`activation-stage-${st}`} data-count={activation.stages[st]} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
            {ACTIVATION_STAGE_LABELS[st]}: <strong>{activation.stages[st]}</strong>
          </span>
        ))}
      </div>
      <p data-testid="activation-definition" style={NOTE}>
        Activated means: {ACTIVATION_DEFINITION} Derived from existing records only.
        {activation.activationUnknown > 0 ? ` ${activation.activationUnknown} shop${activation.activationUnknown === 1 ? '' : 's'} could not be classified because some data was unreadable.` : ''}
        {activation.unavailableSources.length > 0 ? ` Unreadable sources: ${activation.unavailableSources.join(', ')}.` : ''}
        {activation.truncated ? ' Only the first shops were examined (limit reached).' : ''}
        {' '}Not tracked anywhere, so not reported: {activation.notDerivable.join('; ')}.
      </p>
    </div>
  );
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: ProfileDiagnosticsSummary | null }) {
  if (!diagnostics || !diagnostics.available) {
    return <p data-testid="diagnostics-unavailable" style={{ color: C.muted, fontSize: 13 }}>Diagnostics are not available{diagnostics?.reason ? `: ${diagnostics.reason}` : ''}.</p>;
  }
  return (
    <div data-testid="profile-diagnostics">
      <p style={{ ...NOTE, margin: '0 0 12px' }}>
        {diagnostics.profilesWithoutMembership} login{diagnostics.profilesWithoutMembership === 1 ? '' : 's'} with no shop membership, by what the records establish. Read-only: nothing is linked, changed or removed.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {PROFILE_CAUSES.map(c => (
          <span key={c} data-testid={`diagnostic-${c}`} data-count={diagnostics.byCause[c]} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 13, color: diagnostics.byCause[c] > 0 ? C.text : C.muted }}>
            {PROFILE_CAUSE_LABELS[c]}: <strong>{diagnostics.byCause[c]}</strong>
          </span>
        ))}
      </div>
      <p style={NOTE}>
        {diagnostics.duplicateEmailProfiles} of these share an email address with another profile (a fact, not a judgement).
        {diagnostics.notExamined > 0 ? ` ${diagnostics.notExamined} were not examined (per-request limit).` : ''}
        {' '}Cannot be determined from the data: {diagnostics.notDerivable.join('; ')}.
        {' '}Masked per-profile rows: <Link href="/api/admin/profile-diagnostics" style={{ color: C.info, textDecoration: 'none' }}>profile-diagnostics API</Link> (owner only).
      </p>
    </div>
  );
}

export function OwnerOverviewView({
  overview, reconciliation, today, diagnostics,
}: {
  overview: OwnerOverview; reconciliation: ReconciliationResult; today: TodaysActions; diagnostics: ProfileDiagnosticsSummary | null;
}) {
  const profilesKnown = overview.profilesWithoutMembership !== null;
  const commercial = overview.commercial;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <AdminHeader title="Owner Overview" active="/admin" />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {overview.truncated && (
          <div style={{ background: C.warning + '18', border: `1px solid ${C.warning}44`, borderRadius: 10, padding: '10px 16px', color: C.warning, fontSize: 13, marginBottom: 24 }}>
            ⚠ Only the {overview.maxScanRows} most recently created shops were scanned. Counts below may be incomplete if the platform has more shops than that.
          </div>
        )}

        <Section title="Today's actions">
          <TodaysActionsPanel today={today} />
        </Section>

        <Section title="Shops (not individual logins)">
          <div style={GRID}>
            <KpiCard
              testId="kpi-active-external-shops"
              label="Active external shops"
              value={String(overview.activeExternalShops)}
              sub="Archived and internal shops are not included"
              href="/admin/accounts?archived=active"
              tooltip="One row per non-archived customer shop. Excludes archived and internal shops. A shop with several staff members still counts once."
            />
            <KpiCard
              testId="kpi-archived-external-shops"
              label="Archived external shops"
              value={String(overview.archivedExternalShops)}
              sub="Shown separately; not in the active figures"
              href="/admin/accounts?archived=archived"
              tooltip="Customer shops that have been archived (tests, demos, closed accounts). Kept in the directory, never deleted, and not counted as active."
            />
            <KpiCard
              testId="kpi-internal-shops"
              label="Internal shops"
              value={String(overview.internalShops)}
              sub="Explicitly marked internal only"
              href="/admin/accounts?archived=internal"
              tooltip="Shops in the INTERNAL_SHOP_IDS list. Nothing else marks a shop internal — not an email, a name, a plan or a missing subscription."
            />
            <KpiCard label="Signups today" value={String(overview.signupsToday)} sub="Since 00:00 UTC, by shop creation date" />
            <KpiCard label="Last 7 days" value={String(overview.signupsLast7Days)} />
            <KpiCard label="Last 30 days" value={String(overview.signupsLast30Days)} />
            <KpiCard
              testId="kpi-profiles-without-membership"
              label="Profiles without shop membership"
              value={profilesKnown ? String(overview.profilesWithoutMembership) : 'Not available'}
              sub={profilesKnown ? undefined : 'Too many rows to count safely (scan limit reached)'}
              tooltip="Logins (profiles rows) that have no shop_users membership at all. Based on shop_users, not on the legacy profiles.shop_id pointer, so a login with a null shop_id but a real membership is not counted."
            />
          </div>
          <p data-testid="shop-reconciliation-line" style={NOTE}>
            {`${overview.totalShops} shops in the directory = ${overview.activeExternalShops} active external + ${overview.archivedExternalShops} archived external + ${overview.internalShops} internal`}
          </p>
          <p data-testid="signups-note" style={NOTE}>
            Signup figures and recent signups count active external shops only.
          </p>
        </Section>

        <Section title="Plan &amp; billing state — active external shops">
          <div data-testid="active-status-grid" style={GRID}>
            {STATUS_TILES.map(t => (
              <KpiCard
                key={t.key}
                testId={`active-status-${t.key}`}
                count={overview.active[t.key]}
                label={ACCOUNT_STATUS_LABELS[t.status]}
                value={String(overview.active[t.key])}
                href={`/admin/accounts?status=${t.filter}&archived=active`}
                warn={t.warn && overview.active[t.key] > 0}
                tooltip={t.tooltip}
              />
            ))}
</div>
          <p data-testid="active-status-note" style={NOTE}>
            These statuses are mutually exclusive and add up to Active external shops ({overview.activeExternalShops}).
            Archived shops are not included; internal shops are counted separately.
          </p>

          <div data-testid="trial-timing" style={{ marginTop: 20 }}>
            <p style={{ ...NOTE, margin: '0 0 8px' }}>Within {TRIAL_ACCESS_LABEL} — a subset of {TRIAL_ACCESS_LABEL}, not additional statuses:</p>
            <div style={GRID}>
              <KpiCard
                label={`${TRIAL_ACCESS_LABEL} ending ≤3 days`}
                value={String(overview.trialEndingIn3Days)}
                href="/admin/accounts?status=trial_ending_soon&archived=active"
                warn={overview.trialEndingIn3Days > 0}
              />
              <KpiCard
                label={`${TRIAL_ACCESS_LABEL} ending ≤7 days`}
                value={String(overview.trialEndingIn7Days)}
                href="/admin/accounts?status=trial_ending_soon&archived=active"
              />
            </div>
          </div>

          <p data-testid="trial-terminology-note" style={NOTE}>
            {TRIAL_ACCESS_EXPLANATION} {TRIAL_COUNTS_MAY_DIFFER}{' '}
            Billing-provider trial figures are on <Link href="/admin/billing-health" style={{ color: C.info, textDecoration: 'none' }}>Billing Health</Link>.
          </p>
        </Section>

        <Section title="Archived external shops by status">
          <div data-testid="archived-status-list">
            <p style={{ ...NOTE, margin: '0 0 12px' }}>
              {`Archived external shops (${overview.archivedExternalShops}) — not included in the active figures above.`}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {STATUS_TILES.map(t => (
                <span
                  key={t.key}
                  data-testid={`archived-status-${t.key}`}
                  data-count={overview.archived[t.key]}
                  style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 13, color: overview.archived[t.key] > 0 ? C.text : C.muted }}
                >
                  {ACCOUNT_STATUS_LABELS[t.status]}: <strong>{overview.archived[t.key]}</strong>
                </span>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Activation — active external shops">
          <ActivationPanel activation={overview.activation} />
        </Section>

        <Section title="Commercial reconciliation">
          <div style={GRID}>
            <KpiCard
              testId="reconciliation-indicator"
              label="Billing reconciliation"
              value={RECONCILIATION_STATE_LABELS[commercial.reconciliation]}
              sub={RECONCILIATION_STATE_EXPLANATIONS[commercial.reconciliation]}
              href="/admin/billing-health"
              warn={commercial.reconciliation !== 'reconciled'}
              tooltip="The same indicator is shown on Billing Health, computed from the same records."
            />
            <KpiCard
              testId="verified-mrr"
              label="Verified MRR"
              value={usd(commercial.revenue.mrr)}
              sub={`ARR run-rate (MRR × 12): ${usd(commercial.revenue.arr)} · ARPA ${usd(commercial.revenue.arpa)} · ${commercial.revenue.pricedRecurringShops} verified subscription${commercial.revenue.pricedRecurringShops === 1 ? '' : 's'}`}
              href="/admin/billing-health"
              tooltip="Only confirmed, provider-backed active recurring subscriptions count. Identical to the figure on Billing Health."
            />
            <KpiCard
              label="Shops flagged for billing review"
              value={String(overview.billingReviewActive)}
              sub={overview.billingReviewArchived > 0 ? `${overview.billingReviewArchived} more in archived shops` : 'Active external shops'}
              warn={overview.billingReviewActive > 0}
              tooltip="Active shops whose billing records contradict each other, or whose paid access is unverified. The Billing review list below shows these and also accounts that have billing events but no subscription row."
            />
          </div>
          <p data-testid="revenue-exclusions" style={NOTE}>
            {excludedSummary(commercial)}
          </p>
        </Section>

        <Section title="Billing review (read-only)">
          <BillingReview data={reconciliation} />
        </Section>

        <Section title="Logins without a shop membership (read-only diagnosis)">
          <DiagnosticsPanel diagnostics={diagnostics} />
        </Section>

        <Section title="Recent signups (active external shops)">
          {overview.recentSignups.length === 0 ? (
            <p style={{ color: C.muted, fontSize: 13 }}>No signups recorded yet.</p>
          ) : (
            // minWidth forces horizontal scroll within this box on a narrow
            // viewport, rather than every cell wrapping into an unreadable stack.
            <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
              <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}`, textAlign: 'left', color: C.muted }}>
                    <th style={{ padding: '8px 12px' }}>Shop</th>
                    <th style={{ padding: '8px 12px' }}>Primary contact</th>
                    <th style={{ padding: '8px 12px' }}>Plan</th>
                    <th style={{ padding: '8px 12px' }}>Status</th>
                    <th style={{ padding: '8px 12px' }}>Signed up</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recentSignups.map(a => (
                    <tr key={a.id} style={{ borderBottom: `1px solid ${C.border}44` }}>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        <Link href={`/admin/accounts/${a.id}`} style={{ color: C.info, textDecoration: 'none' }}>{a.shopName}</Link>
                      </td>
                      <td style={{ padding: '8px 12px', color: C.muted }}>{a.primaryContactEmail ?? (a.ownerResolved ? '—' : 'Unresolved')}</td>
                      <td style={{ padding: '8px 12px' }}>
                        {a.trialExpired
                          ? <span title={EXPIRED_TRIAL_NOTE} style={{ color: C.muted }}>{displayPlan(a)}</span>
                          : displayPlan(a)}
                      </td>
                      <td style={{ padding: '8px 12px' }}>{ACCOUNT_STATUS_LABELS[a.status]}</td>
                      <td style={{ padding: '8px 12px', color: C.muted }}>{fmtDate(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
