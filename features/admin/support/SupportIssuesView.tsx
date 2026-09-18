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
 */
import Link from 'next/link';
import { C, fmtDateTime } from '@/features/admin/shared/theme';
import { AdminHeader } from '@/features/admin/shared/AdminHeader';
import { buildHref } from '@/features/admin/shared/queryString';
import type { SupportListResult, SupportItem } from '@/lib/admin/supportData';

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

export function SupportIssuesView({ data, attentionOnly }: { data: SupportListResult; attentionOnly: boolean }) {
  const items = data.items.filter(i => !attentionOnly || i.needsAttention);
  const toggleHref = buildHref('/admin/support', { attention: attentionOnly ? undefined : '1' });

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <AdminHeader title="Support &amp; Issues" active="/admin/support" />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <SourceStatus label="Support tickets" state={data.sources.supportTickets} />
          <SourceStatus label="Shop-audit leads" state={data.sources.shopAuditLeads} />
          <Link
            href={toggleHref}
            style={{
              marginLeft: 'auto', fontSize: 12, textDecoration: 'none', padding: '6px 12px', borderRadius: 99,
              border: `1px solid ${attentionOnly ? C.accent : C.border}`,
              background: attentionOnly ? C.accent + '22' : 'transparent',
              color: attentionOnly ? C.accent : C.muted,
            }}
          >
            {attentionOnly ? '✓ Needs attention only' : 'Needs attention only'}
          </Link>
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
            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, textAlign: 'left', color: C.muted, background: C.surface }}>
                  <th style={{ padding: '10px 12px' }}>Source</th>
                  <th style={{ padding: '10px 12px' }}>Subject</th>
                  <th style={{ padding: '10px 12px' }}>Shop</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Created</th>
                  <th style={{ padding: '10px 12px' }}>Account</th>
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={`${i.source}:${i.id}`} style={{ borderBottom: `1px solid ${C.border}44` }}>
                    <td style={{ padding: '10px 12px' }}><SourceBadge source={i.source} /></td>
                    <td style={{ padding: '10px 12px' }}>
                      {i.subject}
                      {i.needsAttention && <span title="Needs attention" style={{ marginLeft: 6, color: C.warning }}>⚠</span>}
                    </td>
                    <td style={{ padding: '10px 12px', color: C.muted }}>{i.shopName ?? '—'}</td>
                    <td style={{ padding: '10px 12px', color: C.muted }}>{i.status ?? '—'}{i.severity ? ` · ${i.severity}` : ''}</td>
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
