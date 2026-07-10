'use client';

import React from 'react';
import type { ApprovalOpportunity } from '@/intelligence/service-advisor/types';

interface Props {
  opportunity: ApprovalOpportunity;
}

export function ApprovalOpportunityCard({ opportunity }: Props) {
  const score = opportunity.finalScore;
  const color = score >= 70 ? 'var(--color-success, #38a169)' : score >= 40 ? 'var(--color-warning, #d97706)' : 'var(--color-danger, #e53e3e)';

  return (
    <div className="advisor-card">
      <div className="advisor-card__header">
        <span className="advisor-card__title">Follow-Up Opportunity Score</span>
        <span style={{ fontWeight: 700, color, fontSize: 18 }}>{score}<span style={{ fontSize: 12, fontWeight: 400 }}>/100</span></span>
      </div>

      <p className="advisor-card__disclaimer">
        This is a transparent estimate based on available data — not a guaranteed approval prediction.
      </p>

      {opportunity.dataQualityWarning && (
        <p className="advisor-card__warning">{opportunity.dataQualityWarning}</p>
      )}

      <div className="advisor-opportunity__factors">
        <div>
          <p className="advisor-opportunity__label">Base score: {opportunity.baseScore}</p>
          {opportunity.positiveFactors.map(f => (
            <p key={f.key} className="advisor-opportunity__positive">+ {f.label} (+{f.impact})</p>
          ))}
          {opportunity.negativeFactors.map(f => (
            <p key={f.key} className="advisor-opportunity__negative">− {f.label} ({f.impact})</p>
          ))}
        </div>
      </div>

      <p className="advisor-card__footer">Calculated {new Date(opportunity.calculatedAt).toLocaleString()}</p>
    </div>
  );
}
