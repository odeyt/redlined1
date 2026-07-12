'use client';

import { useState, useEffect } from 'react';
import { IntelligenceLearningErrorBoundary } from './IntelligenceLearningErrorBoundary';

interface Props {
  recommendationId: string;
  onClose?: () => void;
}

function OutcomeFormInner({ recommendationId, onClose }: Props) {
  const [flagEnabled, setFlagEnabled] = useState<boolean | null>(null);
  const [revenue, setRevenue]         = useState('');
  const [timeSaved, setTimeSaved]     = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/intelligence/learning/summary')
      .then(r => r.json())
      .then((d: { adjustmentsEnabled?: boolean }) => setFlagEnabled(!!d?.adjustmentsEnabled))
      .catch(() => setFlagEnabled(false));
  }, []);

  if (flagEnabled === null || !flagEnabled) return null;

  if (submitted) {
    return (
      <p style={{ fontSize: 13, color: '#059669', margin: 0 }}>
        Outcome recorded. Pending verification.
      </p>
    );
  }

  async function handleSubmit() {
    const revenueNum  = revenue  ? parseFloat(revenue)  : undefined;
    const timeSavedNum = timeSaved ? parseFloat(timeSaved) : undefined;

    if (revenueNum !== undefined && isNaN(revenueNum)) {
      setError('Revenue must be a number.');
      return;
    }
    if (timeSavedNum !== undefined && isNaN(timeSavedNum)) {
      setError('Time saved must be a number.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/intelligence/learning/outcome', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          recommendationId,
          realizedRevenue:            revenueNum,
          realizedTimeSavedMinutes:   timeSavedNum,
        }),
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (body.ok) {
        setSubmitted(true);
      } else {
        setError(body.error ?? 'Submission failed.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: '#374151' }}>Record outcome (optional)</p>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Revenue realized ($)</label>
          <input
            type="number"
            min="0"
            value={revenue}
            onChange={e => setRevenue(e.target.value)}
            placeholder="0.00"
            style={{ width: '100%', padding: '5px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Time saved (min)</label>
          <input
            type="number"
            min="0"
            value={timeSaved}
            onChange={e => setTimeSaved(e.target.value)}
            placeholder="0"
            style={{ width: '100%', padding: '5px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {error && <p style={{ margin: 0, color: '#dc2626', fontSize: 12 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSubmit}
          disabled={submitting || (!revenue && !timeSaved)}
          onMouseEnter={e => { if (!submitting && (revenue || timeSaved)) { e.currentTarget.style.background = '#059669'; e.currentTarget.style.color = '#fff'; } }}
          onMouseLeave={e => { if (!submitting && (revenue || timeSaved)) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#059669'; } }}
          style={{
            flex:         1,
            padding:      '7px 0',
            background:   'transparent',
            color:        (submitting || (!revenue && !timeSaved)) ? '#9ca3af' : '#059669',
            border:       (submitting || (!revenue && !timeSaved)) ? '2px solid #9ca3af' : '2px solid #059669',
            borderRadius: 999,
            fontWeight:   600,
            fontSize:     13,
            cursor:       (submitting || (!revenue && !timeSaved)) ? 'not-allowed' : 'pointer',
            transition:   'background .15s, color .15s',
          }}
        >
          {submitting ? 'Saving...' : 'Save Outcome'}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            style={{ padding: '7px 14px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export function RecommendationOutcomeForm(props: Props) {
  return (
    <IntelligenceLearningErrorBoundary>
      <OutcomeFormInner {...props} />
    </IntelligenceLearningErrorBoundary>
  );
}
