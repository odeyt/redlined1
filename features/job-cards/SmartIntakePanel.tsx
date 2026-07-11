'use client';

import { useState, useEffect, useMemo } from 'react';
import { COMPLAINT_CATEGORIES, type CategoryId, type AnswerMap } from '@/lib/triage/QuestionTypes';
import { QUESTION_REGISTRY } from '@/lib/triage/QuestionRepository';
import { PRIORITY_QUESTION_IDS, INSPECTION_SUGGESTIONS } from '@/lib/triage/QuestionRules';
import { buildComplaintSummary } from '@/lib/triage/ComplaintSummaryBuilder';
import {
  calculateQuickQuality, urgencyToPriority,
  type UrgencyLevel, type SmartIntakeOutput,
} from '@/lib/triage/jobCardTriageAdapter';

// ─── Minimal question field for embedded panel ────────────────────────────────

function QuickField({ q, value, onChange }: {
  q: { id: string; text: string; type: string; options?: { value: string; label: string }[]; hint?: string };
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const str = value === null || value === undefined ? '' : String(value);

  if (q.type === 'yes_no') {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {(['Yes', 'No'] as const).map(opt => {
          const v = opt.toLowerCase();
          const active = str === v;
          return (
            <button key={opt} onClick={() => onChange(v)} style={{
              background: active ? (opt === 'Yes' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)') : 'var(--surface-soft)',
              border: active ? `1.5px solid ${opt === 'Yes' ? '#22c55e' : '#ef4444'}` : '1px solid var(--line)',
              borderRadius: 7, padding: '6px 18px', cursor: 'pointer',
              fontWeight: active ? 700 : 500,
              color: active ? (opt === 'Yes' ? '#22c55e' : '#ef4444') : 'var(--text)',
              fontSize: 13,
            }}>{opt}</button>
          );
        })}
      </div>
    );
  }

  if (q.type === 'multiple_choice') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {(q.options ?? []).map(opt => {
          const active = str === opt.value;
          return (
            <button key={opt.value} onClick={() => onChange(opt.value)} style={{
              background: active ? 'rgba(204,0,0,0.12)' : 'var(--surface-soft)',
              border: active ? '1.5px solid #cc0000' : '1px solid var(--line)',
              borderRadius: 7, padding: '6px 12px', cursor: 'pointer',
              fontSize: 12, fontWeight: active ? 700 : 500,
              color: active ? '#cc0000' : 'var(--text)',
            }}>{opt.label}</button>
          );
        })}
      </div>
    );
  }

  return (
    <input
      value={str}
      onChange={e => onChange(e.target.value)}
      style={{ width: '100%', maxWidth: 340 }}
    />
  );
}

// ─── Quality ring ─────────────────────────────────────────────────────────────

function QualityRing({ score }: { score: number }) {
  const r = 26, circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
      <svg width={64} height={64} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={32} cy={32} r={r} fill="none" stroke="var(--surface-soft)" strokeWidth={6} />
        <circle cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 900, color }}>{score}</div>
        <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Quality</div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  vehicle: string;
  vehicleKnown: boolean;
  onChange: (data: SmartIntakeOutput | null) => void;
  initialNotes?: string;
}

