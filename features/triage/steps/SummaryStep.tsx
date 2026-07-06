'use client';

import { TriageSession, COMPLAINT_CATEGORIES } from '@/lib/triage/QuestionTypes';
import { scoreWithBreakdown } from '@/lib/triage/DataQualityScorer';

interface Props {
  session: TriageSession;
  saving: boolean;
  onSendToJobCard: () => void;
  onSendToInspection: () => void;
  onSaveDraft: () => void;
  onBack: () => void;
  knowledgeInsights: string[];
}

function QualityRing({ score }: { score: number }) {
  const radius = 36;
  const circ   = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color  = score >= 85 ? '#22c55e' : score >= 65 ? '#f59e0b' : score >= 40 ? '#fb923c' : '#ef4444';

  return (
    <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0 }}>
      <svg width={92} height={92} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={46} cy={46} r={radius} fill="none" stroke="var(--surface-soft)" strokeWidth={8} />
        <circle
          cx={46} cy={46} r={radius} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 20, fontWeight: 900, color }}>{score}</div>
        <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Quality</div>
      </div>
    </div>
  );
}

export function SummaryStep({ session, saving, onSendToJobCard, onSendToInspection, onSaveDraft, onBack, knowledgeInsights }: Props) {
  const breakdown = scoreWithBreakdown(
    session.vehicle,
    session.categoryId,
    session.answers,
    session.techNotes,
  );

  const category = COMPLAINT_CATEGORIES.find(c => c.id === session.categoryId);

  const urgencyColors: Record<string, string> = {
    routine: '#6b7280', priority: '#f59e0b', urgent: '#ef4444', tow_in: '#8b5cf6',
  };
  const urgencyColor = urgencyColors[session.techNotes.urgency] ?? '#6b7280';

  return (
    <div>
      {/* Quality score + vehicle */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20,
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 12, padding: '18px 22px', marginBottom: 20,
      }}>
        <QualityRing score={breakdown.total} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>
            {session.vehicle.year} {session.vehicle.make} {session.vehicle.model}
          </div>
          {session.vehicle.engine && (
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
              {session.vehicle.engine} · {session.vehicle.fuelType} · {session.vehicle.transmission}
            </div>
          )}
          {session.vehicle.mileage && (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              {Number(session.vehicle.mileage).toLocaleString()} miles
            </div>
          )}
          {/* Flags */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
            <span style={{ background: `${urgencyColor}22`, color: urgencyColor, border: `1px solid ${urgencyColor}`, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
              {session.techNotes.urgency.replace('_', '-').toUpperCase()}
            </span>
            {session.techNotes.towIn && <span style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid #8b5cf6', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>TOW-IN</span>}
            {session.techNotes.vehicleUnsafe && <span style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>UNSAFE</span>}
            {session.techNotes.waitingCustomer && <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid #f59e0b', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>WAITING</span>}
          </div>
        </div>
      </div>

      {/* Category badge */}
      {category && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.3)',
          borderRadius: 8, padding: '6px 14px', marginBottom: 16, fontSize: 13, fontWeight: 700,
        }}>
          <span>{category.icon}</span>
          <span>{category.label}</span>
        </div>
      )}

      {/* Complaint summary */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 10, padding: '16px 20px', marginBottom: 20,
      }}>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
          Customer Complaint Summary
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.65, margin: 0, fontStyle: 'italic' }}>
          &ldquo;{session.complaintSummary}&rdquo;
        </p>
        {session.techNotes.additionalObservations && (
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10, marginBottom: 0 }}>
            <strong>Tech observation:</strong> {session.techNotes.additionalObservations}
          </p>
        )}
        {session.techNotes.customerRequests && (
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6, marginBottom: 0 }}>
            <strong>Customer requests:</strong> {session.techNotes.customerRequests}
          </p>
        )}
      </div>

      {/* Inspection suggestions */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 10, padding: '16px 20px', marginBottom: 20,
      }}>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
          Suggested Inspection Checks
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {session.inspectionSuggestions.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
              <span style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }}>✓</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Knowledge graph insights */}
      {knowledgeInsights.length > 0 && (
        <div style={{
          background: 'rgba(204,0,0,0.06)', border: '1px solid rgba(204,0,0,0.2)',
          borderRadius: 10, padding: '16px 20px', marginBottom: 20,
        }}>
          <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#cc0000', marginBottom: 10 }}>
            Common Issues on Similar Vehicles
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {knowledgeInsights.map((insight, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
                <span style={{ color: '#cc0000', flexShrink: 0 }}>→</span>
                <span>{insight}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quality breakdown */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 10, padding: '16px 20px', marginBottom: 24,
      }}>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
          Data Quality Score — {breakdown.total}% <span style={{ color: breakdown.total >= 85 ? '#22c55e' : breakdown.total >= 65 ? '#f59e0b' : '#ef4444' }}>({breakdown.label})</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {breakdown.breakdown.map(b => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', width: 110, flexShrink: 0 }}>{b.label}</div>
              <div style={{ flex: 1, background: 'var(--surface-soft)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{
                  width: `${(b.score / b.max) * 100}%`, height: '100%',
                  background: (b.score / b.max) >= 0.7 ? '#22c55e' : '#cc0000',
                  borderRadius: 4,
                }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 45, textAlign: 'right' }}>
                {b.score}/{b.max}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
          onClick={onSaveDraft}
          disabled={saving}
          style={{
            background: 'transparent', border: '1px solid var(--line)',
            borderRadius: 8, padding: '10px 22px',
            fontWeight: 600, fontSize: 14, cursor: 'pointer', color: 'var(--text)',
          }}
        >
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
        <button
          onClick={onSendToInspection}
          disabled={saving}
          style={{
            background: 'transparent', border: '1px solid #3b82f6',
            borderRadius: 8, padding: '10px 22px',
            fontWeight: 700, fontSize: 14, cursor: 'pointer', color: '#3b82f6',
          }}
        >
          {saving ? 'Saving…' : '🔍 Send to Inspection'}
        </button>
        <button
          onClick={onSendToJobCard}
          disabled={saving}
          style={{
            background: '#cc0000', color: '#fff',
            border: 'none', borderRadius: 8, padding: '10px 28px',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}
        >
          {saving ? 'Saving…' : '➕ Send to Job Card'}
        </button>
      </div>
    </div>
  );
}
