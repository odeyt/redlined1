'use client';

import React, { useState } from 'react';
import type { CustomerExplanation } from '@/intelligence/service-advisor/types';

interface Props {
  explanation: CustomerExplanation;
  onCopy?: (text: string) => void;
}

export function CustomerExplanationCard({ explanation, onCopy }: Props) {
  const [editedSummary, setEditedSummary] = useState(explanation.plainLanguageSummary);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = buildCopyText(explanation, editedSummary);
    navigator.clipboard.writeText(text).catch(() => null);
    if (onCopy) onCopy(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="advisor-card">
      <div className="advisor-card__header">
        <span className="advisor-card__title">Customer Explanation</span>
        <button className="btn btn--sm btn--secondary" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy Text'}
        </button>
      </div>

      <p className="advisor-card__disclaimer">{explanation.disclaimer}</p>

      <div className="advisor-explanation__section">
        <label className="advisor-explanation__label">Summary (editable)</label>
        <textarea
          className="advisor-explanation__textarea"
          value={editedSummary}
          onChange={e => setEditedSummary(e.target.value)}
          rows={4}
        />
      </div>

      {explanation.safetyItems.length > 0 && (
        <div className="advisor-explanation__section">
          <label className="advisor-explanation__label">Safety Items</label>
          {explanation.safetyItems.map((item, idx) => (
            <p key={idx} className="advisor-explanation__safety">{item}</p>
          ))}
        </div>
      )}

      {explanation.findingExplanations.length > 0 && (
        <div className="advisor-explanation__section">
          <label className="advisor-explanation__label">Finding Details</label>
          {explanation.findingExplanations.map((f, idx) => (
            <div key={idx} className="advisor-explanation__finding">
              <strong>{f.findingName}</strong>
              <p>{f.whatWasFound}</p>
              <p>{f.whyItMatters}</p>
              <p>{f.recommendation}</p>
            </div>
          ))}
        </div>
      )}

      {explanation.declinedWorkReminders.length > 0 && (
        <div className="advisor-explanation__section">
          <label className="advisor-explanation__label">Previously Declined Work</label>
          {explanation.declinedWorkReminders.map((r, idx) => (
            <p key={idx} className="advisor-explanation__declined">{r}</p>
          ))}
        </div>
      )}

      <p className="advisor-card__footer">
        Generated {new Date(explanation.generatedAt).toLocaleString()} · Review before sending · Human review required
      </p>
    </div>
  );
}

function buildCopyText(explanation: CustomerExplanation, editedSummary: string): string {
  const parts: string[] = [editedSummary];
  if (explanation.safetyItems.length > 0) {
    parts.push('\nSAFETY ITEMS:\n' + explanation.safetyItems.join('\n'));
  }
  if (explanation.findingExplanations.length > 0) {
    parts.push('\nFINDINGS:\n' + explanation.findingExplanations.map(f => `${f.findingName}: ${f.whatWasFound}`).join('\n'));
  }
  return parts.join('\n');
}