export function SmartIntakePanel({ vehicle, vehicleKnown, onChange, initialNotes }: Props) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<CategoryId | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [urgency, setUrgency] = useState<UrgencyLevel>('routine');
  const [towIn, setTowIn] = useState(false);
  const [unsafe, setUnsafe] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');
  const [kgInsights, setKgInsights] = useState<string[]>([]);

  // Priority questions for selected category
  const priorityQuestions = useMemo(() => {
    if (!categoryId) return [];
    const ids = PRIORITY_QUESTION_IDS[categoryId] ?? [];
    const all = QUESTION_REGISTRY[categoryId] ?? [];
    return all.filter(q => ids.includes(q.id));
  }, [categoryId]);

  // Auto-generate complaint summary
  const complaintSummary = useMemo(() => {
    if (!categoryId) return '';
    return buildComplaintSummary(categoryId, answers);
  }, [categoryId, answers]);

  const suggestions = categoryId ? (INSPECTION_SUGGESTIONS[categoryId] ?? []).slice(0, 5) : [];

  const score = calculateQuickQuality(categoryId, answers, urgency, vehicleKnown);

  // Sync edited summary when auto-summary changes
  useEffect(() => {
    setEditedSummary(complaintSummary || initialNotes || '');
  }, [complaintSummary, initialNotes]);

  // KG lookup when vehicle + category change
  useEffect(() => {
    if (!categoryId || !vehicle) { setKgInsights([]); return; }
    const parts = vehicle.trim().split(/\s+/);
    const make = parts[1] ?? '';
    const model = parts[2] ?? '';
    if (!make || !model) { setKgInsights([]); return; }

    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { getShopId } = await import('@/lib/shopStore');
        const shopId = await getShopId();
        const { data } = await supabase
          .from('repair_cases')
          .select('final_fix, dtc_codes')
          .eq('shop_id', shopId)
          .ilike('make', `%${make}%`)
          .ilike('model', `%${model}%`)
          .eq('verification_status', 'gold_verified')
          .limit(3);
        setKgInsights(
          (data ?? [])
            .filter(r => r.final_fix)
            .map(r => {
              const dtcs = (r.dtc_codes as string[] | null)?.join(', ');
              return `${r.final_fix as string}${dtcs ? ` (${dtcs})` : ''}`;
            })
        );
      } catch { setKgInsights([]); }
    })();
  }, [categoryId, vehicle]);

  // Emit output whenever state changes
  useEffect(() => {
    if (!open || !categoryId) {
      onChange(null);
      return;
    }
    onChange({
      categoryId,
      complaintSummary,
      editedComplaintSummary: editedSummary,
      inspectionSuggestions: suggestions,
      urgency,
      towIn,
      vehicleUnsafe: unsafe,
      waitingCustomer: waiting,
      dataQualityScore: score,
    });
  }, [open, categoryId, complaintSummary, editedSummary, urgency, towIn, unsafe, waiting, score]); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setCategoryId(null);
    setAnswers({});
    setUrgency('routine');
    setTowIn(false);
    setUnsafe(false);
    setWaiting(false);
    setEditedSummary('');
    setKgInsights([]);
  }

  const urgencyColors: Record<UrgencyLevel, string> = {
    routine: '#6b7280', priority: '#f59e0b', urgent: '#ef4444', tow_in: '#8b5cf6',
  };

  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
      {/* Toggle header */}
      <button
        onClick={() => { setOpen(p => !p); if (!open) reset(); }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', background: open ? 'rgba(204,0,0,0.06)' : 'var(--surface-soft)',
          border: `1px solid ${open ? 'rgba(204,0,0,0.25)' : 'var(--line)'}`,
          borderRadius: 9, padding: '10px 16px', cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>🔍</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: open ? '#cc0000' : 'var(--text)' }}>
              Smart Intake
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
              {open
                ? categoryId
                  ? `${COMPLAINT_CATEGORIES.find(c => c.id === categoryId)?.label ?? ''} · Quality ${score}%`
                  : 'Select a complaint category to start'
                : 'Guided complaint capture · Better technician handoff'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {open && categoryId && <QualityRing score={score} />}
          <span style={{ fontSize: 18, color: 'var(--muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>⌄</span>
        </div>
      </button>

      {!open && (
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '6px 0 0', paddingLeft: 2 }}>
          Better intake helps technicians diagnose faster. Optional — leave closed to create a Quick Job Card.
        </p>
      )}

      {/* Panel body */}
      {open && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Category selection */}
          <div>
            <div className="section-label">
              Complaint Category
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COMPLAINT_CATEGORIES.map(cat => {
                const active = categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => { setCategoryId(active ? null : cat.id as CategoryId); setAnswers({}); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                      fontWeight: active ? 700 : 500,
                      background: active ? 'rgba(204,0,0,0.12)' : 'var(--surface-soft)',
                      border: active ? '1.5px solid #cc0000' : '1px solid var(--line)',
                      color: active ? '#cc0000' : 'var(--text)',
                    }}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority questions */}
          {categoryId && priorityQuestions.length > 0 && (
            <div>
              <div className="section-label">
                Key Questions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {priorityQuestions.map(q => (
                  <div key={q.id}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{q.text}</div>
                    {q.hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{q.hint}</div>}
                    <QuickField
                      q={q}
                      value={answers[q.id] ?? null}
                      onChange={v => setAnswers(prev => ({ ...prev, [q.id]: v as AnswerMap[string] }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tech flags */}
          {categoryId && (
            <div>
              <div className="section-label">
                Urgency & Flags
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {(['routine', 'priority', 'urgent', 'tow_in'] as UrgencyLevel[]).map(u => (
                  <button
                    key={u}
                    onClick={() => setUrgency(u)}
                    style={{
                      padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                      fontWeight: urgency === u ? 700 : 500,
                      background: urgency === u ? `${urgencyColors[u]}22` : 'var(--surface-soft)',
                      border: `1.5px solid ${urgency === u ? urgencyColors[u] : 'var(--line)'}`,
                      color: urgency === u ? urgencyColors[u] : 'var(--muted)',
                    }}
                  >
                    {u === 'tow_in' ? 'Tow-In' : u.charAt(0).toUpperCase() + u.slice(1)}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { label: 'Waiting Customer', value: waiting, set: setWaiting },
                  { label: 'Vehicle Unsafe', value: unsafe, set: setUnsafe },
                  { label: 'Tow-In', value: towIn, set: setTowIn },
                ].map(flag => (
                  <button
                    key={flag.label}
                    onClick={() => flag.set(!flag.value)}
                    style={{
                      padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                      fontWeight: flag.value ? 700 : 500,
                      background: flag.value ? 'rgba(204,0,0,0.1)' : 'var(--surface-soft)',
                      border: `1px solid ${flag.value ? '#cc0000' : 'var(--line)'}`,
                      color: flag.value ? '#cc0000' : 'var(--muted)',
                    }}
                  >
                    {flag.value ? '✓ ' : ''}{flag.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Complaint summary */}
          {categoryId && complaintSummary && (
            <div>
              <div className="section-label" style={{ marginBottom: 8 }}>
                Complaint Summary <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11 }}>— editable</span>
              </div>
              <textarea
                value={editedSummary}
                onChange={e => setEditedSummary(e.target.value)}
                rows={3}
                style={{ width: '100%', fontFamily: 'inherit', fontSize: 13, resize: 'vertical', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--surface-soft)', padding: '10px 12px', color: 'var(--text)' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                <QualityRing score={score} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Complaint Quality: {score}%</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {score >= 80 ? 'Excellent handoff' : score >= 60 ? 'Good — answer more questions to improve' : 'Add more details for a faster diagnosis'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Suggested checks */}
          {suggestions.length > 0 && (
            <div style={{
              background: 'var(--surface-soft)', borderRadius: 8,
              padding: '12px 16px', borderLeft: '3px solid #cc0000',
            }}>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                Suggested First Checks
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {suggestions.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12 }}>
                    <span style={{ color: '#22c55e', flexShrink: 0 }}>✓</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KG panel */}
          {kgInsights.length > 0 && (
            <div style={{
              background: 'rgba(204,0,0,0.05)', border: '1px solid rgba(204,0,0,0.18)',
              borderRadius: 8, padding: '12px 16px',
            }}>
              <div className="section-label" style={{ marginBottom: 8 }}>
                Known Patterns — This Vehicle
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {kgInsights.map((insight, i) => (
                  <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12, color: 'var(--muted)' }}>
                    <span style={{ color: '#cc0000', flexShrink: 0 }}>→</span>
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
