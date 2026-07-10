'use client';

import type { RulePerformanceSummary } from '@/intelligence/learning/types';

interface Props {
  rule: RulePerformanceSummary;
}

const STATUS_CFG: Record<RulePerformanceSummary['status'], { label: string; color: string; bg: string }> = {
  collecting_data: { label: 'Collecting data', color: '#6b7280', bg: '#f3f4f6' },
  active:          { label: 'Active',           color: '#2563eb', bg: '#eff6ff' },
  trusted:         { label: 'Trusted',          color: '#059669', bg: '#ecfdf5' },
  low_performing:  { label: 'Low performing',   color: '#dc2626', bg: '#fef2f2' },
};

export function RulePerformanceCard({ rule }: Props) {
  const cfg = STATUS_CFG[rule.status] ?? STATUS_CFG.collecting_data;

  return (
    <div style={{
      background:   '#fff',
      border:       '1px solid #e5e7eb',
      borderRadius: 12,
      padding:      14,
      display:      'flex',
      flexDirection: 'column',
      gap:          8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#111827' }}>{rule.ruleKey}</p>
          <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>{rule.category}</p>
        </div>
        <span style={{
          padding:      '2px 8px',
          borderRadius: 20,
          fontSize:     11,
          fontWeight:   600,
          color:        cfg.color,
          background:   cfg.bg,
        }}>
          {cfg.label}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Stat label="Sample size"    value={String(rule.sampleSize)} />
        <Stat label="Action rate"    value={pct(rule.actionRate)} />
        <Stat label="Avg usefulness" value={rule.averageUsefulness > 0 ? rule.averageUsefulness.toFixed(1) + '/5' : '—'} />
        <Stat label="Confidence adj" value={fmtAdj(rule.confidenceAdjustment)} highlight />
        <Stat label="Ranking adj"    value={fmtAdj(rule.rankingAdjustment)} highlight />
        <Stat label="Revenue"        value={rule.totalRevenueRealized > 0 ? '$' + Math.round(rule.totalRevenueRealized).toLocaleString() : '—'} />
      </div>

      {rule.lastCalculatedAt && (
        <p style={{ margin: 0, fontSize: 10, color: '#9ca3af' }}>
          Last calculated: {new Date(rule.lastCalculatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function pct(n: number) {
  return Math.round(n * 100) + '%';
}

function fmtAdj(n: number) {
  if (n === 0) return '0';
  return (n > 0 ? '+' : '') + n;
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 10, color: '#6b7280' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 13, fontWeight: highlight ? 700 : 500, color: '#111827' }}>{value}</p>
    </div>
  );
}
