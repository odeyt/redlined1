/**
 * features/admin/accounts/AccountDetailView.tsx
 * INTERNAL PLATFORM-OWNER ONLY. A plain Server Component — no 'use client',
 * no hooks, no client-side fetch. Authorization is enforced server-side by
 * app/admin/accounts/[id]/page.tsx before this ever renders, and the data
 * it displays was read directly from lib/admin/accountsData.ts on the
 * server, not fetched from an API route.
 *
 * Read-only. No extend-trial, refund, cancel, edit, or impersonation
 * actions — this view is a mirror of account state, not a control panel.
 */
import Link from 'next/link';
import { C, fmtDate, fmtDateTime } from '@/features/admin/shared/theme';
import { AdminHeader } from '@/features/admin/shared/AdminHeader';
import type { AccountDetail } from '@/lib/admin/accountsData';
import { ACCOUNT_STATUS_LABELS, UNVERIFIED_REASON_LABELS, isLoginInactive, LOGIN_INACTIVITY_THRESHOLD_DAYS } from '@/lib/admin/accountStatus';
import { displayPlan, EXPIRED_TRIAL_NOTE } from '@/lib/admin/terminology';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12, paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.text }}>{value}</div>
    </div>
  );
}

export function AccountDetailView({ account }: { account: AccountDetail }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <AdminHeader title="Account Detail" active="/admin/accounts" />

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
        <Link href="/admin/accounts" style={{ color: C.info, fontSize: 13, textDecoration: 'none', display: 'inline-block', marginBottom: 20 }}>← Back to Accounts</Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{account.shop.name ?? '(unnamed shop)'}</h1>
            <div style={{ color: C.muted, fontSize: 13 }}>
              {account.primaryContact
                ? (account.primaryContact.email ?? 'no email on file')
                : 'No primary contact resolved'}
            </div>
          </div>
          <span style={{
            fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 99,
            background: C.info + '22', color: C.info,
          }}>
            {ACCOUNT_STATUS_LABELS[account.status.status]}
          </span>
        </div>

        {account.status.policyNote && (
          <div style={{ background: C.info + '18', border: `1px solid ${C.info}44`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.info, marginBottom: 6, textTransform: 'uppercase' }}>Current product policy — not a defect</div>
            <p style={{ margin: 0, fontSize: 13, color: C.text }}>{account.status.policyNote}</p>
          </div>
        )}

        {account.status.billingMismatch && account.status.mismatchReason && (
          <div style={{ background: C.warning + '18', border: `1px solid ${C.warning}44`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.warning, marginBottom: 6, textTransform: 'uppercase' }}>
              {account.status.unverifiedReason ? UNVERIFIED_REASON_LABELS[account.status.unverifiedReason] : 'Billing mismatch'}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: C.text }}>{account.status.mismatchReason}</p>
          </div>
        )}

        {account.dataQualityWarnings.length > 0 && (
          <div style={{ background: C.warning + '18', border: `1px solid ${C.warning}44`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.warning, marginBottom: 6, textTransform: 'uppercase' }}>Data quality warnings</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: C.text, fontSize: 13 }}>
              {account.dataQualityWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        <Section title="Shop">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 4 }}>
            <Field label="Signed up (shop created)" value={fmtDate(account.shop.createdAt)} />
            <Field label="Archived" value={account.shop.archivedAt ? fmtDate(account.shop.archivedAt) : 'No'} />
            <Field label="Members" value={String(account.members.length)} />
          </div>
        </Section>

        <Section title="Primary contact">
          {account.primaryContact ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 4 }}>
              <Field label="Email" value={account.primaryContact.email ?? '—'} />
              <Field label="Job title (profiles.role)" value={account.primaryContact.role ?? '—'} />
              <Field
                label="Last login"
                value={
                  account.primaryContact.lastSignInAt
                    ? (
                      <>
                        {fmtDateTime(account.primaryContact.lastSignInAt)}
                        {isLoginInactive(account.primaryContact.lastSignInAt) && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: C.muted }}>
                            (no login in {LOGIN_INACTIVITY_THRESHOLD_DAYS}+ days — login recency only, not a measure of feature or product use)
                          </span>
                        )}
                      </>
                    )
                    : 'Never'
                }
              />
              {!account.ownerResolved && (
                <p style={{ gridColumn: '1 / -1', fontSize: 12, color: C.warning, margin: '4px 0 0' }}>
                  No shop_users role=owner membership was found for this shop — shown is a linked profile, used as a fallback. It is not a confirmed owner.
                </p>
              )}
            </div>
          ) : (
            <p style={{ color: C.muted, fontSize: 13 }}>No profile could be associated with this shop.</p>
          )}

          {account.primaryContactOtherShops.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', marginBottom: 6 }}>Also belongs to</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {account.primaryContactOtherShops.map(s => (
                  <li key={s.shopId}>
                    <Link href={`/admin/accounts/${s.shopId}`} style={{ color: C.info, textDecoration: 'none' }}>{s.shopName ?? s.shopId}</Link>
                    {' — '}{s.role}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="Members">
          {account.members.length === 0 ? (
            <p style={{ color: C.muted, fontSize: 13 }}>No shop_users rows for this shop.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {account.members.map(m => (
                <li key={m.profileId}>
                  {m.email ?? 'no email'} — {m.role}
                  {m.isPrimaryContact && <strong> (primary contact)</strong>}
                </li>
              ))}
            </ul>
          )}
          {account.mirroredShopIds.length > 0 && (
            <p style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Mirrors {account.mirroredShopIds.length} other shop(s) via shop_mirrors.</p>
          )}
        </Section>

        <Section title="Plan &amp; subscription">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 4 }}>
            <Field label="Plan" value={displayPlan({ trialExpired: account.plan.trialExpired, planDisplayName: account.plan.displayName })} />
            <Field label="Trial ends" value={account.plan.trialEndsAt ? `${fmtDate(account.plan.trialEndsAt)}${account.status.trialDaysLeft !== null ? ` (${account.status.trialDaysLeft}d left)` : ''}` : '—'} />
            <Field label="profiles.billing_status" value={account.primaryContact?.billingStatus ?? '—'} />
          </div>
          {account.plan.trialExpired && (
            <p data-testid="expired-trial-note" style={{ fontSize: 12, color: C.muted, margin: '8px 0 0' }}>{EXPIRED_TRIAL_NOTE}</p>
          )}

          {account.subscription ? (
            <div style={{ marginTop: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 4 }}>
                <Field label="Subscription status" value={account.subscription.status} />
                <Field label="Billing provider" value={account.subscription.billingProvider ?? '—'} />
                <Field label="Provider customer" value={account.subscription.hasCustomerReference ? 'Linked' : 'Not linked'} />
                <Field label="Provider subscription" value={account.subscription.hasSubscriptionReference ? 'Linked' : 'Not linked'} />
                <Field label="Current period" value={`${fmtDate(account.subscription.currentPeriodStart)} → ${fmtDate(account.subscription.currentPeriodEnd)}`} />
                <Field label="Cancel at period end" value={account.subscription.cancelAtPeriodEnd ? 'Yes' : 'No'} />
                {account.subscription.cancelledAt && <Field label="Cancelled at" value={fmtDate(account.subscription.cancelledAt)} />}
                {account.subscription.pastDueAt && <Field label="Past due since" value={fmtDate(account.subscription.pastDueAt)} />}
              </div>
              {account.subscription.billingProvider === 'manual' && (
                <p style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>
                  Complimentary status: Not tracked. A &ldquo;manual&rdquo; billing provider is not proof that access is complimentary — there is no dedicated field for that in the schema.
                </p>
              )}
            </div>
          ) : (
            <p style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>No shop_subscriptions record for this shop.</p>
          )}
        </Section>

        <Section title="Billing event timeline">
          {account.billingEvents.length === 0 ? (
            <p style={{ color: C.muted, fontSize: 13 }}>No billing events recorded.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}`, textAlign: 'left', color: C.muted }}>
                    <th style={{ padding: '6px 10px' }}>Event</th>
                    <th style={{ padding: '6px 10px' }}>Processed</th>
                    <th style={{ padding: '6px 10px' }}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {account.billingEvents.map(e => (
                    <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}44` }}>
                      <td style={{ padding: '6px 10px' }}>{e.eventType}</td>
                      <td style={{ padding: '6px 10px', color: e.failed ? C.danger : (e.processed ? C.success : C.muted) }}>
                        {e.failed ? 'Failed' : e.processed ? 'Processed' : 'Pending'}
                      </td>
                      <td style={{ padding: '6px 10px', color: C.muted }}>{fmtDateTime(e.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Raw webhook payloads are never shown here.</p>
        </Section>

        <Section title="Usage this billing period">
          {account.usage ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
              {Object.entries(account.usage).map(([key, value]) => (
                <div key={key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase' }}>{key.replace(/_/g, ' ')}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: C.muted, fontSize: 13 }}>Usage data unavailable.</p>
          )}
        </Section>

        <Section title="Support &amp; issues">
          {account.supportTickets.length === 0 ? (
            <p style={{ color: C.muted, fontSize: 13 }}>No support tickets for this shop.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {account.supportTickets.map(t => (
                <li key={t.id} style={{ marginBottom: 4 }}>
                  <Link href="/admin/support" style={{ color: C.info, textDecoration: 'none' }}>{t.subject ?? t.kind}</Link>
                  {' — '}<span style={{ color: C.muted }}>{t.status}{t.severity ? ` · ${t.severity}` : ''} · {fmtDate(t.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Signup attribution">
          <p style={{ color: C.muted, fontSize: 13 }}>
            Signup attribution not configured. No table in this application records what marketing source led to a
            signup — shop_audit_leads is a separate, anonymous, pre-signup lead-capture form (see Support &amp; Issues),
            not a signup event tracker, and applying its migration would not add signup attribution.
          </p>
        </Section>
      </div>
    </div>
  );
}
