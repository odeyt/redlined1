'use client';

import { useEffect, useState } from 'react';

interface Props {
  adjustment: number;
}

// Shows a compact learned-adjustment badge next to recommendation confidence.
// Returns null when adjustment is 0 or when the recommendation_feedback flag is off.
export function LearningConfidenceBadge({ adjustment }: Props) {
  const [flagEnabled, setFlagEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/intelligence/learning/summary')
      .then(r => r.json())
      .then((d: { adjustmentsEnabled?: boolean }) => {
        setFlagEnabled(!!d?.adjustmentsEnabled);
      })
      .catch(() => { /* flag stays false */ });
  }, []);

  if (!flagEnabled || adjustment === 0) return null;

  const positive = adjustment > 0;
  const color = positive ? '#059669' : '#dc2626';
  const sign  = positive ? '+' : '';

  return (
    <span
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          2,
        background:   positive ? '#ecfdf5' : '#fef2f2',
        border:       `1px solid ${positive ? '#6ee7b7' : '#fca5a5'}`,
        borderRadius: 6,
        padding:      '1px 6px',
        fontSize:     11,
        fontWeight:   600,
        color,
        marginLeft:   4,
        verticalAlign: 'middle',
      }}
      title={`Learned adjustment: ${sign}${adjustment} based on verified outcomes`}
    >
      {sign}{adjustment} learned
    </span>
  );
}
