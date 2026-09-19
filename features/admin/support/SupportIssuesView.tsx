/**
 * features/admin/support/SupportIssuesView.tsx
 * INTERNAL PLATFORM-OWNER ONLY. A plain Server Component — no 'use client',
 * no hooks, no client-side fetch. Authorization is enforced server-side by
 * app/admin/support/page.tsx before this ever renders, and the data it
 * displays was read directly from lib/admin/supportData.ts on the server.
 *
 * Read-only — replying to a ticket stays in the existing operator inbox
 * (the support-inbox module inside the main app shell). This page is a
 * cross-shop READ view: what's waiting, from every source that exists.
 * The meaning of every filter is defined in lib/admin/supportTriage.ts.
 */
import Link from 'next/link';
import { C, fmtDateTime } from '@/features/admin/shared/theme';
import { AdminHeader } from '@/features/admin/shared/AdminHeader';
import { buildHref } from '@/features/admin/shared/queryString';
import { TriageControl } from '@/features/admin/support/TriageControl';
import type { SupportListResult, SupportItem } from '@/lib/admin/supportData';
import {
  SUPPORT_OVERDUE_DAYS, SUPPORT_VIEWS, SUPPORT_VIEW_LABELS, filterSupportItems, isConfirmedNoise, type SupportView,
} from '@/lib/admin/supportTriage';

function SourceBadge({ source }: { source: SupportItem['source'] }) {
  const isTicket = source === 'support_ticket';
  const color = isTicket ? C.info : C.warning;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: color + '22', color, textTransform: 'uppercase' }}>
      {isTicket ? 'Support' : 'Shop audit lead'}
    </span>
  );
}

function SourceStatus({ label, state }: { label: string; state: string }) {
  const ok = state === 'available';
  return (
    <span style={{ fontSize: 12, color: ok ? C.success : C.muted }}>
      {label}: {ok ? 'connected' : state === 'not_configured' ? 'not configured' : 'unavailable'}
    </span>
  );
}

