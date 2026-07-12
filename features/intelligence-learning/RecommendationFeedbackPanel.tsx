'use client';

import { useState, useEffect } from 'react';
import { IntelligenceLearningErrorBoundary } from './IntelligenceLearningErrorBoundary';
import type { RecommendationFeedbackType, RecommendationResultStatus } from '@/intelligence/learning/types';

interface Props {
  recommendationId: string;
  onClose: () => void;
}

const FEEDBACK_OPTIONS: { value: RecommendationFeedbackType; label: string }[] = [
  { value: 'correct',              label: 'Correct — this was the right recommendation' },
  { value: 'partially_correct',    label: 'Partially correct — helped but not quite right' },
  { value: 'incorrect',            label: 'Incorrect — this did not apply' },
  { value: 'needs_more_information', label: 'Needs more information' },
];

const RESULT_OPTIONS: { value: RecommendationResultStatus; label: string }[] = [
  { value: 'successful',           label: 'Revenue collected' },
  { value: 'successful',           label: 'Estimate approved' },
  { value: 'successful',           label: 'Job completed' },
  { value: 'successful',           label: 'Risk avoided' },
  { value: 'partially_successful', label: 'Time saved' },
  { value: 'not_measured',         label: 'No measurable result' },
  { value: 'unsuccessful',         label: 'Unsuccessful' },
  { value: 'unknown',              label: 'Unknown' },
];

function FeedbackPanelInner({ recommendationId, onClose }: Props) {
  const [feedbackEnabled, setFeedbackEnabled] = useState<boolean | null>(null);
  const [feedbackType, setFeedbackType]       = useState<RecommendationFeedbackType | ''>('');
  const [usefulnessScore, setUsefulnessScore] = useState<number | null>(null);
  const [resultStatus, setResultStatus]       = useState<string>('');
  const [comment, setComment]                 = useState('');
  const [submitting, setSubmitting]           = useState(false);
  const [submitted, setSubmitted]             = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/intelligence/learning/summary')
      .then(r => r.json())
      .then((d: { learningEnabled?: boolean }) => setFeedbackEnabled(!!d?.learningEnabled))
      .catch(() => setFeedbackEnabled(false));
  }, []);

  if (feedbackEnabled === null) return null; // loading
  if (!feedbackEnabled) return null;         // flag off

  if (submitted) {
    return (
      <div style={{ padding: 16, background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 10 }}>
        <p style={{ margin: 0, color: '#065f46', fontWeight: 600, fontSize: 14 }}>
          Feedback recorded. Thank you.
        </p>
        <button
          onClick={onClose}
          style={{ marginTop: 10, fontSize: 12, color: '#059669', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Close
        </button>
      </div>
    );
  }

  async function handleSubmit() {
    if (!feedbackType) {
      setError('Please select a feedback type.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/intelligence/learning/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          recommendationId,
          feedbackType,
          usefulnessScore: usefulnessScore ?? undefined,
          resultStatus:    resultStatus || undefined,
          comment:         comment.trim() || undefined,
        }),
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (body.ok) {
        setSubmitted(true);
      } else {
        setError(body.error ?? 'Submission failed. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      background:   '#fff',
      border:       '1px solid #e5e7eb',
      borderRadius: 12,
      padding:      16,
      boxShadow:    '0 4px 16px rgba(0,0,0,0.08)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#111827' }}>Rate this recommendation</p>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>×</button>
      </div>

      {/* Feedback type */}
      <div style={{ marginBottom: 12 }}>
        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#374151' }}>Was this recommendation accurate?</p>
        {FEEDBACK_OPTIONS.map(opt => (
          <label key={opt.value + opt.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="radio"
              name="feedbackType"
              value={opt.value}
              checked={feedbackType === opt.value}
              onChange={() => setFeedbackType(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>

      {/* Usefulness rating */}
      <div style={{ marginBottom: 12 }}>
        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#374151' }}>Usefulness (1 = not useful, 5 = very useful)</p>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setUsefulnessScore(usefulnessScore === n ? null : n)}
              style={{
                width:        36,
                height:       36,
                borderRadius: 8,
                border:       usefulnessScore === n ? '2px solid #2563eb' : '1px solid #d1d5db',
                background:   usefulnessScore === n ? '#eff6ff' : '#f9fafb',
                color:        usefulnessScore === n ? '#2563eb' : '#374151',
                fontWeight:   600,
                cursor:       'pointer',
                fontSize:     14,
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Result status */}
      <div style={{ marginBottom: 12 }}>
        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#374151' }}>Outcome (optional)</p>
        <select
          value={resultStatus}
          onChange={e => setResultStatus(e.target.value)}
          style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #d1d5db' }}
        >
          <option value="">Select outcome...</option>
          {RESULT_OPTIONS.map((opt, i) => (
            <option key={i} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Comment */}
      <div style={{ marginBottom: 12 }}>
        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#374151' }}>Additional notes (optional)</p>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Describe what happened..."
          style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #d1d5db', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>

      {error && (
        <p style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        onMouseEnter={e => { if (!submitting) { e.currentTarget.style.background = '#2563eb'; e.currentTarget.style.color = '#fff'; } }}
        onMouseLeave={e => { if (!submitting) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#2563eb'; } }}
        style={{
          width:        '100%',
          padding:      '8px 0',
          background:   'transparent',
          color:        submitting ? '#9ca3af' : '#2563eb',
          border:       submitting ? '2px solid #9ca3af' : '2px solid #2563eb',
          borderRadius: 999,
          fontWeight:   700,
          fontSize:     14,
          cursor:       submitting ? 'not-allowed' : 'pointer',
          transition:   'background .15s, color .15s',
        }}
      >
        {submitting ? 'Submitting...' : 'Submit Feedback'}
      </button>
    </div>
  );
}

export function RecommendationFeedbackPanel(props: Props) {
  return (
    <IntelligenceLearningErrorBoundary>
      <FeedbackPanelInner {...props} />
    </IntelligenceLearningErrorBoundary>
  );
}
