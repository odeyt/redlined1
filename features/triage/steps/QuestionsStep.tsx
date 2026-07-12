'use client';

import { Question, AnswerMap, CategoryId } from '@/lib/triage/QuestionTypes';
import { QuestionFlow } from '@/lib/triage/QuestionFlow';
import { useMemo } from 'react';

interface Props {
  categoryId: CategoryId;
  answers: AnswerMap;
  onChange: (answers: AnswerMap) => void;
  onNext: () => void;
  onBack: () => void;
}

// ─── Individual question renderers ────────────────────────────────────────────

function QuestionField({ q, value, onChange }: {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const strVal = value === null || value === undefined ? '' : String(value);

  switch (q.type) {
    case 'yes_no':
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          {(['Yes', 'No'] as const).map(opt => {
            const optVal = opt.toLowerCase();
            const active = strVal === optVal || (opt === 'Yes' && value === true) || (opt === 'No' && value === false);
            return (
              <button
                key={opt}
                onClick={() => onChange(optVal)}
                style={{
                  background:   active ? (opt === 'Yes' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)') : 'var(--surface)',
                  border:       active ? `1.5px solid ${opt === 'Yes' ? '#22c55e' : '#ef4444'}` : '1px solid var(--line)',
                  borderRadius: 7, padding: '7px 22px', cursor: 'pointer',
                  fontWeight:   active ? 700 : 500,
                  color:        active ? (opt === 'Yes' ? '#22c55e' : '#ef4444') : 'var(--text)',
                  fontSize: 13,
                }}
              >{opt}</button>
            );
          })}
        </div>
      );

    case 'multiple_choice':
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {(q.options ?? []).map(opt => {
            const active = strVal === opt.value || (Array.isArray(value) && (value as string[]).includes(opt.value));
            return (
              <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                style={{
                  background:   active ? 'rgba(204,0,0,0.15)' : 'var(--surface)',
                  border:       active ? '1.5px solid #cc0000' : '1px solid var(--line)',
                  borderRadius: 7, padding: '7px 14px',
                  cursor: 'pointer', fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  color: active ? '#cc0000' : 'var(--text)',
                }}
              >{opt.label}</button>
            );
          })}
        </div>
      );

    case 'short_text':
      return (
        <input
          value={strVal}
          placeholder={q.placeholder ?? ''}
          onChange={e => onChange(e.target.value)}
          style={{ width: '100%', maxWidth: 360 }}
        />
      );

    case 'long_text':
      return (
        <textarea
          value={strVal}
          placeholder={q.placeholder ?? ''}
          rows={3}
          onChange={e => onChange(e.target.value)}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
        />
      );

    case 'number':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            value={strVal}
            min={q.min}
            max={q.max}
            step={q.step ?? 1}
            onChange={e => onChange(e.target.value)}
            style={{ width: 120 }}
          />
          {q.unit && <span style={{ color: 'var(--muted)', fontSize: 13 }}>{q.unit}</span>}
        </div>
      );

    case 'slider':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="range"
            value={strVal || String(q.min ?? 0)}
            min={q.min ?? 0}
            max={q.max ?? 100}
            step={q.step ?? 1}
            onChange={e => onChange(e.target.value)}
            style={{ flex: 1, maxWidth: 280 }}
          />
          <span style={{ fontWeight: 700, minWidth: 40 }}>{strVal || (q.min ?? 0)} {q.unit ?? ''}</span>
        </div>
      );

    case 'date':
      return (
        <input
          type="date"
          value={strVal}
          onChange={e => onChange(e.target.value)}
          style={{ width: 180 }}
        />
      );

    case 'photo_upload':
      return (
        <div style={{
          border: '2px dashed var(--line)', borderRadius: 8,
          padding: '18px 24px', textAlign: 'center', color: 'var(--muted)',
          fontSize: 13, cursor: 'pointer',
        }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>📷</div>
          <div>Tap to upload photos</div>
          <input
            type="file" accept="image/*" multiple
            style={{ display: 'none' }}
            onChange={e => {
              const files = e.target.files;
              if (files && files.length > 0) onChange(`${files.length} photo(s) selected`);
            }}
          />
        </div>
      );

    case 'video_upload':
      return (
        <div style={{
          border: '2px dashed var(--line)', borderRadius: 8,
          padding: '18px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13,
        }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>🎥</div>
          <div>Video upload — coming soon</div>
        </div>
      );

    case 'voice_recording':
      return (
        <div style={{
          border: '2px dashed var(--line)', borderRadius: 8,
          padding: '18px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13,
        }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>🎙️</div>
          <div>Voice recording — coming soon</div>
        </div>
      );

    case 'obd_upload':
      return (
        <div style={{
          border: '2px dashed var(--line)', borderRadius: 8,
          padding: '18px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13,
        }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>🔌</div>
          <div>OBD upload — coming soon</div>
        </div>
      );

    default:
      return <input value={strVal} onChange={e => onChange(e.target.value)} />;
  }
}

// ─── Main questions step ──────────────────────────────────────────────────────

export function QuestionsStep({ categoryId, answers, onChange, onNext, onBack }: Props) {
  const flow = useMemo(() => new QuestionFlow(categoryId), [categoryId]);
  const activeQuestions = flow.getActiveQuestions(answers);
  const { answered, total } = flow.getProgress(answers);
  const progressPct = total > 0 ? Math.round((answered / total) * 100) : 0;

  function setAnswer(questionId: string, value: unknown) {
    onChange({ ...answers, [questionId]: value as AnswerMap[string] });
  }

  return (
    <div>
      {/* Progress bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
          <span>{answered} of {total} answered</span>
          <span style={{ fontWeight: 700, color: progressPct >= 70 ? '#22c55e' : 'var(--muted)' }}>{progressPct}%</span>
        </div>
        <div style={{ background: 'var(--surface-soft)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
          <div style={{
            width: `${progressPct}%`, height: '100%',
            background: progressPct >= 70 ? '#22c55e' : '#cc0000',
            borderRadius: 4, transition: 'width 0.3s',
          }} />
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
          Answer as many questions as possible for a better complaint summary. All questions are optional.
        </p>
      </div>

      {/* Questions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 32 }}>
        {activeQuestions.map(q => (
          <div key={q.id}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
              {q.text}
              {q.required && <span style={{ color: '#cc0000', marginLeft: 4 }}>*</span>}
            </div>
            {q.hint && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{q.hint}</div>
            )}
            <QuestionField
              q={q}
              value={answers[q.id] ?? null}
              onChange={v => setAnswer(q.id, v)}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent', border: '1px solid var(--line)',
            borderRadius: 8, padding: '10px 22px',
            fontWeight: 600, fontSize: 14, cursor: 'pointer', color: 'var(--text)',
          }}
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          onMouseEnter={e => { e.currentTarget.style.background = '#cc0000'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#cc0000'; }}
          style={{
            background: 'transparent', color: '#cc0000',
            border: '2px solid #cc0000', borderRadius: 999, padding: '10px 28px',
            fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'background .15s, color .15s',
          }}
        >
          Continue to Tech Notes →
        </button>
      </div>
    </div>
  );
}
