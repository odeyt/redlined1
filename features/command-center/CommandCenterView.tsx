'use client';

import { useEffect, useState, useCallback } from 'react';
import { useShop } from '@/lib/useShop';
import { useAppDispatch } from '@/lib/store';
import { Panel } from '@/components/Panel';
import { getShopId } from '@/lib/shopStore';

// ── Types ────────────────────────────────────────────────────
interface ShopMetrics {
  revenueToday: number;
  revenueYesterday: number;
  paymentsToday: number;
  unpaidInvoiceCount: number;
  unpaidInvoiceTotal: number;
  overdueInvoiceCount: number;
  openEstimateCount: number;
  staleEstimateCount: number;
  staleEstimateTotal: number;
  openJobCount: number;
  stuckJobCount: number;
  completedNotInvoicedCount: number;
  lowInventoryCount: number;
  repairCasesToday: number;
  shopHealthScore: number;
  revenueOpportunityTotal: number;
  riskCount: number;
  calculatedAt?: string;
}

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

// ── Constants ─────────────────────────────────────────────────
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const PRIORITY_CFG = {
  critical: { bg: 'linear-gradient(135deg,#fef2f2,#fee2e2)', border: '#fca5a5', accent: '#dc2626', badge: '#dc2626', label: 'Critical' },
  high:     { bg: 'linear-gradient(135deg,#fff7ed,#ffedd5)', border: '#fdba74', accent: '#ea580c', badge: '#ea580c', label: 'High' },
  medium:   { bg: 'linear-gradient(135deg,#fefce8,#fef9c3)', border: '#fde047', accent: '#ca8a04', badge: '#ca8a04', label: 'Medium' },
  low:      { bg: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '#86efac', accent: '#16a34a', badge: '#16a34a', label: 'Low' },
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

// ── Design tokens ─────────────────────────────────────────────
const D = {
  red:     '#c0392b',
  redGlow: 'rgba(192,57,43,0.18)',
  gold:    '#d97706',
  green:   '#059669',
  blue:    '#2563eb',
  cardShadow: '0 2px 12px rgba(0,0,0,0.08)',
  cardShadowHover: '0 4px 24px rgba(0,0,0,0.14)',
  radius: 14,
  radiusSm: 9,
};

// ── Helpers ───────────────────────────────────────────────────
function shopHealthScore(recs: Recommendation[], signals: SignalMap): number {
  let score = 100;
  score -= recs.filter(r => r.priority === 'critical').length * 15;
  score -= recs.filter(r => r.priority === 'high').length * 8;
  score -= Number(signals.stuck_job_count ?? 0) * 5;
  score -= Number(signals.overdue_invoice_count ?? 0) * 3;
  score -= Math.min(Number(signals.low_inventory_count ?? 0) * 2, 10);
  return Math.max(0, Math.min(100, score));
}

function healthConfig(score: number) {
  if (score >= 80) return { color: '#059669', label: 'Healthy',       ring: '#059669' };
  if (score >= 55) return { color: '#d97706', label: 'Needs Attention', ring: '#d97706' };
  return             { color: '#dc2626', label: 'At Risk',          ring: '#dc2626' };
}

function fmtNum(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString();
}

function fmtMoney(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Health Ring SVG ───────────────────────────────────────────
function HealthRing({ score }: { score: number }) {
  const cfg = healthConfig(score);
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div style={{ position: 'relative', width: 110, height: 110, flexShrink: 0 }}>
      <svg width={110} height={110} viewBox="0 0 110 110">
        <circle cx={55} cy={55} r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={9} />
        <circle
          cx={55} cy={55} r={r} fill="none"
          stroke={cfg.ring} strokeWidth={9}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 55 55)"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: cfg.color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>{cfg.label}</div>
      </div>
    </div>
  );
}

