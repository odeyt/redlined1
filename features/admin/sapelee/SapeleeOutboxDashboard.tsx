'use client';

/**
 * features/admin/sapelee/SapeleeOutboxDashboard.tsx
 *
 * INTERNAL PLATFORM-OWNER ONLY.
 * Route: /admin/sapelee (see app/admin/sapelee/page.tsx).
 * Authorization enforced server-side via verifyPlatformOwner() on both the
 * page and the /api/admin/sapelee/outbox route this fetches from.
 */

import { useState, useEffect, useCallback } from 'react';

// Same colour tokens as features/admin/billing-health/BillingHealthDashboard.tsx
const C = {
  bg: '#0a0a0b', surface: '#111114', card: '#18181c', border: '#2a2a30',
  text: '#e8e8ec', muted: '#8a8a94', accent: '#cc0000',
  success: '#16a34a', warning: '#d97706', danger: '#dc2626',
};

interface OutboxMetrics {
  pending: number;
  delivered: number;
  failed: number;
  oldestPendingAgeSeconds: number | null;
}

interface OutboxRow {
  id: string;
  event_type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
}

function fmtAge(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function KpiCard({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${warn ? C.warning : C.border}`, borderRadius: 10, padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: C.muted, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: warn ? C.warning : C.text, lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = { pending: C.warning, delivered: C.success, failed: C.danger };
  const color = colorMap[status] ?? C.muted;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: color + '22', color, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

export function SapeleeOutboxDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<OutboxMetrics | null>(null);
  const [rows, setRows] = useState<OutboxRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/sapelee/outbox');
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json() as { metrics: OutboxMetrics; recentRows: OutboxRow[] };
      setMetrics(json.metrics);
      setRows(json.recentRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stuck = (metrics?.oldestPendingAgeSeconds ?? 0) > 30 * 60; // stale past ~2 scheduled-flush cycles

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', color: C.accent, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
            Internal Admin — Platform Owner Only
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>
            Sapelee Event Outbox
          </h1>
        </div>
        <button onClick={() => void load()} style={{ padding: '6px 14px', borderRadius: 6, background: C.accent, color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
          Refresh
        </button>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px' }}>
        {loading && (
          <div style={{ color: C.muted, fontSize: 14, padding: 40, textAlign: 'center' }}>
            Loading outbox status…
          </div>
        )}

        {error && (
          <div style={{ background: C.danger + '18', border: `1px solid ${C.danger}44`, borderRadius: 10, padding: 20, color: C.danger, fontSize: 14, marginBottom: 24 }}>
            Error: {error}
          </div>
        )}

        {metrics && !loading && (
          <>
            {stuck && (
              <div style={{ background: C.warning + '18', border: `1px solid ${C.warning}44`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: C.text, marginBottom: 24 }}>
                ⚠ Oldest pending event has been queued for {fmtAge(metrics.oldestPendingAgeSeconds)} — longer than two scheduled-flush cycles. Check the{' '}
                <a href="https://github.com/odeyt/redlined1/actions/workflows/sapelee-flush.yml" target="_blank" rel="noreferrer" style={{ color: C.warning }}>
                  Sapelee Outbox Flush workflow runs
                </a>.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 32 }}>
              <KpiCard label="Pending" value={String(metrics.pending)} warn={metrics.pending > 0 && stuck} />
              <KpiCard label="Delivered" value={String(metrics.delivered)} />
              <KpiCard label="Failed" value={String(metrics.failed)} warn={metrics.failed > 0} />
              <KpiCard label="Oldest Pending" value={fmtAge(metrics.oldestPendingAgeSeconds)} sub="Flushes every 15 minutes" warn={stuck} />
            </div>

            <h2 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
              Recent Activity
            </h2>
            {rows.length === 0 ? (
              <p style={{ color: C.muted, fontSize: 13 }}>No events queued yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rows.map(row => (
                  <div key={row.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{row.event_type}</span>
                        <StatusBadge status={row.status} />
                        {row.attempts > 0 && (
                          <span style={{ fontSize: 11, color: C.muted }}>{row.attempts}/{row.max_attempts} attempts</span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: C.muted }}>{new Date(row.created_at).toLocaleString()}</span>
                    </div>
                    {row.last_error && (
                      <div style={{ fontSize: 12, color: C.danger, marginTop: 6 }}>{row.last_error}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 40, paddingTop: 16, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.muted }}>
              Read-only — delivery happens via the scheduled GitHub Actions workflow, not from this page. Internal admin only — not visible to shop owners.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
