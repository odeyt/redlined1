'use client';

import { useEffect, useState, useCallback } from 'react';
import { useShop } from '@/lib/useShop';
import { Panel } from '@/components/Panel';
import { getShopId } from '@/lib/shopStore';

// ── Types ────────────────────────────────────────────────────
interface Recommendation {
  id: string;
  recommendationKey: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description?: string;
  reason?: string;
  estimatedRevenue?: number | null;
  confidence: number;
  status: string;
}

type SignalMap = Record<string, number | string | null>;

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  critical: { bg: '#fef2f2', border: '#fca5a5', color: '#b91c1c', label: 'Critical' },
  high:     { bg: '#fff7ed', border: '#fdba74', color: '#c2410c', label: 'High' },
  medium:   { bg: '#fefce8', border: '#fde047', color: '#92400e', label: 'Medium' },
  low:      { bg: '#f0fdf4', border: '#86efac', color: '#166534', label: 'Low' },
};
const CATEGORY_ICON: Record<string, string> = {
  unpaid_invoices:     '💰',
  estimates:           '📋',
  revenue:             '📈',
  operations:          '⚙️',
  inventory:           '📦',
  customer_followup:   '👤',
  repair_intelligence: '🔧',
  risk:                '⚠️',
  technician:          '🧑‍🔧',
  growth:              '🚀',
  system:              '🖥️',
};

function shopHealthScore(recs: Recommendation[], signals: SignalMap): number {
  let score = 100;
  const criticalCount = recs.filter(r => r.priority === 'critical').length;
  const highCount     = recs.filter(r => r.priority === 'high').length;
  const stuck   = Number(signals.stuck_job_count   ?? 0);
  const overdue = Number(signals.overdue_invoice_count ?? 0);
  const lowInv  = Number(signals.low_inventory_count ?? 0);
  score -= criticalCount * 15;
  score -= highCount     * 8;
  score -= stuck         * 5;
  score -= overdue       * 3;
  score -= Math.min(lowInv * 2, 10);
  return Math.max(0, Math.min(100, score));
}

function healthColor(score: number) {
  if (score >= 80) return '#22c55e';
  if (score >= 55) return '#f59e0b';
  return '#ef4444';
}

function fmtNum(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString();
}

function fmtMoney(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Disabled / Locked state ────────────────────────────────────
function DisabledState({ reason }: { reason: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 340, gap: 12, color: 'var(--muted)', textAlign: 'center', padding: 40 }}>
      <span style={{ fontSize: 40 }}>🛡️</span>
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Command Center</div>
      <div style={{ fontSize: 13, maxWidth: 380 }}>{reason}</div>
    </div>
  );
}

// ── Stat Tile ─────────────────────────────────────────────────
function Tile({ icon, label, value, sub, color }: { icon: string; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  );
}