// ── Summary Pill ──────────────────────────────────────────────
function SummaryPill({
  icon, label, value, accent, dimmed, onClick,
}: { icon: string; label: string; value: string | number; accent: string; dimmed?: boolean; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: dimmed ? 'var(--surface)' : `linear-gradient(135deg,${accent}12,${accent}06)`,
        border: `1.5px solid ${dimmed ? 'var(--line)' : accent + (hovered ? '70' : '40')}`,
        borderRadius: D.radius,
        padding: '14px 18px',
        display: 'flex', flexDirection: 'column', gap: 6,
        cursor: clickable ? 'pointer' : 'default',
        transform: hovered && clickable ? 'translateY(-2px)' : 'none',
        boxShadow: hovered && clickable ? `0 6px 20px ${accent}25` : 'none',
        transition: 'all 0.18s ease',
      }}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: dimmed ? 'var(--text)' : accent }}>{value}</div>
      {clickable && <div style={{ fontSize: 10, color: accent, opacity: hovered ? 0.9 : 0.4, fontWeight: 600, transition: 'opacity 0.15s' }}>View →</div>}
    </div>
  );
}

// ── Signal Tile ───────────────────────────────────────────────
function SignalTile({ icon, label, value, accent, onClick }: { icon: string; label: string; value: string | number; accent?: string; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered && onClick ? `${accent ?? '#64748b'}08` : 'var(--surface)',
        border: '1px solid var(--line)',
        borderTop: `3px solid ${hovered && onClick ? (accent ?? '#64748b') : (accent ?? 'var(--line)')}`,
        borderRadius: D.radiusSm,
        padding: '12px 14px',
        boxShadow: hovered && onClick ? D.cardShadowHover : D.cardShadow,
        display: 'flex', flexDirection: 'column', gap: 5,
        cursor: onClick ? 'pointer' : 'default',
        transform: hovered && onClick ? 'translateY(-2px)' : 'none',
        transition: 'all 0.18s ease',
      }}>
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ?? 'var(--text)' }}>{value}</div>
      {onClick && <div style={{ fontSize: 10, color: accent ?? 'var(--muted)', opacity: hovered ? 0.8 : 0.3, fontWeight: 600, transition: 'opacity 0.15s' }}>Open →</div>}
    </div>
  );
}

// ── Row Item (for opportunity / risk panels) ──────────────────
function RowItem({
  label, value, accent, tag, onClick,
}: { label: string; value: string | number; accent?: string; tag?: string; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '9px 8px', borderBottom: '1px solid var(--line)', fontSize: 13,
        cursor: onClick ? 'pointer' : 'default',
        borderRadius: hovered && onClick ? 6 : 0,
        background: hovered && onClick ? (accent ? `${accent}08` : 'rgba(0,0,0,0.03)') : 'transparent',
        marginInline: hovered && onClick ? -4 : 0,
        paddingInline: hovered && onClick ? 12 : 8,
        transition: 'all 0.14s ease',
      }}>
      <span style={{ color: 'var(--text)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        {onClick && <span style={{ fontSize: 10, color: accent ?? 'var(--muted)', opacity: hovered ? 0.8 : 0, transition: 'opacity 0.14s', fontWeight: 700 }}>→</span>}
      </span>
      <span style={{
        fontWeight: 700,
        color: accent ?? 'var(--text)',
        background: accent ? `${accent}14` : 'transparent',
        padding: accent ? '2px 10px' : undefined,
        borderRadius: accent ? 20 : undefined,
        fontSize: 12,
        transform: hovered && onClick ? 'scale(1.05)' : 'scale(1)',
        transition: 'transform 0.14s',
      }}>
        {value}{tag ? ` ${tag}` : ''}
      </span>
    </div>
  );
}

