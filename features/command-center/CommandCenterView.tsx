'use client';

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useShop } from '@/lib/useShop';
import { useAppDispatch } from '@/lib/store';
import { Panel } from '@/components/Panel';
import { getShopId } from '@/lib/shopStore';
import { MorningBriefModal } from './MorningBriefModal';
import { Suspense } from 'react';
import { LearningDashboardSection } from '@/features/intelligence-learning/LearningDashboardSection';
import { FeatureGate } from '@/components/featureFlags/FeatureFlagProvider';
import { OperationalMetricsSection } from './OperationalMetricsSection';
import { useOperationalStats } from '@/features/dashboard/shared/useOperationalStats';
import { CURRENCIES } from '@/services/invoiceService';

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

// SI-6 — Decision Engine types (local, matches API response shape)
interface QuickAction {
  type: string;
  label: string;
  module?: string;
}
interface DecisionSubScores {
  revenueScore: number;
  riskScore: number;
  urgencyScore: number;
  timeEfficiencyScore: number;
  cashFlowScore: number;
}
interface RankedAction {
  rank: number;
  recommendation: Recommendation;
  score: {
    decisionScore: number;
    estimatedTimeMinutes: number;
    rationale: string;
    confidenceMultiplier: number;
    subScores: DecisionSubScores;
  };
  quickActions: QuickAction[];
  whyItMatters: string;
  expectedImpact: string;
}
interface ExecScoreBreakdown {
  overall: number;
  revenueHealth: number;
  efficiency: number;
  riskControl: number;
  cashFlow: number;
  knowledgeGrowth: number;
  trend: 'up' | 'down' | 'stable';
}

// SI-9 — Business Memory (local shape, matches API response)
interface MemoryItem {
  id: string;
  memoryType: string;
  entityType: string;
  title: string;
  summary: string | null;
  importance: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  lastSeenAt: string;
}
interface MemorySummaryShape {
  totalItems: number;
  criticalCount: number;
  highCount: number;
  topItems: MemoryItem[];
  extractedAt: string;
}

// SI-7 — Morning Brief (local shape, matches API response)
interface MorningBriefSummary {
  id: string;
  briefDate: string;
  status: string;
  shopHealthScore: number;
  executiveScore: number;
  title: string;
  summary: string;
  recommendedFocus: string;
  generatedAt: string;
  todayPriorities: Array<{
    rank: number; title: string; decisionScore: number;
    estimatedRevenue: number | null; estimatedTimeMinutes: number;
    whyItMatters: string; module: string | null;
  }>;
  revenueOpportunities: Array<{ key: string; label: string; count: number; total: number | null; module: string; urgency: string }>;
  cashCollection: { unpaidCount: number; unpaidTotal: number; overdueCount: number; overdueTotal: number; collectionUrgency: string };
  operationalRisks: Array<{ key: string; label: string; count: number; detail: string | null; module: string; severity: string }>;
  technicianSummary: { activeCount: number; idleCount: number; totalAssigned: number; bottlenecks: string[] };
  inventorySummary: { lowCount: number; reorderUrgency: string };
  yesterdaySummary: { revenueYesterday: number; paymentsYesterday: number; jobsCompleted: number; repairCasesCreated: number; invoicesCreated: number };
}

