'use client';

import { useEffect, useState } from 'react';
import { IntelligenceLearningErrorBoundary } from './IntelligenceLearningErrorBoundary';
import type { LearningHealthStatus } from '@/intelligence/learning/types';

interface Props {
  shopId: string;
  role:   string | null | undefined;
}

function LearningDashboardSectionInner({ role }: Props) {
  const [status, setStatus]   = useState<LearningHealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const canView = role === 'owner' || role === 'manager';

  useEffect(() => {
    if (!canView) { setLoading(false); return; }

    fetch('/api/intelligence/learning/summary')
      .then(r => {
        if (!r.ok) throw new Error('not_ok');
        return r.json() as Promise<LearningHealthStatus & { disabled?: boolean }>;
      })
      .then(d => {
        if (d?.disabled || !d?.learningEnabled) {
          setStatus(null);
        } else {
          setStatus(d);
        }
      })
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, [canView]);

  if (!canView || loading || !status) return null;

  const noData = status.totalFeedbackSubmitted === 0;

  return (
    <div style={{ marginTop: 16 }}>
      {/* Section heading */}
      <div className="section-label" style={{
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        marginBottom: 12,
      }}>
        <span>🧠</span>
        <span>Intelligence Learning</span>
        <div style={{ flex: 1, height: 1, background: 'var(--line)', marginLeft: 4 }} />
      </div>

      {noData ? (
        <div style={{
          background:   '#f8fafc',
          border:       '1px solid #e2e8f0',
          borderRadius: 10,
          padding:      '12px 14px',
          fontSize:     13,
          color:        '#64748b',
        }}>
          Learning data is being collected. At least 20 verified outcomes are required before scoring adjustments begin.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          <LearningTile label="Rules evaluated"   value={String(status.totalRules)} />
          <LearningTile label="Collecting data"   value={String(status.rulesCollectingData)} />
          <LearningTile label="Trusted rules"     value={String(status.rulesTrusted)}      accent="#059669" />
          <LearningTile label="Low performing"    value={String(status.rulesLowPerforming)} accent={status.rulesLowPerforming > 0 ? '#dc2626' : undefined} />
          <LearningTile label="Feedback received" value={String(status.totalFeedbackSubmitted)} />
          <LearningTile label="Verified revenue"  value={status.totalVerifiedRevenue > 0 ? '$' + Math.round(status.totalVerifiedRevenue).toLocaleString() : '—'} accent="#059669" />
          <LearningTile
            label="Avg usefulness"
            value={status.averageUsefulnessAllRules > 0 ? status.averageUsefulnessAllRules.toFixed(1) + '/5' : '—'}
          />
        </div>
      )}
    </div>
  );
}

function LearningTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      background:   'var(--card-bg, #fff)',
      border:       '1px solid var(--line, #e5e7eb)',
      borderRadius: 9,
      padding:      '8px 10px',
    }}>
      <p style={{ margin: 0, fontSize: 10, color: 'var(--muted, #6b7280)', marginBottom: 2 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: accent ?? 'var(--fg, #111827)' }}>{value}</p>
    </div>
  );
}

export function LearningDashboardSection(props: Props) {
  return (
    <IntelligenceLearningErrorBoundary>
      <LearningDashboardSectionInner {...props} />
    </IntelligenceLearningErrorBoundary>
  );
}
