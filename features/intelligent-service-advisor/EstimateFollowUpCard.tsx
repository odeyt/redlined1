'use client';

import React from 'react';
import type { FollowUpRecommendation } from '@/intelligence/service-advisor/types';
import { ApprovalOpportunityCard } from './ApprovalOpportunityCard';

interface Props {
  recommendations: FollowUpRecommendation[];
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'var(--color-danger, #e53e3e)',
  high: 'var(--color-warning, #d97706)',
  medium: 'var(--text-primary)',
  low: 'var(--text-secondary)',
};

export function EstimateFollowUpCard({ recommendations }: Props) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  if (recommendations.length === 0) return null;

  return (
    <div className="advisor-card">
      <div className="advisor-card__header">
        <span className="advisor-card__title">Estimate Follow-Up</span>
        <span className="advisor-card__badge">{recommendations.length}</span>
      </div>
      {recommendations.map(rec => (
        <div key={rec.estimateId} className="advisor-followup">
          <div className="advisor-followup__header" onClick={() => setExpanded(e => e === rec.estimateId ? null : rec.estimateId)}>
            <span style={{ color: PRIORITY_COLOR[rec.priority], fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
              {rec.priority}
            </span>
            <span className="advisor-followup__value">
              {rec.estimateValue != null ? ` $${rec.estimateValue.toFixed(0)}` : ''} · {rec.estimateAge}d old
            </span>
          </div>
          <p className="advisor-followup__reason">{rec.reason}</p>
          {expanded === rec.estimateId && (
            <>
              <ApprovalOpportunityCard opportunity={rec.opportunityScore} />
              <div className="advisor-followup__actions">
                {rec.suggestedActions.map(a => (
                  <span key={a.actionType} className="advisor-followup__action">{a.label}</span>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