// ── Constants ─────────────────────────────────────────────────
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const PRIORITY_CFG = {
  critical: { bg: 'linear-gradient(135deg,rgba(220,38,38,0.13),rgba(220,38,38,0.05))',  border: 'rgba(248,113,113,0.3)', accent: '#f87171', badge: '#dc2626', label: 'Critical' },
  high:     { bg: 'linear-gradient(135deg,rgba(234,88,12,0.13),rgba(234,88,12,0.05))',  border: 'rgba(251,146,60,0.3)',  accent: '#fb923c', badge: '#ea580c', label: 'High' },
  medium:   { bg: 'linear-gradient(135deg,rgba(202,138,4,0.13),rgba(202,138,4,0.05))',  border: 'rgba(251,191,36,0.3)',  accent: '#fbbf24', badge: '#ca8a04', label: 'Medium' },
  low:      { bg: 'linear-gradient(135deg,rgba(22,163,74,0.13),rgba(22,163,74,0.05))',  border: 'rgba(74,222,128,0.25)', accent: '#4ade80', badge: '#16a34a', label: 'Low' },
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
  red:     '#e74c3c',
  redGlow: 'rgba(231,76,60,0.25)',
  gold:    '#f59e0b',
  green:   '#22d3a0',
  blue:    '#60a5fa',
  cardBg:  '#0d0d14',
  cardBorder: 'rgba(255,255,255,0.07)',
  cardShadow: '0 4px 24px rgba(0,0,0,0.4)',
  cardShadowHover: '0 8px 36px rgba(0,0,0,0.55)',
  radius: 18,
  radiusSm: 12,
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
        <circle cx={55} cy={55} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={9} />
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

// ── Keyframe animations (injected once) ──────────────────────
const CC_STYLES = `
  @keyframes cc-pulse-red {
    0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); border-color: rgba(220,38,38,0.55); }
    50%      { box-shadow: 0 0 22px 6px rgba(220,38,38,0.28); border-color: rgba(220,38,38,0.9); }
  }
  @keyframes cc-pulse-orange {
    0%,100% { box-shadow: 0 0 0 0 rgba(234,88,12,0); border-color: rgba(234,88,12,0.45); }
    50%      { box-shadow: 0 0 16px 4px rgba(234,88,12,0.22); border-color: rgba(234,88,12,0.8); }
  }
  @keyframes cc-dot-blink {
    0%,100% { opacity: 1; } 50% { opacity: 0.25; }
  }
  @keyframes cc-slide-up {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes cc-count-in {
    from { opacity: 0; transform: scale(0.7); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes cc-spin {
    from { transform: rotate(0deg); } to { transform: rotate(360deg); }
  }
`;

// ── Summary Pill ──────────────────────────────────────────────
function SummaryPill({
  icon, label, value, accent, dimmed, onClick, urgency,
}: { icon: string; label: string; value: string | number | ReactNode; accent: string; dimmed?: boolean; onClick?: () => void; urgency?: 'critical' | 'high' | 'none' }) {
  const [hovered, setHovered] = useState(false);
  const clickable = !!onClick;
  const isAlert = !dimmed && (urgency === 'critical' || urgency === 'high');

  const animName = urgency === 'critical' ? 'cc-pulse-red' : urgency === 'high' ? 'cc-pulse-orange' : 'none';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: dimmed
          ? 'linear-gradient(145deg,#111118,#0a0a10)'
          : urgency === 'critical'
            ? 'linear-gradient(145deg,rgba(220,38,38,0.15),rgba(10,10,16,0.95))'
            : urgency === 'high'
              ? 'linear-gradient(145deg,rgba(234,88,12,0.12),rgba(10,10,16,0.95))'
              : 'linear-gradient(145deg,rgba(255,255,255,0.04),rgba(10,10,16,0.95))',
        border: `1.5px solid ${dimmed ? 'rgba(255,255,255,0.08)' : accent + '55'}`,
        borderRadius: D.radius,
        padding: '18px 20px',
        display: 'flex', flexDirection: 'column', gap: 8,
        cursor: clickable ? 'pointer' : 'default',
        transform: hovered && clickable ? 'translateY(-3px) scale(1.015)' : 'none',
        boxShadow: hovered && clickable
          ? `0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px ${accent}30`
          : `0 4px 16px rgba(0,0,0,0.3)`,
        transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease',
        animation: isAlert ? `${animName} 2.2s ease-in-out infinite` : 'none',
        position: 'relative', overflow: 'hidden',
      }}>
      {/* Subtle shimmer line at top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg,transparent,${accent}60,transparent)`,
        opacity: dimmed ? 0.2 : 0.7,
      }} />
      {/* Live dot for alert states */}
      {isAlert && (
        <div style={{ position: 'absolute', top: 12, right: 14, display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', background: accent,
            animation: 'cc-dot-blink 1.4s ease-in-out infinite',
            boxShadow: `0 0 6px ${accent}`,
          }} />
          <span style={{ fontSize: 9, fontWeight: 800, color: accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>LIVE</span>
        </div>
      )}
      <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{
        fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1,
        color: dimmed ? 'rgba(255,255,255,0.25)' : accent,
        animation: !dimmed ? 'cc-count-in 0.4s ease' : 'none',
        textShadow: !dimmed && isAlert ? `0 0 20px ${accent}60` : 'none',
      }}>{value}</div>
      {clickable && !dimmed && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10,
          color: accent, fontWeight: 700, letterSpacing: '0.06em',
          opacity: hovered ? 1 : 0.6, transition: 'opacity 0.15s',
          textTransform: 'uppercase',
        }}>
          VIEW <span style={{ fontSize: 12 }}>→</span>
        </div>
      )}
      {dimmed && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontWeight: 600, letterSpacing: '0.05em' }}>All Clear ✓</div>
      )}
    </div>
  );
}

// ── Signal Tile ───────────────────────────────────────────────
function SignalTile({ icon, label, value, accent, onClick }: { icon: string; label: string; value: string | number; accent?: string; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  const a = accent ?? 'rgba(255,255,255,0.3)';
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered && onClick
          ? `linear-gradient(160deg, ${a}18 0%, #0d0d14 70%)`
          : '#0d0d14',
        border: `1px solid ${hovered && onClick ? `${a}55` : 'rgba(255,255,255,0.07)'}`,
        borderTop: `2px solid ${a}`,
        borderRadius: D.radiusSm,
        padding: '14px 16px',
        boxShadow: hovered && onClick ? `0 0 20px ${a}25, ${D.cardShadowHover}` : D.cardShadow,
        display: 'flex', flexDirection: 'column', gap: 6,
        cursor: onClick ? 'pointer' : 'default',
        transform: hovered && onClick ? 'translateY(-3px) scale(1.02)' : 'none',
        transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: accent ?? '#e8eaf0', letterSpacing: '-0.01em' }}>{value}</div>
      {onClick && (
        <div style={{ fontSize: 10, color: a, opacity: hovered ? 1 : 0.4, fontWeight: 700, transition: 'opacity 0.15s', letterSpacing: '0.05em' }}>
          OPEN →
        </div>
      )}
    </div>
  );
}

// ── Row Item (for opportunity / risk panels) ──────────────────
function RowItem({
  label, value, accent, tag, onClick,
}: { label: string; value: string | number | ReactNode; accent?: string; tag?: string; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '9px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13,
        cursor: onClick ? 'pointer' : 'default',
        borderRadius: hovered && onClick ? 8 : 0,
        background: hovered && onClick ? (accent ? `${accent}12` : 'rgba(255,255,255,0.04)') : 'transparent',
        marginInline: hovered && onClick ? -4 : 0,
        paddingInline: hovered && onClick ? 14 : 10,
        transition: 'all 0.14s ease',
      }}>
      <span style={{ color: hovered ? '#e8eaf0' : 'rgba(255,255,255,0.65)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        {label}
        {onClick && <span style={{ fontSize: 10, color: accent ?? 'rgba(255,255,255,0.4)', opacity: hovered ? 1 : 0, transition: 'opacity 0.14s', fontWeight: 700 }}>→</span>}
      </span>
      <span style={{
        fontWeight: 800,
        color: accent ?? '#e8eaf0',
        background: accent ? `${accent}20` : 'rgba(255,255,255,0.06)',
        padding: '3px 11px',
        borderRadius: 20,
        fontSize: 12,
        border: accent ? `1px solid ${accent}35` : '1px solid rgba(255,255,255,0.08)',
        transform: hovered && onClick ? 'scale(1.06)' : 'scale(1)',
        transition: 'transform 0.14s',
      }}>
        {value}{tag ? ` ${tag}` : ''}
      </span>
    </div>
  );
}

// ── Evidence types (subset for UI) ───────────────────────────
interface EvidenceItem {
  evidenceTitle: string;
  evidenceValue?: string | null;
  evidenceNumeric?: number | null;
  evidenceType: string;
  confidence: number;
  sourceEntityType?: string | null;
}