// ── Recommendation Card ───────────────────────────────────────
function RecCard({ rec, onDone, onDismiss }: { rec: Recommendation; onDone: (id: string) => void; onDismiss: (id: string) => void }) {
  const ps = PRIORITY_STYLE[rec.priority] ?? PRIORITY_STYLE.medium;
  const icon = CATEGORY_ICON[rec.category] ?? '📌';
  return (
    <div style={{ background: ps.bg, border: `1.5px solid ${ps.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{rec.title}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: ps.color, background: 'rgba(0,0,0,0.06)', borderRadius: 20, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{ps.label}</span>
      </div>
      {rec.description && <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{rec.description}</div>}
      {rec.reason && <div style={{ fontSize: 11, color: ps.color, fontStyle: 'italic' }}>{rec.reason}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        {rec.estimatedRevenue != null && rec.estimatedRevenue > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.1)', borderRadius: 6, padding: '2px 8px' }}>
            💵 {fmtMoney(rec.estimatedRevenue)} opportunity
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {Math.round(rec.confidence * 100)}% confidence
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={() => onDone(rec.id)}
            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #22c55e', background: 'rgba(34,197,94,0.1)', color: '#15803d', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            ✓ Done
          </button>
          <button
            onClick={() => onDismiss(rec.id)}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export function CommandCenterView() {
  const { role } = useShop();
  const shopId = getShopId();

  const [recs, setRecs] = useState<FetchState<Recommendation[]>>({ data: null, loading: true, error: null });
  const [signals, setSignals] = useState<FetchState<SignalMap>>({ data: null, loading: true, error: null });
  const [generating, setGenerating] = useState(false);
  const [tablesMissing, setTablesMissing] = useState(false);
  const [flagDisabled, setFlagDisabled] = useState(false);

  // Block technicians
  if (role && role !== 'owner' && role !== 'manager') {
    return <DisabledState reason="Command Center is only available to shop owners and managers." />;
  }

  const shopHeaders = { 'x-shop-id': shopId };

  const loadRecommendations = useCallback(async () => {
    setRecs(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch('/api/intelligence/recommendations', { headers: shopHeaders });
      if (res.status === 401 || res.status === 403) {
        setRecs({ data: [], loading: false, error: null });
        return;
      }
      const body = await res.json() as { disabled?: boolean; recommendations?: Recommendation[]; error?: string };
      if (body.disabled) { setFlagDisabled(true); setRecs({ data: [], loading: false, error: null }); return; }
      if (body.error?.toLowerCase().includes('does not exist')) { setTablesMissing(true); setRecs({ data: [], loading: false, error: null }); return; }
      setRecs({ data: body.recommendations ?? [], loading: false, error: body.error ?? null });
    } catch {
      setRecs({ data: null, loading: false, error: 'Unable to reach recommendation service.' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const loadSignals = useCallback(async () => {
    setSignals(s => ({ ...s, loading: true }));
    try {
      const res = await fetch('/api/intelligence/signals', { headers: shopHeaders });
      if (!res.ok) { setSignals({ data: {}, loading: false, error: null }); return; }
      const body = await res.json() as { signals?: SignalMap; error?: string };
      setSignals({ data: body.signals ?? {}, loading: false, error: null });
    } catch {
      setSignals({ data: {}, loading: false, error: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;
    loadRecommendations();
    loadSignals();
  }, [shopId, loadRecommendations, loadSignals]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await fetch('/api/intelligence/recommendations', { method: 'POST', headers: shopHeaders });
      await Promise.all([loadRecommendations(), loadSignals()]);
    } catch { /* fail silently */ }
    finally { setGenerating(false); }
  }

  async function handleAction(id: string, action: 'complete' | 'dismiss') {
    try {
      await fetch('/api/intelligence/recommendations', {
        method: 'PATCH',
        headers: { ...shopHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      setRecs(s => ({ ...s, data: (s.data ?? []).filter(r => r.id !== id) }));
    } catch { /* fail silently */ }
  }

  // ── Computed ─────────────────────────────────────────────────
  const recList = (recs.data ?? []).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const sig = signals.data ?? {};
  const score = shopHealthScore(recList, sig);
  const hColor = healthColor(score);
  const revenueToday   = Number(sig.revenue_today   ?? 0);
  const paymentsToday  = Number(sig.payments_today  ?? 0);
  const openJobs       = Number(sig.open_job_count  ?? 0);
  const staleEst       = Number(sig.stale_estimate_count ?? 0);
  const lowInv         = Number(sig.low_inventory_count  ?? 0);
  const repairCases    = Number(sig.repair_cases_created_today ?? 0);
  const unpaidCount    = Number(sig.unpaid_invoice_count ?? 0);
  const overdueCount   = Number(sig.overdue_invoice_count ?? 0);
  const stuckJobs      = Number(sig.stuck_job_count ?? 0);
  const notInvoiced    = Number(sig.completed_not_invoiced_count ?? 0);

  const criticalCount = recList.filter(r => r.priority === 'critical').length;
  const highCount     = recList.filter(r => r.priority === 'high').length;
  const top5 = recList.slice(0, 5);

  // ── Render guard states ───────────────────────────────────────
  if (tablesMissing) {
    return (
      <Panel title="D1 Command Center">
        <DisabledState reason="Intelligence Bus tables are not active yet. Run the SI-2 migration in Supabase to enable Command Center." />
      </Panel>
    );
  }
  if (flagDisabled) {
    return (
      <Panel title="D1 Command Center">
        <DisabledState reason="Command Center is not enabled. Enable the 'recommendation_engine' feature flag to activate intelligence recommendations." />
      </Panel>
    );
  }

  const isLoading = recs.loading && signals.loading;

  return (
    <Panel title="D1 Command Center">
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>D1 Command Center</h2>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Intelligence dashboard · Owner &amp; Manager view</div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, background: '#c0392b', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1 }}>
          {generating ? '⟳ Refreshing…' : '⚡ Refresh Intelligence'}
        </button>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Loading intelligence data…</div>
      ) : (
        <>
          {/* ── Section 1: Health Score ──────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20, alignItems: 'center', background: 'var(--surface)', border: `2px solid ${hColor}`, borderRadius: 14, padding: '16px 22px', marginBottom: 20 }}>
            <div style={{ textAlign: 'center', minWidth: 90 }}>
              <div style={{ fontSize: 44, fontWeight: 900, color: hColor, lineHeight: 1 }}>{score}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: hColor, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
                {score >= 80 ? 'Healthy' : score >= 55 ? 'Needs Attention' : 'At Risk'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>Shop Health Score</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              <Tile icon="🚨" label="Critical" value={criticalCount} color={criticalCount > 0 ? '#b91c1c' : 'var(--text)'} />
              <Tile icon="⚠️" label="High Priority" value={highCount} color={highCount > 0 ? '#c2410c' : 'var(--text)'} />
              <Tile icon="📋" label="Open Recs" value={recList.length} />
              <Tile icon="🔴" label="Overdue Invoices" value={overdueCount} color={overdueCount > 0 ? '#b91c1c' : 'var(--text)'} />
            </div>
          </div>

          {/* ── Section 2: Top Priorities ────────────────────── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>
              🎯 Top Priorities
            </div>
            {top5.length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                ✅ Your shop is clear. No urgent recommendations right now.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {top5.map(r => (
                  <RecCard key={r.id} rec={r} onDone={id => handleAction(id, 'complete')} onDismiss={id => handleAction(id, 'dismiss')} />
                ))}
                {recList.length > 5 && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', paddingTop: 4 }}>
                    +{recList.length - 5} more recommendation{recList.length - 5 !== 1 ? 's' : ''} — click Refresh Intelligence to see all.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Sections 3 + 4: Revenue Opportunities + Risks ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            {/* Revenue Opportunities */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 10 }}>💵 Revenue Opportunities</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Unpaid invoices',          value: unpaidCount,  unit: 'invoices', color: unpaidCount  > 0 ? '#c2410c' : 'var(--muted)' },
                  { label: 'Stale estimates',          value: staleEst,     unit: 'estimates',color: staleEst     > 0 ? '#c2410c' : 'var(--muted)' },
                  { label: 'Completed, not invoiced',  value: notInvoiced,  unit: 'jobs',     color: notInvoiced  > 0 ? '#b91c1c' : 'var(--muted)' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ color: 'var(--text)' }}>{item.label}</span>
                    <span style={{ fontWeight: 700, color: item.color }}>{fmtNum(item.value)} {item.unit}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '5px 0' }}>
                  <span style={{ color: 'var(--text)' }}>Revenue today</span>
                  <span style={{ fontWeight: 700, color: '#22c55e' }}>{fmtMoney(revenueToday)}</span>
                </div>
              </div>
            </div>

            {/* Operations Risks */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 10 }}>⚠️ Operations Risks</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Stuck repair orders',    value: stuckJobs,   color: stuckJobs  > 0 ? '#b91c1c' : 'var(--muted)' },
                  { label: 'Low inventory items',    value: lowInv,      color: lowInv     > 0 ? '#c2410c' : 'var(--muted)' },
                  { label: 'Overdue invoices',       value: overdueCount,color: overdueCount > 0 ? '#c2410c' : 'var(--muted)' },
                  { label: 'Open job cards',         value: openJobs,    color: 'var(--text)' },
                  { label: 'Repair cases today',     value: repairCases, color: repairCases > 0 ? '#22c55e' : 'var(--muted)' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ color: 'var(--text)' }}>{item.label}</span>
                    <span style={{ fontWeight: 700, color: item.color }}>{fmtNum(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Section 5: Signals Panel ─────────────────────── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 10 }}>
              📡 Live Signals
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              <Tile icon="💵" label="Revenue Today"     value={fmtMoney(revenueToday)}  color="#22c55e" />
              <Tile icon="💳" label="Payments Today"    value={fmtNum(paymentsToday)} />
              <Tile icon="🔧" label="Open Jobs"         value={fmtNum(openJobs)} color={openJobs > 5 ? '#f59e0b' : 'var(--text)'} />
              <Tile icon="📋" label="Stale Estimates"   value={fmtNum(staleEst)}  color={staleEst > 0 ? '#c2410c' : 'var(--text)'} />
              <Tile icon="📦" label="Low Inventory"     value={fmtNum(lowInv)}    color={lowInv   > 0 ? '#c2410c' : 'var(--text)'} />
              <Tile icon="🗂️" label="Repair Cases Today" value={fmtNum(repairCases)} color={repairCases > 0 ? '#22c55e' : 'var(--text)'} />
            </div>
          </div>

          {recs.error && (
            <div style={{ padding: '10px 14px', background: '#fee2e2', borderRadius: 8, fontSize: 12, color: '#b91c1c', marginTop: 12 }}>
              ⚠️ {recs.error}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
