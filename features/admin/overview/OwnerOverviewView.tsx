/**
 * features/admin/overview/OwnerOverviewView.tsx
 * INTERNAL PLATFORM-OWNER ONLY. A plain Server Component — no 'use client',
 * no hooks. Authorization is enforced by app/admin/page.tsx
 * (requirePlatformOwnerPage) before this ever renders, and data is read
 * directly from lib/admin/accountsData.ts on the server, not fetched.
 */
import Link from 'next/link';
import { C, fmtDate } from '@/features/admin/shared/theme';
import { AdminHeader } from '@/features/admin/shared/AdminHeader';
import type { OwnerOverview } from '@/lib/admin/accountsData';
import { ACCOUNT_STATUS_LABELS } from '@/lib/admin/accountStatus';

function KpiCard({
  label, value, sub, href, warn, tooltip,
}: { label: string; value: string; sub?: string; href?: string; warn?: boolean; tooltip?: string }) {
  const body = (
    <div title={tooltip} style={{
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

export function OwnerOverviewView({ overview }: { overview: OwnerOverview }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <AdminHeader title="Owner Overview" active="/admin" />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        {overview.truncated && (
          <div style={{ background: C.warning + '18', border: `1px solid ${C.warning}44`, borderRadius: 10, padding: '10px 16px', color: C.warning, fontSize: 13, marginBottom: 24 }}>
            ⚠ Only the {overview.maxScanRows} most recently created shops were scanned. Counts below may be incomplete if the platform has more shops than that.
          </div>
        )}

        <Section title="Signups (shops, not individual logins)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <KpiCard label="Total shops" value={String(overview.totalSignups)} href="/admin/accounts" tooltip="One row per shop/tenant, excluding the two internal D1 shops. A shop with several staff members still counts once." />
            <KpiCard label="Signups today" value={String(overview.signupsToday)} sub="Since 00:00 UTC, by shop creation date" />
            <KpiCard label="Last 7 days" value={String(overview.signupsLast7Days)} />
            <KpiCard label="Last 30 days" value={String(overview.signupsLast30Days)} />
            <KpiCard
              label="Unlinked profiles"
              value={String(overview.unlinkedProfiles)}
              tooltip="Auth accounts (profiles rows) with no shop_id — not counted as shop signups above. A real, separate data gap, not folded into the total."
            />
          </div>
        </Section>

        <Section title="Plan &amp; billing state">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <KpiCard label={ACCOUNT_STATUS_LABELS.free} value={String(overview.free)} href="/admin/accounts?status=free" />
            <KpiCard label={ACCOUNT_STATUS_LABELS.trialing} value={String(overview.trialing)} href="/admin/accounts?status=trialing" />
            <KpiCard
              label="Trials ending ≤3 days"
              value={String(overview.trialEndingIn3Days)}
              href="/admin/accounts?status=trial_ending_soon"
              warn={overview.trialEndingIn3Days > 0}
            />
            <KpiCard
              label="Trials ending ≤7 days"
              value={String(overview.trialEndingIn7Days)}
              href="/admin/accounts?status=trial_ending_soon"
            />
            <KpiCard label={ACCOUNT_STATUS_LABELS.active_paid} value={String(overview.activePaid)} href="/admin/accounts?status=active_paid" />
            <KpiCard
              label={ACCOUNT_STATUS_LABELS.past_due}
              value={String(overview.pastDue)}
              href="/admin/accounts?status=past_due"
              warn={overview.pastDue > 0}
            />
            <KpiCard
              label={ACCOUNT_STATUS_LABELS.cancelled_access_retained}
              value={String(overview.cancelledAccessRetained)}
              href="/admin/accounts?status=cancelled_access_retained"
              tooltip="Documented product policy — the Creem webhook does not revoke access on cancellation. Not a defect."
            />
            <KpiCard
              label={ACCOUNT_STATUS_LABELS.paid_billing_unverified}
              value={String(overview.paidBillingUnverified)}
              href="/admin/accounts?status=paid_billing_unverified"
              warn={overview.paidBillingUnverified > 0}
            />
            <KpiCard
              label="Monthly recurring revenue"
              value="See Billing Health →"
              href="/admin/billing-health"
              tooltip="MRR is computed and caveated on the Billing Health dashboard — shown there rather than recomputed here, to avoid two dashboards disagreeing on the same number."
            />
          </div>
        </Section>

        <Section title="Needs attention">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <KpiCard
              label="Billing mismatches"
              value={String(overview.billingMismatches)}
              href="/admin/accounts?status=billing_mismatch"
              warn={overview.billingMismatches > 0}
              tooltip="Reserved for genuine contradictions — e.g. shop_subscriptions and profiles.billing_status disagree, or a paid plan has no billing record at all. Does not include cancelled-but-access-retained, which is documented policy."
            />
            <KpiCard label="Internal D1 accounts" value={String(overview.internal)} tooltip="The two D1 Imports shops — excluded from signup/billing counts above." />
          </div>
        </Section>

        <Section title="Recent signups">
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
                      <td style={{ padding: '8px 12px', color: C.muted }}>{a.primaryContactName ?? (a.ownerResolved ? '—' : 'Unresolved')}</td>
                      <td style={{ padding: '8px 12px' }}>{a.planDisplayName ?? '—'}</td>
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
