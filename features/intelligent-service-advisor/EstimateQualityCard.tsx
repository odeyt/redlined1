'use client';

import React from 'react';
import type { EstimateQualityReview, EstimateQualityIssue } from '@/intelligence/service-advisor/types';

interface Props {
  review: EstimateQualityReview;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'var(--color-danger, #e53e3e)',
  warning: 'var(--color-warning, #d97706)',
  info: 'var(--color-info, #3182ce)',
};

export function EstimateQualityCard({ review }: Props) {
  const criticalCount = review.issues.filter(i => i.severity === 'critical').length;
  const warningCount = review.issues.filter(i => i.severity === 'warning').length;

  return (
    <div className="advisor-card">
      <div className="advisor-card__header">
        <span className="advisor-card__title">Estimate Quality Review</span>
        <QualityScoreBadge score={review.qualityScore} />
      </div>

      {review.dataQualityWarning && (
        <p className="advisor-card__warning">{review.dataQualityWarning}</p>
      )}

      {review.issues.length === 0 ? (
        <p className="advisor-card__empty">No quality issues found.</p>
      ) : (
        <div className="advisor-card__summary">
          {criticalCount > 0 && <span style={{ color: SEVERITY_COLOR.critical }}>{criticalCount} critical</span>}
          {warningCount > 0 && <span style={{ color: SEVERITY_COLOR.warning, marginLeft: criticalCount > 0 ? 8 : 0 }}>{warningCount} warning</span>}
        </div>
      )}

      {review.issues.map((issue, idx) => (
        <IssueRow key={`${issue.ruleKey}-${idx}`} issue={issue} />
      ))}

      <p className="advisor-card__footer">Checked {new Date(review.checkedAt).toLocaleString()}</p>
    </div>
  );
}

function QualityScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'var(--color-success, #38a169)' : score >= 60 ? 'var(--color-warning, #d97706)' : 'var(--color-danger, #e53e3e)';
  return (
    <span style={{ fontWeight: 700, color, fontSize: 14 }}>
      {score}/100
    </span>
  );
}

function IssueRow({ issue }: { issue: EstimateQualityIssue }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="advisor-issue" style={{ borderLeft: `3px solid ${SEVERITY_COLOR[issue.severity] ?? '#999'}` }}>
      <button className="advisor-issue__toggle" onClick={() => setExpanded(v => !v)}>
        <span className="advisor-issue__title">{issue.title}</span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="advisor-issue__detail">
          <p>{issue.description}</p>
          <p className="advisor-issue__recommendation">{issue.recommendation}</p>
        </div>
      )}
    </div>
  );
}