interface EvidenceBundle {
  recommendationKey: string;
  items: EvidenceItem[];
  confidence: number;
  explanation?: {
    whyItMatters?: string;
    suggestedActions?: string[];
    expectedImpact?: string;
    evidenceSummary?: string[];
  };
}

// ── Recommendation Card ───────────────────────────────────────
function RecCard({
  rec, shopId, onDone, onDismiss,
}: {
  rec: Recommendation;
  shopId: string;
  onDone: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const cfg = PRIORITY_CFG[rec.priority] ?? PRIORITY_CFG.medium;
  const icon = CATEGORY_ICON[rec.category] ?? '📌';
  const [expanded, setExpanded] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceBundle | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  async function loadEvidence() {
    if (evidence || evidenceLoading) return;
    setEvidenceLoading(true);
    try {
      const res = await fetch(`/api/intelligence/recommendations/${rec.id}/evidence`, {
        headers: { 'x-shop-id': shopId },
      });
      if (res.ok) {
        const body = await res.json() as { evidence?: EvidenceBundle };
        if (body.evidence) setEvidence(body.evidence);
      }
    } catch { /* fail silently */ }
    finally { setEvidenceLoading(false); }
  }

  function toggleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next) loadEvidence();
  }

  const confidencePct = rec.confidence <= 1 ? Math.round(rec.confidence * 100) : Math.round(rec.confidence);

  return (
    <div style={{
      background: cfg.bg,
      border: `1.5px solid ${cfg.border}`,
      borderLeft: `4px solid ${cfg.accent}`,
      borderRadius: D.radiusSm,
      boxShadow: D.cardShadow,
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 7 }}>
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
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '2px 7px' }}>
            {confidencePct}% confidence
          </span>
          <button
            onClick={toggleExpand}
            style={{
              fontSize: 11, color: cfg.accent, background: 'transparent', border: 'none',
              cursor: 'pointer', fontWeight: 600, padding: '2px 6px', borderRadius: 5,
            }}>
            {expanded ? '▲ Less' : '▼ Evidence & Actions'}
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
            <button
              onClick={() => onDone(rec.id)}
              onMouseEnter={e => { e.currentTarget.style.background = '#059669'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#059669'; }}
              style={{ padding: '5px 14px', borderRadius: 999, border: '1.5px solid #059669', background: 'transparent', color: '#059669', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em', transition: 'background 0.15s, color 0.15s' }}>
              ✓ Done
            </button>
            <button
              onClick={() => onDismiss(rec.id)}
              style={{ padding: '5px 12px', borderRadius: 999, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>
              Dismiss
            </button>
          </div>
        </div>
      </div>

      {/* Expandable evidence panel */}
      {expanded && (
        <div style={{
          borderTop: `1px solid ${cfg.border}`,
          background: 'rgba(0,0,0,0.35)',
          padding: '14px 16px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {evidenceLoading && (
            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>
              Loading evidence…
            </div>
          )}

          {/* Evidence items */}
          {evidence && evidence.items.length > 0 && (
            <div>
              <div className="section-label" style={{ marginBottom: 8 }}>
                📊 Evidence
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {evidence.items.map((ev, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'var(--surface)', border: '1px solid var(--line)',
                    borderRadius: 6, padding: '7px 11px', fontSize: 12,
                  }}>
                    <span style={{ color: 'var(--text)', fontWeight: 500 }}>{ev.evidenceTitle}</span>
                    <span style={{ fontWeight: 700, color: cfg.accent, background: `${cfg.accent}14`, padding: '2px 9px', borderRadius: 20, fontSize: 11 }}>
                      {ev.evidenceValue ?? (ev.evidenceNumeric != null ? ev.evidenceNumeric : '—')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Why it matters */}
          {evidence?.explanation?.whyItMatters && (
            <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, background: `${cfg.accent}08`, borderRadius: 6, padding: '8px 11px', borderLeft: `3px solid ${cfg.accent}` }}>
              <strong>Why it matters:</strong> {evidence.explanation.whyItMatters}
            </div>
          )}

          {/* Expected impact */}
          {evidence?.explanation?.expectedImpact && (
            <div style={{ fontSize: 11, color: '#059669', lineHeight: 1.5 }}>
              💡 {evidence.explanation.expectedImpact}
            </div>
          )}

          {/* Suggested actions */}
          {evidence?.explanation?.suggestedActions && evidence.explanation.suggestedActions.length > 0 && (
            <div>
              <div className="section-label" style={{ marginBottom: 7 }}>
                ▶ Next Actions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {evidence.explanation.suggestedActions.map((action, i) => (
                  <div key={i} style={{
                    fontSize: 12, color: 'var(--text)', background: 'var(--surface)',
                    border: '1px solid var(--line)', borderRadius: 6, padding: '6px 11px',
                    display: 'flex', alignItems: 'center', gap: 7,
                  }}>
                    <span style={{ color: cfg.accent, fontWeight: 700, fontSize: 14 }}>→</span>
                    {action}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!evidenceLoading && !evidence && (
            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '4px 0' }}>
              Enable the evidence_engine feature flag for detailed evidence.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Action Queue Card (SI-6) ──────────────────────────────────
function ActionQueueCard({
  item, onNavigate,
}: { item: RankedAction; onNavigate: (module: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const score = item.score.decisionScore;
  const scoreColor = score >= 700 ? '#dc2626' : score >= 450 ? '#d97706' : '#2563eb';
  const timeLabel = item.score.estimatedTimeMinutes <= 5 ? `${item.score.estimatedTimeMinutes}m`
    : item.score.estimatedTimeMinutes <= 60 ? `${item.score.estimatedTimeMinutes}m`
    : `${Math.round(item.score.estimatedTimeMinutes / 60)}h`;
  const confidencePct = Math.round(item.score.confidenceMultiplier * 100);
  const rec = item.recommendation;
  const icon = CATEGORY_ICON[rec.category] ?? '📌';

  const navActions = item.quickActions.filter(a => a.module);

  return (
    <div style={{
      background: `linear-gradient(135deg, ${scoreColor}10 0%, #0d0d14 60%)`,
      border: `1px solid ${scoreColor}30`,
      borderLeft: `4px solid ${scoreColor}`,
      borderRadius: D.radiusSm,
      boxShadow: `0 0 18px ${scoreColor}15, ${D.cardShadow}`,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Rank + title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{
            fontSize: 11, fontWeight: 900, color: '#fff',
            background: scoreColor, borderRadius: '50%',
            width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>{item.rank}</span>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{rec.title}</span>
          {/* Score badge */}
          <span style={{
            fontSize: 12, fontWeight: 900, color: scoreColor,
            background: `${scoreColor}14`, borderRadius: 8,
            padding: '3px 10px', letterSpacing: '0.02em',
          }}>{score}</span>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '2px 8px' }}>
            ⏱ {timeLabel}
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted)', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '2px 8px' }}>
            {confidencePct}% confidence
          </span>
          {rec.estimatedRevenue != null && rec.estimatedRevenue > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: 'rgba(5,150,105,0.12)', borderRadius: 6, padding: '2px 8px' }}>
              💵 {fmtMoney(rec.estimatedRevenue)}
            </span>
          )}
          {/* Quick nav buttons */}
          {navActions.map((a, i) => (
            <button key={i} onClick={() => a.module && onNavigate(a.module)} style={{
              fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 999,
              border: `1.5px solid ${scoreColor}60`, background: `${scoreColor}10`,
              color: scoreColor, cursor: 'pointer',
            }}>{a.label} →</button>
          ))}
          <button onClick={() => setExpanded(e => !e)} style={{
            fontSize: 11, color: 'var(--muted)', background: 'transparent', border: 'none',
            cursor: 'pointer', fontWeight: 600, padding: '2px 6px', marginLeft: 'auto',
          }}>{expanded ? '▲ Less' : '▼ Why'}</button>
        </div>
      </div>

      {/* Expandable why + rationale */}
      {expanded && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.35)',
          padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {item.whyItMatters && (
            <div style={{
              fontSize: 12, color: 'var(--text)', lineHeight: 1.6,
              background: `${scoreColor}08`, borderRadius: 6, padding: '8px 11px',
              borderLeft: `3px solid ${scoreColor}`,
            }}>
              <strong>Why it matters:</strong> {item.whyItMatters}
            </div>
          )}
          {item.score.rationale && (
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              💡 {item.score.rationale}
            </div>
          )}
          {item.expectedImpact && (
            <div style={{ fontSize: 11, color: '#059669', fontStyle: 'italic' }}>{item.expectedImpact}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Executive Score Badge (SI-6) ──────────────────────────────
function ExecScoreBadge({ score }: { score: ExecScoreBreakdown }) {
  const color = score.overall >= 75 ? '#059669' : score.overall >= 50 ? '#d97706' : '#dc2626';
  const label = score.overall >= 75 ? 'Strong' : score.overall >= 50 ? 'Fair' : 'Needs Work';
  const trendIcon = score.trend === 'up' ? '↑' : score.trend === 'down' ? '↓' : '→';
  const components = [
    { label: 'Revenue', value: score.revenueHealth },
    { label: 'Efficiency', value: score.efficiency },
    { label: 'Risk Control', value: score.riskControl },
    { label: 'Cash Flow', value: score.cashFlow },
    { label: 'Knowledge', value: score.knowledgeGrowth },
  ];
  return (
    <div style={{
      background: `linear-gradient(135deg,${color}08,${color}04)`,
      border: `1.5px solid ${color}30`,
      borderRadius: D.radius, padding: '18px 20px',
      boxShadow: D.cardShadow,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color, lineHeight: 1 }}>{score.overall}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 3 }}>
            Executive Score <span style={{ color, fontWeight: 900 }}>{trendIcon}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Composite shop performance (0–100)</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
        {components.map(c => (
          <div key={c.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: c.value >= 15 ? color : 'var(--muted)' }}>{c.value}</div>
            <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>{c.label}</div>
          </div>
        ))}
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
    <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span>{icon}</span>
      <span>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--line)', marginLeft: 4 }} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
function fmtCur(amount: number, currency: string): string {
  const cur = CURRENCIES.find(c => c.code === currency);
  const symbol = cur?.symbol ?? currency;
  return `${symbol}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function RevenueByCurrency({ byCurrency, accent }: { byCurrency: Record<string, number>; accent: string }) {
  const entries = Object.entries(byCurrency).filter(([, v]) => v > 0);
  if (entries.length === 0) return <span style={{ color: 'rgba(255,255,255,0.25)' }}>฿0</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {entries.map(([cur, amt]) => (
        <span key={cur} style={{ fontSize: entries.length > 1 ? 22 : 32, fontWeight: 900, color: accent, lineHeight: 1.1 }}>
          {fmtCur(amt, cur)}
        </span>
      ))}
    </div>
  );
}

export function CommandCenterView() {
  const { role } = useShop();
  const dispatch = useAppDispatch();
  const shopId = getShopId();
  const { stats: liveStats } = useOperationalStats();

  function nav(module: string) {
    dispatch({ type: 'SET_MODULE', module });
  }

  const [recs, setRecs] = useState<FetchState<Recommendation[]>>({ data: null, loading: true, error: null });
  const [signals, setSignals] = useState<FetchState<SignalMap>>({ data: null, loading: true, error: null });
  const [metrics, setMetrics] = useState<ShopMetrics | null>(null);
  const [generating, setGenerating] = useState(false);
  const [tablesMissing, setTablesMissing] = useState(false);
  const [flagDisabled, setFlagDisabled] = useState(false);
  // SI-6
  const [actionQueue, setActionQueue] = useState<RankedAction[] | null>(null);
  const [execScore, setExecScore] = useState<ExecScoreBreakdown | null>(null);
  // SI-7
  const [morningBrief, setMorningBrief] = useState<MorningBriefSummary | null>(null);
  const [briefModalOpen, setBriefModalOpen] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  // SI-9
  const [businessMemory, setBusinessMemory] = useState<MemorySummaryShape | null>(null);
  // SI-10
  const [vehicleHighRiskCount, setVehicleHighRiskCount] = useState<number | null>(null);

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

  const loadActionQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/intelligence/action-queue', { headers: shopHeaders });
      if (!res.ok) return;
      const body = await res.json() as { disabled?: boolean; actionQueue?: RankedAction[]; executiveScore?: number };
      if (body.disabled) return;
      if (body.actionQueue) setActionQueue(body.actionQueue);
      if (typeof body.executiveScore === 'number') {
        // Executive score endpoint for full breakdown
        const esRes = await fetch('/api/intelligence/executive-score', { headers: shopHeaders });
        if (esRes.ok) {
          const esBody = await esRes.json() as { disabled?: boolean; score?: ExecScoreBreakdown };
          if (!esBody.disabled && esBody.score) setExecScore(esBody.score);
        }
      }
    } catch { /* fail silently — SI-6 is additive */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const loadMorningBrief = useCallback(async () => {
    try {
      const res = await fetch('/api/intelligence/morning-brief', { headers: shopHeaders });
      if (!res.ok) return;
      const body = await res.json() as { disabled?: boolean; brief?: MorningBriefSummary | null };
      if (body.disabled || !body.brief) return;
      setMorningBrief(body.brief);
    } catch { /* fail silently — SI-7 is additive */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const loadBusinessMemory = useCallback(async () => {
    try {
      const res = await fetch('/api/intelligence/memory', { headers: shopHeaders });
      if (!res.ok) return;
      const body = await res.json() as { disabled?: boolean; data?: MemorySummaryShape | null };
      if (body.disabled || !body.data) return;
      setBusinessMemory(body.data);
    } catch { /* fail silently — SI-9 is additive */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  // SI-10: Load vehicle intelligence summary — count high-risk vehicles only
  const loadVehicleIntelligence = useCallback(async () => {
    try {
      const flagRes = await fetch('/api/intelligence/vehicle/health-summary', { headers: shopHeaders }).catch(() => null);
      if (!flagRes?.ok) return;
      const body = await flagRes.json() as { disabled?: boolean; highRiskCount?: number } | null;
      if (body?.disabled || body?.highRiskCount == null) return;
      setVehicleHighRiskCount(body.highRiskCount);
    } catch { /* fail silently — SI-10 is additive */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;
    loadRecommendations();
    loadSignals();
    loadMetrics();
    loadActionQueue();
    loadMorningBrief();
    loadBusinessMemory();
    void loadVehicleIntelligence();
  }, [shopId, loadRecommendations, loadSignals, loadMetrics, loadActionQueue, loadMorningBrief, loadBusinessMemory, loadVehicleIntelligence]);

  // Below every hook, deliberately. This guard used to sit above them, which
  // meant the number of hooks this component called depended on `role`.
  //
  // `role` resolves asynchronously. The first render has it null, the guard is
  // false, and all eight hooks run. When it resolves to a technician the guard
  // returns early, those hooks are skipped, and React throws "Rendered fewer
  // hooks than during the previous render" — a white screen, not a disabled
  // state. This app has already shipped one role-resolution race, so that
  // window is real rather than theoretical.
  //
  // Running the hooks for a user who is about to be turned away costs a few
  // fetches that get discarded. Crashing costs the page.
  if (role && role !== 'owner' && role !== 'manager') {
    return <DisabledState reason="Command Center is only available to shop owners and managers." />;
  }

  async function handleGenerateBrief() {
    setGeneratingBrief(true);
    try {
      const res = await fetch('/api/intelligence/morning-brief', { method: 'POST', headers: shopHeaders });
      if (res.ok) {
        const body = await res.json() as { brief?: MorningBriefSummary };
        if (body.brief) setMorningBrief(body.brief);
      }
    } catch { /* fail silently */ }
    finally { setGeneratingBrief(false); }
  }

  async function handleDismissBrief(id: string) {
    try {
      await fetch('/api/intelligence/morning-brief', {
        method: 'PATCH',
        headers: { ...shopHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'dismiss' }),
      });
      setMorningBrief(b => b ? { ...b, status: 'dismissed' } : null);
      setBriefModalOpen(false);
    } catch { /* fail silently */ }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      await fetch('/api/intelligence/metrics', { method: 'POST', headers: shopHeaders });
      await fetch('/api/intelligence/recommendations', { method: 'POST', headers: shopHeaders });
      await Promise.all([loadRecommendations(), loadSignals(), loadMetrics()]);
      // Regenerate action queue after fresh recommendations
      void fetch('/api/intelligence/action-queue', { method: 'POST', headers: shopHeaders })
        .then(r => r.ok ? r.json() : null)
        .then((b: { disabled?: boolean; actionQueue?: RankedAction[] } | null) => {
          if (b && !b.disabled && b.actionQueue) setActionQueue(b.actionQueue);
        }).catch(() => {});
    } catch { /* fail silently */ }
    finally { setGenerating(false); }
  }

  async function handleAction(id: string, action: 'complete' | 'dismiss') {
    try {
      // Record outcome (SI-5)
      const outcomeStatus = action === 'complete' ? 'completed' : 'dismissed';
      fetch(`/api/intelligence/recommendations/${id}/outcome`, {
        method: 'POST',
        headers: { ...shopHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcomeStatus }),
      }).catch(() => {});
      // Update status (SI-2)
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
    <>
    <style>{CC_STYLES}</style>
    <Panel title="D1 Command Center">
      {/* ── Premium Header ─────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg,#1a0404 0%,#0d0d14 60%,#0a0010 100%)`,
        borderRadius: 20,
        padding: '24px 28px',
        marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        boxShadow: `0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 40px rgba(0,0,0,0.5)`,
        border: '1px solid rgba(220,38,38,0.2)',
        position: 'relative', overflow: 'hidden',
        animation: 'cc-slide-up 0.35s ease',
      }}>
        {/* Grid texture */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.025,
          backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)',
          backgroundSize: '32px 32px', pointerEvents: 'none',
        }} />
        {/* Red glow orb */}
        <div style={{
          position: 'absolute', right: -60, top: -60, width: 220, height: 220,
          borderRadius: '50%', background: 'radial-gradient(circle,rgba(220,38,38,0.18) 0%,transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* Health ring inline in header */}
          <HealthRing score={score} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)',
                borderRadius: 999, padding: '3px 10px',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626', animation: 'cc-dot-blink 1.5s ease-in-out infinite' }} />
                <span style={{ fontSize: 9, fontWeight: 800, color: '#dc2626', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Live</span>
              </div>
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
              D1 Command Center
            </h2>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Intelligence Dashboard · Owner &amp; Manager View
            </div>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            position: 'relative', display: 'flex', alignItems: 'center', gap: 9,
            padding: '12px 24px', borderRadius: 999,
            background: generating ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#dc2626,#991b1b)',
            color: '#fff', border: generating ? '1.5px solid rgba(255,255,255,0.1)' : '1.5px solid rgba(220,38,38,0.6)',
            fontWeight: 800, fontSize: 13, cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.65 : 1,
            boxShadow: generating ? 'none' : '0 4px 20px rgba(220,38,38,0.4), 0 1px 0 rgba(255,255,255,0.1) inset',
            letterSpacing: '0.025em', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { if (!generating) e.currentTarget.style.boxShadow = '0 6px 28px rgba(220,38,38,0.55), 0 1px 0 rgba(255,255,255,0.1) inset'; }}
          onMouseLeave={e => { if (!generating) e.currentTarget.style.boxShadow = '0 4px 20px rgba(220,38,38,0.4), 0 1px 0 rgba(255,255,255,0.1) inset'; }}
        >
          <span style={{ fontSize: 16, animation: generating ? 'cc-spin 1s linear infinite' : 'none', display: 'inline-block' }}>
            {generating ? '⟳' : '⚡'}
          </span>
          {generating ? 'Refreshing Intelligence…' : 'Refresh Intelligence'}
        </button>
      </div>

      {isLoading ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: 260, gap: 16, color: 'var(--muted)',
        }}>
          <div style={{ fontSize: 36, animation: 'cc-spin 1s linear infinite' }}>⟳</div>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.05em' }}>Loading intelligence data…</div>
        </div>
      ) : (
        <>
          {/* ── Section 1: KPI Summary Pills ─────────────────── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
            gap: 12, marginBottom: 24,
            animation: 'cc-slide-up 0.4s ease 0.1s both',
          }}>
            <SummaryPill icon="🚨" label="Critical" value={criticalCount}
              accent="#dc2626"
              dimmed={criticalCount === 0}
              urgency={criticalCount > 0 ? 'critical' : 'none'}
              onClick={criticalCount > 0 ? () => nav('repair-orders') : undefined} />
            <SummaryPill icon="⚠️" label="High Priority" value={highCount}
              accent="#ea580c"
              dimmed={highCount === 0}
              urgency={highCount > 0 ? 'high' : 'none'}
              onClick={highCount > 0 ? () => nav('job-cards') : undefined} />
            <SummaryPill icon="📋" label="Open Recs" value={recList.length}
              accent="#60a5fa"
              dimmed={recList.length === 0}
              urgency="none"
              onClick={recList.length > 0 ? () => nav('estimates') : undefined} />
            <SummaryPill icon="🔴" label="Overdue Invoices" value={overdueCount}
              accent="#dc2626"
              dimmed={overdueCount === 0}
              urgency={overdueCount > 0 ? 'high' : 'none'}
              onClick={overdueCount > 0 ? () => nav('invoices') : undefined} />
            <SummaryPill icon="💵" label="Revenue Today"
              value={liveStats?.revenueTodayByCurrency
                ? <RevenueByCurrency byCurrency={liveStats.revenueTodayByCurrency} accent="#22d3a0" />
                : fmtMoney(revenueToday)}
              accent="#22d3a0"
              dimmed={liveStats ? Object.values(liveStats.revenueTodayByCurrency ?? {}).every(v => v === 0) : revenueToday === 0}
              urgency="none"
              onClick={() => nav('payments')} />
            <SummaryPill icon="🔧" label="Open Jobs" value={openJobs}
              accent={openJobs > 5 ? '#f59e0b' : '#60a5fa'}
              dimmed={openJobs === 0}
              urgency={openJobs > 8 ? 'high' : 'none'}
              onClick={() => nav('job-cards')} />
          </div>

          {/* ── Operational Metrics (flagged) ─────────────────── */}
          <FeatureGate flag="command_center_operational_metrics">
            <div style={{ marginBottom: 24 }}>
              <SectionHeading icon="📊" label="Operational Metrics" />
              <OperationalMetricsSection onNav={nav} />
            </div>
          </FeatureGate>

          {/* ── Section SI-7: Morning Brief ──────────────────── */}
          {(morningBrief || true) && (() => {
            const brief = morningBrief && morningBrief.status !== 'dismissed';
            const urgencyColor = (brief && morningBrief!.cashCollection.collectionUrgency === 'critical') ? D.red
              : (brief && morningBrief!.shopHealthScore < 55) ? D.gold : D.green;
            return (
              <div style={{ marginBottom: 24 }}>
                <SectionHeading icon="☀️" label="Morning Brief" />
                {!brief ? (
                  <div style={{
                    background: '#0d0d14', border: '1.5px dashed rgba(255,255,255,0.1)',
                    borderRadius: D.radiusSm, padding: '16px 20px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>No morning brief generated yet.</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>Generate a brief to see today's executive summary.</div>
                    </div>
                    <button
                      onClick={handleGenerateBrief}
                      disabled={generatingBrief}
                      onMouseEnter={e => { if (!generatingBrief) { e.currentTarget.style.background = `linear-gradient(135deg,${D.gold},#b45309)`; e.currentTarget.style.color = '#fff'; } }}
                      onMouseLeave={e => { if (!generatingBrief) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = D.gold; } }}
                      style={{
                        padding: '9px 18px', borderRadius: 999, cursor: generatingBrief ? 'not-allowed' : 'pointer',
                        border: generatingBrief ? 'none' : `2px solid ${D.gold}`,
                        background: generatingBrief ? 'rgba(0,0,0,0.05)' : 'transparent',
                        color: generatingBrief ? 'var(--muted)' : D.gold, fontWeight: 700, fontSize: 12,
                        opacity: generatingBrief ? 0.6 : 1, whiteSpace: 'nowrap',
                        boxShadow: generatingBrief ? 'none' : `0 3px 10px ${D.gold}40`,
                        transition: 'background 0.15s, color 0.15s',
                      }}>
                      {generatingBrief ? '⟳ Generating…' : '☀️ Generate Brief'}
                    </button>
                  </div>
                ) : (
                  <div style={{
                    background: `linear-gradient(135deg,${urgencyColor}06,${urgencyColor}03)`,
                    border: `1.5px solid ${urgencyColor}30`,
                    borderLeft: `4px solid ${urgencyColor}`,
                    borderRadius: D.radiusSm, padding: '16px 18px',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    {/* Title + scores */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{morningBrief!.title}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                          {morningBrief!.briefDate} · {new Date(morningBrief!.generatedAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ fontSize: 11, background: `${urgencyColor}14`, color: urgencyColor, borderRadius: 7, padding: '3px 10px', fontWeight: 700 }}>
                          Health {morningBrief!.shopHealthScore}
                        </span>
                        <span style={{ fontSize: 11, background: 'rgba(0,0,0,0.05)', color: 'var(--muted)', borderRadius: 7, padding: '3px 10px', fontWeight: 600 }}>
                          Exec {morningBrief!.executiveScore}
                        </span>
                      </div>
                    </div>
                    {/* Recommended focus */}
                    <div style={{
                      fontSize: 12, color: 'var(--text)', lineHeight: 1.6,
                      background: `${D.gold}10`, borderRadius: 6, padding: '8px 10px',
                      borderLeft: `3px solid ${D.gold}`,
                    }}>
                      <strong style={{ color: D.gold }}>⭐ Focus:</strong> {morningBrief!.recommendedFocus}
                    </div>
                    {/* Top 3 priorities inline */}
                    {morningBrief!.todayPriorities.slice(0, 3).map(p => (
                      <div key={p.rank} style={{
                        display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)',
                      }}>
                        <span style={{
                          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                          background: p.decisionScore >= 700 ? D.red : p.decisionScore >= 450 ? D.gold : D.blue,
                          color: '#fff', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{p.rank}</span>
                        <span style={{ flex: 1 }}>{p.title}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>⏱ {p.estimatedTimeMinutes}m</span>
                      </div>
                    ))}
                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                      <button
                        onClick={handleGenerateBrief}
                        disabled={generatingBrief}
                        onMouseEnter={e => { if (!generatingBrief) { e.currentTarget.style.background = D.gold; e.currentTarget.style.color = '#fff'; } }}
                        onMouseLeave={e => { if (!generatingBrief) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = D.gold; } }}
                        style={{
                          fontSize: 11, padding: '6px 14px', borderRadius: 999, border: `1.5px solid ${D.gold}60`,
                          background: 'transparent', color: D.gold, fontWeight: 700, cursor: 'pointer',
                          opacity: generatingBrief ? 0.6 : 1, transition: 'background 0.15s, color 0.15s',
                        }}>
                        {generatingBrief ? '⟳ Refreshing…' : '↺ Refresh Brief'}
                      </button>
                      <button
                        onClick={() => setBriefModalOpen(true)}
                        style={{
                          fontSize: 11, padding: '6px 14px', borderRadius: 999, border: '1.5px solid var(--line)',
                          background: 'var(--surface)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer',
                        }}>
                        📋 View Full Brief
                      </button>
                      <button
                        onClick={() => handleDismissBrief(morningBrief!.id)}
                        style={{
                          fontSize: 11, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--line)',
                          background: 'transparent', color: 'var(--muted)', cursor: 'pointer',
                        }}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Section SI-6: Today's Action Queue ───────────── */}
          {actionQueue && actionQueue.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <SectionHeading icon="🎯" label="Today's Action Queue" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {actionQueue.map(item => (
                  <ActionQueueCard key={item.recommendation.id} item={item} onNavigate={nav} />
                ))}
              </div>
            </div>
          )}

          {/* ── Section 2: Top Priorities ────────────────────── */}
          <div style={{ marginBottom: 24 }}>
            <SectionHeading icon="🎯" label="Top Priorities" />
            {top5.length === 0 ? (
              <div style={{
                background: 'linear-gradient(135deg,rgba(34,211,160,0.12),rgba(34,211,160,0.04))',
                border: '1.5px solid rgba(74,222,128,0.3)',
                borderRadius: D.radiusSm,
                padding: '20px 24px',
                textAlign: 'center',
                color: '#4ade80', fontSize: 13, fontWeight: 700,
                boxShadow: '0 0 20px rgba(34,211,160,0.1)',
              }}>
                ✅ Your shop is clear. No urgent recommendations right now.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {top5.map(r => (
                  <RecCard key={r.id} rec={r} shopId={shopId} onDone={id => handleAction(id, 'complete')} onDismiss={id => handleAction(id, 'dismiss')} />
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
              background: `linear-gradient(160deg, rgba(34,211,160,0.08) 0%, #0d0d14 50%)`,
              border: `1px solid rgba(34,211,160,0.18)`,
              borderTop: `2px solid ${D.green}`,
              borderRadius: D.radius,
              padding: '18px 20px',
              boxShadow: `0 0 24px rgba(34,211,160,0.08), ${D.cardShadow}`,
            }}>
              <SectionHeading icon="💵" label="Revenue Opportunities" />
              <RowItem label="Unpaid invoices"         value={unpaidCount}  tag="invoices"  accent={unpaidCount  > 0 ? '#ea580c' : undefined} onClick={() => nav('invoices')} />
              <RowItem label="Stale estimates"         value={staleEst}     tag="estimates" accent={staleEst     > 0 ? '#ea580c' : undefined} onClick={() => nav('estimates')} />
              <RowItem label="Completed, not invoiced" value={notInvoiced}  tag="jobs"      accent={notInvoiced  > 0 ? '#dc2626' : undefined} onClick={() => nav('job-cards')} />
              <RowItem label="Revenue today"
                value={liveStats?.revenueTodayByCurrency && Object.keys(liveStats.revenueTodayByCurrency).length > 0
                  ? Object.entries(liveStats.revenueTodayByCurrency).filter(([,v]) => v > 0).map(([cur, amt]) => fmtCur(amt, cur)).join(' + ') || '—'
                  : fmtMoney(revenueToday)}
                accent={revenueToday > 0 ? D.green : undefined} onClick={() => nav('payments')} />
              {revenueOpportunity > 0 && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(34,211,160,0.12)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>Total Opportunity</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: '#4ade80' }}>{fmtMoney(revenueOpportunity)}</span>
                </div>
              )}
            </div>

            {/* Risks */}
            <div style={{
              background: `linear-gradient(160deg, rgba(231,76,60,0.08) 0%, #0d0d14 50%)`,
              border: `1px solid rgba(231,76,60,0.18)`,
              borderTop: `2px solid ${D.red}`,
              borderRadius: D.radius,
              padding: '18px 20px',
              boxShadow: `0 0 24px rgba(231,76,60,0.08), ${D.cardShadow}`,
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

          {/* ── Section SI-6: Executive Score ────────────────── */}
          {execScore && (
            <div style={{ marginBottom: 24 }}>
              <ExecScoreBadge score={execScore} />
            </div>
          )}

          {/* ── Section SI-9: Business Memory ────────────────── */}
          {businessMemory && (businessMemory.criticalCount > 0 || businessMemory.highCount > 0) && (
            <div style={{ marginBottom: 24 }}>
              <SectionHeading icon="🧠" label="Business Memory" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {businessMemory.topItems.map(item => {
                  const impColor =
                    item.importance === 'critical' ? '#dc2626' :
                    item.importance === 'high'     ? '#ea580c' :
                    item.importance === 'medium'   ? '#d97706' : 'var(--muted)';
                  return (
                    <div key={item.id} style={{
                      background: `${impColor}06`,
                      border: `1px solid ${impColor}25`,
                      borderLeft: `3px solid ${impColor}`,
                      borderRadius: D.radiusSm,
                      padding: '10px 14px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: item.summary ? 2 : 0 }}>{item.title}</div>
                        {item.summary && <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{item.summary}</div>}
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: impColor,
                        background: `${impColor}14`, borderRadius: 20,
                        padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0,
                        textTransform: 'capitalize',
                      }}>{item.importance}</span>
                    </div>
                  );
                })}
                {businessMemory.totalItems > businessMemory.topItems.length && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', paddingTop: 2 }}>
                    +{businessMemory.totalItems - businessMemory.topItems.length} more memory items stored
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SI-10: Vehicle Intelligence Alerts ───────────── */}
          {vehicleHighRiskCount != null && vehicleHighRiskCount > 0 && (
            <div style={{ marginBottom: 8 }}>
              <SectionHeading icon="🚗" label="Vehicle Intelligence" />
              <div style={{
                background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10,
                padding: '10px 14px', fontSize: 13, color: '#f87171', display: 'flex',
                alignItems: 'center', gap: 8, boxShadow: '0 0 16px rgba(231,76,60,0.12)',
              }}>
                <span style={{ fontWeight: 700 }}>⚠️ {vehicleHighRiskCount} high-risk vehicle{vehicleHighRiskCount === 1 ? '' : 's'} flagged</span>
                <span style={{ color: '#b91c1c', fontSize: 12 }}>— open Vehicles module to review</span>
              </div>
            </div>
          )}

          {/* ── Section 5: Live Signals ───────────────────────── */}
          <div style={{ marginBottom: 8 }}>
            <SectionHeading icon="📡" label="Live Signals" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
              <SignalTile icon="💳" label="Payments Today"     value={fmtNum(paymentsToday)}
                accent={paymentsToday > 0 ? D.blue : undefined} onClick={() => nav('payments')} />
              <SignalTile icon="📋" label="Stale Estimates"    value={fmtNum(staleEst)}
                accent={staleEst > 0 ? '#ea580c' : undefined} onClick={() => nav('estimates')} />
              <SignalTile icon="📦" label="Low Inventory"      value={fmtNum(lowInv)}
                accent={lowInv > 0 ? '#ea580c' : undefined} onClick={() => nav('parts')} />
              <SignalTile icon="🗂️" label="Repair Cases Today" value={fmtNum(repairCases)}
                accent={repairCases > 0 ? D.green : undefined} onClick={() => nav('repair-intelligence')} />
              <SignalTile icon="🏦" label="Unpaid Invoices"    value={fmtNum(unpaidCount)}
                accent={unpaidCount > 0 ? '#ea580c' : undefined} onClick={() => nav('invoices')} />
              <SignalTile icon="⛽" label="Jobs Stuck"         value={fmtNum(stuckJobs)}
                accent={stuckJobs > 0 ? D.red : undefined} onClick={() => nav('repair-orders')} />
            </div>
          </div>

          {recs.error && (
            <div style={{ padding: '10px 14px', background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, fontSize: 12, color: '#f87171', marginTop: 12 }}>
              ⚠️ {recs.error}
            </div>
          )}

          {/* SI-11: Intelligence Learning Dashboard (additive, flag-gated, isolated) */}
          <Suspense fallback={null}>
            <LearningDashboardSection shopId={shopId} role={role} />
          </Suspense>
        </>
      )}
    </Panel>

    {/* SI-7: Morning Brief Modal */}
    {briefModalOpen && morningBrief && morningBrief.status !== 'dismissed' && (
      <MorningBriefModal
        brief={morningBrief as Parameters<typeof MorningBriefModal>[0]['brief']}
        onClose={() => setBriefModalOpen(false)}
        onDismiss={handleDismissBrief}
      />
    )}
    </>
  );
}