// ── Recommendation Card ───────────────────────────────────────
function RecCard({ rec, onDone, onDismiss }: { rec: Recommendation; onDone: (id: string) => void; onDismiss: (id: string) => void }) {
  const cfg = PRIORITY_CFG[rec.priority] ?? PRIORITY_CFG.medium;
  const icon = CATEGORY_ICON[rec.category] ?? '📌';
  return (
    <div style={{
      background: cfg.bg,
      border: `1.5px solid ${cfg.border}`,
      borderLeft: `4px solid ${cfg.accent}`,
      borderRadius: D.radiusSm,
      padding: '14px 16px',
      boxShadow: D.cardShadow,
      display: 'flex', flexDirection: 'column', gap: 7,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{rec.title}</span>
        <span style={{
          fontSize: 10, fontWeight: 800, color: '#fff',
          background: cfg.badge, borderRadius: 20,
          padding: '3px 10px', textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>{cfg.label}</span>
      </div>
      {rec.description && <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{rec.description}</div>}
      {rec.reason && <div style={{ fontSize: 11, color: cfg.accent, fontStyle: 'italic' }}>{rec.reason}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
        {rec.estimatedRevenue != null && rec.estimatedRevenue > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: 'rgba(5,150,105,0.12)', borderRadius: 6, padding: '2px 8px' }}>
            💵 {fmtMoney(rec.estimatedRevenue)} opportunity
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{Math.round(rec.confidence * 100)}% confidence</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
          <button
            onClick={() => onDone(rec.id)}
            style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em' }}>
            ✓ Done
          </button>
          <button
            onClick={() => onDismiss(rec.id)}
            style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Disabled state ────────────────────────────────────────────
function DisabledState({ reason }: { reason: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 340, gap: 14, color: 'var(--muted)', textAlign: 'center', padding: 40 }}>
      <span style={{ fontSize: 44 }}>🛡️</span>
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Command Center</div>
      <div style={{ fontSize: 13, maxWidth: 380 }}>{reason}</div>
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────
function SectionHeading({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em',
      color: 'var(--muted)', marginBottom: 12,
    }}>
      <span>{icon}</span>
      <span>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--line)', marginLeft: 4 }} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export function CommandCenterView() {
  const { role } = useShop();
  const dispatch = useAppDispatch();
  const shopId = getShopId();

  function nav(module: string) {
    dispatch({ type: 'SET_MODULE', module });
  }

  const [recs, setRecs] = useState<FetchState<Recommendation[]>>({ data: null, loading: true, error: null });
  const [signals, setSignals] = useState<FetchState<SignalMap>>({ data: null, loading: true, error: null });
  const [metrics, setMetrics] = useState<ShopMetrics | null>(null);
  const [generating, setGenerating] = useState(false);
  const [tablesMissing, setTablesMissing] = useState(false);
  const [flagDisabled, setFlagDisabled] = useState(false);

  if (role && role !== 'owner' && role !== 'manager') {
    return <DisabledState reason="Command Center is only available to shop owners and managers." />;
  }

  const shopHeaders = { 'x-shop-id': shopId };

  const loadRecommendations = useCallback(async () => {
    setRecs(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch('/api/intelligence/recommendations', { headers: shopHeaders });
      if (res.status === 401 || res.status === 403) { setRecs({ data: [], loading: false, error: null }); return; }
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

  const loadMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/intelligence/metrics', { headers: shopHeaders });
      if (!res.ok) return;
      const body = await res.json() as { metrics?: ShopMetrics; disabled?: boolean };
      if (body.metrics) setMetrics(body.metrics);
    } catch { /* metrics unavailable */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;
    loadRecommendations();
    loadSignals();
    loadMetrics();
  }, [shopId, loadRecommendations, loadSignals, loadMetrics]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await fetch('/api/intelligence/metrics', { method: 'POST', headers: shopHeaders });
      await fetch('/api/intelligence/recommendations', { method: 'POST', headers: shopHeaders });
      await Promise.all([loadRecommendations(), loadSignals(), loadMetrics()]);
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

  // ── Computed values ───────────────────────────────────────────
  const recList = (recs.data ?? []).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const sig = signals.data ?? {};

  const revenueToday   = metrics?.revenueToday   ?? Number(sig.revenue_today   ?? 0);
  const paymentsToday  = metrics?.paymentsToday  ?? Number(sig.payments_today  ?? 0);
  const openJobs       = metrics?.openJobCount   ?? Number(sig.open_job_count  ?? 0);
  const staleEst       = metrics?.staleEstimateCount ?? Number(sig.stale_estimate_count ?? 0);
  const lowInv         = metrics?.lowInventoryCount  ?? Number(sig.low_inventory_count  ?? 0);
  const repairCases    = metrics?.repairCasesToday   ?? Number(sig.repair_cases_created_today ?? 0);
  const unpaidCount    = metrics?.unpaidInvoiceCount ?? Number(sig.unpaid_invoice_count ?? 0);
  const overdueCount   = metrics?.overdueInvoiceCount ?? Number(sig.overdue_invoice_count ?? 0);
  const stuckJobs      = metrics?.stuckJobCount ?? Number(sig.stuck_job_count ?? 0);
  const notInvoiced    = metrics?.completedNotInvoicedCount ?? Number(sig.completed_not_invoiced_count ?? 0);
  const revenueOpportunity = metrics?.revenueOpportunityTotal ?? 0;

  const score  = metrics?.shopHealthScore ?? shopHealthScore(recList, sig);
  const hCfg   = healthConfig(score);
  const criticalCount = recList.filter(r => r.priority === 'critical').length;
  const highCount     = recList.filter(r => r.priority === 'high').length;
  const top5 = recList.slice(0, 5);

  // ── Guard states ──────────────────────────────────────────────
  if (tablesMissing) {
    return <Panel title="D1 Command Center"><DisabledState reason="Intelligence Bus tables are not active yet. Run the SI-2 migration in Supabase to enable Command Center." /></Panel>;
  }
  if (flagDisabled) {
    return <Panel title="D1 Command Center"><DisabledState reason="Command Center is not enabled. Enable the 'recommendation_engine' feature flag to activate intelligence recommendations." /></Panel>;
  }

  const isLoading = recs.loading && signals.loading;

  return (
    <Panel title="D1 Command Center">
      {/* ── Premium Header ─────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, #0f0f14 0%, #1a0a0a 60%, #2a0e0e 100%)`,
        borderRadius: 16,
        padding: '22px 26px',
        marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14,
        boxShadow: `0 4px 32px rgba(192,57,43,0.25), inset 0 1px 0 rgba(255,255,255,0.06)`,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* subtle grid pattern overlay */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.04,
          backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.3) 1px,transparent 1px)',
          backgroundSize: '24px 24px',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>⚡</span>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
              D1 Command Center
            </h2>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
            Intelligence Dashboard · Owner &amp; Manager View
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            position: 'relative',
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 22px',
            borderRadius: 10,
            background: generating
              ? 'rgba(255,255,255,0.08)'
              : 'linear-gradient(135deg,#e74c3c,#c0392b)',
            color: '#fff', border: 'none',
            fontWeight: 800, fontSize: 13, cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.7 : 1,
            boxShadow: generating ? 'none' : '0 4px 16px rgba(192,57,43,0.5)',
            letterSpacing: '0.02em',
            transition: 'all 0.2s',
          }}>
          <span style={{ fontSize: 15 }}>{generating ? '⟳' : '⚡'}</span>
          {generating ? 'Refreshing…' : 'Refresh Intelligence'}
        </button>
      </div>

      {isLoading ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: 240, gap: 14, color: 'var(--muted)',
        }}>
          <div style={{ fontSize: 32, animation: 'spin 1s linear infinite' }}>⟳</div>
          <div style={{ fontSize: 13 }}>Loading intelligence data…</div>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <>
          {/* ── Section 1: Health Score + Summary Pills ──────── */}
          <div style={{
            display: 'flex', gap: 20, alignItems: 'stretch', marginBottom: 24, flexWrap: 'wrap',
          }}>
            {/* Health ring card */}
            <div style={{
              background: `linear-gradient(135deg,${hCfg.color}10,${hCfg.color}05)`,
              border: `2px solid ${hCfg.color}40`,
              borderRadius: D.radius,
              padding: '20px 24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 8, minWidth: 140,
              boxShadow: `0 0 24px ${hCfg.color}20`,
            }}>
              <HealthRing score={score} />
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Shop Health
              </div>
            </div>

            {/* Summary pills */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12 }}>
              <SummaryPill icon="🚨" label="Critical" value={criticalCount}
                accent="#dc2626" dimmed={criticalCount === 0}
                onClick={criticalCount > 0 ? () => nav('repair-orders') : undefined} />
              <SummaryPill icon="⚠️" label="High Priority" value={highCount}
                accent="#ea580c" dimmed={highCount === 0}
                onClick={highCount > 0 ? () => nav('job-cards') : undefined} />
              <SummaryPill icon="📋" label="Open Recs" value={recList.length}
                accent="#2563eb" dimmed={recList.length === 0}
                onClick={recList.length > 0 ? () => nav('estimates') : undefined} />
              <SummaryPill icon="🔴" label="Overdue Invoices" value={overdueCount}
                accent="#dc2626" dimmed={overdueCount === 0}
                onClick={overdueCount > 0 ? () => nav('invoices') : undefined} />
            </div>
          </div>

          {/* ── Section 2: Top Priorities ────────────────────── */}
          <div style={{ marginBottom: 24 }}>
            <SectionHeading icon="🎯" label="Top Priorities" />
            {top5.length === 0 ? (
              <div style={{
                background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
                border: '1.5px solid #86efac',
                borderRadius: D.radiusSm,
                padding: '20px 24px',
                textAlign: 'center',
                color: '#15803d', fontSize: 13, fontWeight: 600,
              }}>
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
            {/* Revenue */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderTop: `3px solid ${D.green}`,
              borderRadius: D.radius,
              padding: '18px 20px',
              boxShadow: D.cardShadow,
            }}>
              <SectionHeading icon="💵" label="Revenue Opportunities" />
              <RowItem label="Unpaid invoices"         value={unpaidCount}  tag="invoices"  accent={unpaidCount  > 0 ? '#ea580c' : undefined} onClick={() => nav('invoices')} />
              <RowItem label="Stale estimates"         value={staleEst}     tag="estimates" accent={staleEst     > 0 ? '#ea580c' : undefined} onClick={() => nav('estimates')} />
              <RowItem label="Completed, not invoiced" value={notInvoiced}  tag="jobs"      accent={notInvoiced  > 0 ? '#dc2626' : undefined} onClick={() => nav('job-cards')} />
              <RowItem label="Revenue today"           value={fmtMoney(revenueToday)} accent={revenueToday > 0 ? D.green : undefined} onClick={() => nav('payments')} />
              {revenueOpportunity > 0 && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>Total Opportunity</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: '#15803d' }}>{fmtMoney(revenueOpportunity)}</span>
                </div>
              )}
            </div>

            {/* Risks */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderTop: `3px solid ${D.red}`,
              borderRadius: D.radius,
              padding: '18px 20px',
              boxShadow: D.cardShadow,
            }}>
              <SectionHeading icon="⚠️" label="Operations Risks" />
              <RowItem label="Stuck repair orders"  value={stuckJobs}    accent={stuckJobs   > 0 ? '#dc2626' : undefined} onClick={() => nav('repair-orders')} />
              <RowItem label="Low inventory items"  value={lowInv}       accent={lowInv      > 0 ? '#ea580c' : undefined} onClick={() => nav('parts')} />
              <RowItem label="Overdue invoices"     value={overdueCount} accent={overdueCount > 0 ? '#ea580c' : undefined} onClick={() => nav('invoices')} />
              <RowItem label="Open job cards"       value={openJobs} onClick={() => nav('job-cards')} />
              <RowItem label="Repair cases today"   value={repairCases}  accent={repairCases > 0 ? D.green : undefined} onClick={() => nav('repair-intelligence')} />
            </div>
          </div>

          {/* ── Data freshness ───────────────────────────────── */}
          {metrics?.calculatedAt && (
            <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right', marginBottom: 16, marginTop: -16 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: '3px 10px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                Live data · updated {new Date(metrics.calculatedAt).toLocaleTimeString()}
              </span>
            </div>
          )}

          {/* ── Section 5: Live Signals ───────────────────────── */}
          <div style={{ marginBottom: 8 }}>
            <SectionHeading icon="📡" label="Live Signals" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
              <SignalTile icon="💵" label="Revenue Today"      value={fmtMoney(revenueToday)}
                accent={revenueToday > 0 ? D.green : 'var(--muted)'} onClick={() => nav('payments')} />
              <SignalTile icon="💳" label="Payments Today"     value={fmtNum(paymentsToday)}
                accent={paymentsToday > 0 ? D.blue : undefined} onClick={() => nav('payments')} />
              <SignalTile icon="🔧" label="Open Jobs"          value={fmtNum(openJobs)}
                accent={openJobs > 5 ? D.gold : undefined} onClick={() => nav('job-cards')} />
              <SignalTile icon="📋" label="Stale Estimates"    value={fmtNum(staleEst)}
                accent={staleEst > 0 ? '#ea580c' : undefined} onClick={() => nav('estimates')} />
              <SignalTile icon="📦" label="Low Inventory"      value={fmtNum(lowInv)}
                accent={lowInv > 0 ? '#ea580c' : undefined} onClick={() => nav('parts')} />
              <SignalTile icon="🗂️" label="Repair Cases Today" value={fmtNum(repairCases)}
                accent={repairCases > 0 ? D.green : undefined} onClick={() => nav('repair-intelligence')} />
            </div>
          </div>

          {recs.error && (
            <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#b91c1c', marginTop: 12 }}>
              ⚠️ {recs.error}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