function Stat({ label, value, sub, testId, warn }: { label: string; value: string; sub?: string; testId: string; warn?: boolean }) {
  return (
    <div data-testid={testId} style={{ background: C.card, border: `1px solid ${warn ? C.warning : C.border}`, borderRadius: 10, padding: '12px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const ageLabel = (days: number) => (days === 0 ? 'today' : `${days}d`);

export function SupportIssuesView({ data, view }: { data: SupportListResult; view: SupportView }) {
  const items = filterSupportItems(data.items, view);
  const s = data.summary;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <AdminHeader title="Support &amp; Issues" active="/admin/support" />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <SourceStatus label="Support tickets" state={data.sources.supportTickets} />
          <SourceStatus label="Shop-audit leads" state={data.sources.shopAuditLeads} />
        </div>

        <div data-testid="support-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
          <Stat testId="stat-open-tickets" label="Open tickets" value={String(s.openTickets)} sub="Excludes confirmed test / spam" />
          <Stat testId="stat-overdue" label="Overdue" value={String(s.overdueTickets)} sub={`Awaiting a reply ${SUPPORT_OVERDUE_DAYS}+ days`} warn={s.overdueTickets > 0} />
          <Stat testId="stat-oldest" label="Oldest open ticket" value={s.oldestOpenTicketAgeDays === null ? '—' : ageLabel(s.oldestOpenTicketAgeDays)} sub="Excludes confirmed test / spam" warn={(s.oldestOpenTicketAgeDays ?? 0) >= 7} />
          <Stat testId="stat-unreviewed" label="Unreviewed open" value={String(s.unreviewedOpenTickets)} sub="Not yet marked real, test or spam" />
          <Stat testId="stat-new-leads" label="New audit leads" value={String(s.newLeads)} />
          <Stat testId="stat-noise" label="Confirmed test / spam" value={String(s.confirmedNoise)} sub="Kept, not counted above" />
        </div>

        <p data-testid="support-predicates" style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, margin: '0 0 16px' }}>
          <strong style={{ color: C.text }}>Needs attention</strong> = a ticket that is not closed and whose latest message is not from support, or a shop-audit lead
          with status &ldquo;new&rdquo;. <strong style={{ color: C.text }}>Overdue</strong> = a ticket waiting on us for {SUPPORT_OVERDUE_DAYS}+ days, counted from the first customer message nobody has answered (not from when the ticket was opened).
          Test and spam are only ever confirmed by an explicit marker — never inferred from a subject, shop name or message.
          {!data.triageSupported && (
            <span data-testid="triage-unsupported"> Ticket test/spam marking is not available yet, so every ticket is shown as unreviewed; only shop-audit leads with status &ldquo;spam&rdquo; are treated as confirmed spam.</span>
          )}
          {data.triageSupported && (
            <span data-testid="triage-help"> Use &ldquo;Mark ticket&rdquo; to classify a ticket. Each marking is recorded with your sign-in and the time; the ticket and its messages are never changed, and a marking can be changed back.</span>
          )}
        </p>

        {data.truncated && (
          <p data-testid="support-truncated" style={{ fontSize: 12, color: C.warning, margin: '0 0 16px' }}>
            ⚠ Only the {data.maxItemsPerSource} most recent records per source are loaded. Older tickets or leads are not counted above.
          </p>
        )}

        <div data-testid="support-filters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {SUPPORT_VIEWS.map(v => (
            <Link
              key={v}
              href={buildHref('/admin/support', { view: v === 'all' ? undefined : v })}
              style={{
                padding: '6px 12px', borderRadius: 99, fontSize: 12, textDecoration: 'none',
                border: `1px solid ${view === v ? C.accent : C.border}`,
                background: view === v ? C.accent + '22' : 'transparent',
                color: view === v ? C.accent : C.muted,
              }}
            >
              {SUPPORT_VIEW_LABELS[v]}
            </Link>
          ))}
        </div>

        {data.sources.supportTickets === 'unavailable' && data.sources.shopAuditLeads === 'not_configured' && (
          <div style={{ color: C.muted, fontSize: 14, padding: 40, textAlign: 'center', border: `1px dashed ${C.border}`, borderRadius: 10 }}>
            Support inbox not configured.
          </div>
        )}

        {items.length === 0 && (data.sources.supportTickets === 'available' || data.sources.shopAuditLeads === 'available') && (
          <div style={{ color: C.muted, fontSize: 14, padding: 40, textAlign: 'center' }}>Nothing to show.</div>
        )}

        {items.length > 0 && (
          // minWidth forces horizontal scroll within this box on a narrow
          // viewport, rather than every cell wrapping into an unreadable stack.
          <div style={{ overflowX: 'auto', maxWidth: '100%', border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, textAlign: 'left', color: C.muted, background: C.surface }}>
                  <th style={{ padding: '10px 12px' }}>Source</th>
                  <th style={{ padding: '10px 12px' }}>Subject</th>
                  <th style={{ padding: '10px 12px' }}>Shop</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Age</th>
                  <th style={{ padding: '10px 12px' }}>Created</th>
                  <th style={{ padding: '10px 12px' }}>Account</th>
                  {data.triageSupported && <th style={{ padding: '10px 12px' }}>Mark ticket</th>}
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={`${i.source}:${i.id}`} style={{ borderBottom: `1px solid ${C.border}44` }}>
                    <td style={{ padding: '10px 12px' }}><SourceBadge source={i.source} /></td>
                    <td style={{ padding: '10px 12px' }}>
                      {i.subject}
                      {i.needsAttention && <span title="Needs attention" style={{ marginLeft: 6, color: C.warning }}>⚠</span>}
                      {isConfirmedNoise(i.triage) && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 99, padding: '1px 6px' }}>{i.triage}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', color: C.muted }}>{i.shopName ?? '—'}</td>
                    <td style={{ padding: '10px 12px', color: C.muted }}>{i.status ?? '—'}{i.severity ? ` · ${i.severity}` : ''}</td>
                    <td style={{ padding: '10px 12px', color: i.overdue ? C.warning : C.muted, whiteSpace: 'nowrap' }}>
                      {ageLabel(i.ageDays)}{i.overdue ? ` · overdue, waiting ${ageLabel(i.waitingDays ?? i.ageDays)}` : ''}
                    </td>
                    <td style={{ padding: '10px 12px', color: C.muted }}>{fmtDateTime(i.createdAt)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {i.accountId ? (
                        <>
                          <Link href={`/admin/accounts/${i.accountId}`} style={{ color: C.info, textDecoration: 'none' }}>View account →</Link>
                          {i.accountMatchIsHeuristic && (
                            <span title="Matched by email — not a confirmed record link" style={{ marginLeft: 4, fontSize: 10, color: C.muted }}>(possible match)</span>
                          )}
                        </>
                      ) : <span style={{ color: C.muted }}>—</span>}
                    </td>
                    {data.triageSupported && (
                      <td style={{ padding: '10px 12px' }}>
                        {i.source === 'support_ticket'
                          ? <TriageControl ticketId={i.id} current={i.triage} />
                          : <span style={{ color: C.muted }} title="Leads are managed through their own status">—</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
