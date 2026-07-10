'use client';

import React, { useState } from 'react';
import type { AdvisorEvidence } from '@/intelligence/service-advisor/types';

interface Props {
  evidence: AdvisorEvidence[];
}

export function AdvisorEvidenceDrawer({ evidence }: Props) {
  const [open, setOpen] = useState(false);

  if (evidence.length === 0) return null;

  return (
    <div className="advisor-evidence">
      <button
        className="advisor-evidence__toggle"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        {open ? 'Hide' : 'View'} evidence ({evidence.length})
      </button>
      {open && (
        <ul className="advisor-evidence__list">
          {evidence.map((e, idx) => (
            <li key={idx} className="advisor-evidence__item">
              <span className="advisor-evidence__source">[{e.sourceType}]</span>
              <span className="advisor-evidence__description">{e.description}</span>
              <span className="advisor-evidence__confidence">Confidence: {Math.round(e.confidence * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
