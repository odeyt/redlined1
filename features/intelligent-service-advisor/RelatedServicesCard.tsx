'use client';

import React from 'react';
import type { ServiceAdvisorSuggestion } from '@/intelligence/service-advisor/types';
import { AdvisorEvidenceDrawer } from './AdvisorEvidenceDrawer';
import { AdvisorSuggestionActions } from './AdvisorSuggestionActions';

interface Props {
  suggestions: ServiceAdvisorSuggestion[];
  onAccept: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}

export function RelatedServicesCard({ suggestions, onAccept, onDismiss }: Props) {
  const visible = suggestions.filter(s => s.suggestionType === 'related_service' || s.suggestionType === 'declined_work');

  if (visible.length === 0) return null;

  return (
    <div className="advisor-card">
      <div className="advisor-card__header">
        <span className="advisor-card__title">Related Services to Review</span>
        <span className="advisor-card__badge">{visible.length}</span>
      </div>
      <p className="advisor-card__disclaimer">
        All suggestions are evidence-backed and require technician verification before quoting.
      </p>
      {visible.map(s => (
        <div key={s.id} className="advisor-suggestion">
          <div className="advisor-suggestion__header">
            <span className="advisor-suggestion__priority" data-priority={s.priority}>{s.priority.toUpperCase()}</span>
            <span className="advisor-suggestion__title">{s.title}</span>
          </div>
          {s.explanation && <p className="advisor-suggestion__explanation">{s.explanation}</p>}
          {s.estimatedRevenue != null && (
            <p className="advisor-suggestion__revenue">Est. value: ${s.estimatedRevenue.toFixed(2)}</p>
          )}
          <AdvisorEvidenceDrawer evidence={s.evidence} />
          <AdvisorSuggestionActions suggestion={s} onAccept={onAccept} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
