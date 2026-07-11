'use client';

import { TechnicianNotes, TriageUrgency } from '@/lib/triage/QuestionTypes';

interface Props {
  notes: TechnicianNotes;
  onChange: (notes: TechnicianNotes) => void;
  onNext: () => void;
  onBack: () => void;
}

const URGENCY_OPTIONS: { value: TriageUrgency; label: string; color: string }[] = [
  { value: 'routine',  label: 'Routine',   color: '#6b7280' },
  { value: 'priority', label: 'Priority',  color: '#f59e0b' },
  { value: 'urgent',   label: 'Urgent',    color: '#ef4444' },
  { value: 'tow_in',   label: 'Tow-In',    color: '#8b5cf6' },
];

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 40, height: 22, borderRadius: 11,
          background: value ? '#cc0000' : 'var(--surface-soft)',
          position: 'relative', transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer',
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: value ? 21 : 3,
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
    </label>
  );
}

export function TechNotesStep({ notes, onChange, onNext, onBack }: Props) {
  return (
    <div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>
        Add any additional observations, customer requests, or operational flags before generating the summary.
      </p>

      {/* Urgency */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>
          Urgency
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {URGENCY_OPTIONS.map(opt => {
            const active = notes.urgency === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onChange({ ...notes, urgency: opt.value })}
                style={{
                  background:   active ? `${opt.color}22` : 'var(--surface)',
                  border:       active ? `1.5px solid ${opt.color}` : '1px solid var(--line)',
                  borderRadius: 8, padding: '8px 18px', cursor: 'pointer',
                  fontWeight:   active ? 700 : 500, fontSize: 13,
                  color:        active ? opt.color : 'var(--text)',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Flags */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 14,
        background: 'var(--surface)', borderRadius: 10,
        padding: '16px 20px', border: '1px solid var(--line)',
        marginBottom: 24,
      }}>
        <div className="section-label" style={{ marginBottom: 4 }}>
          Operational Flags
        </div>
        <Toggle label="Tow-in vehicle"         value={notes.towIn}          onChange={v => onChange({ ...notes, towIn: v })} />
        <Toggle label="Vehicle unsafe to drive" value={notes.vehicleUnsafe}  onChange={v => onChange({ ...notes, vehicleUnsafe: v })} />
        <Toggle label="Customer waiting"        value={notes.waitingCustomer} onChange={v => onChange({ ...notes, waitingCustomer: v })} />
      </div>

      {/* Additional observations */}
      <div className="field" style={{ marginBottom: 16 }}>
        <label>Additional Observations</label>
        <textarea
          value={notes.additionalObservations}
          placeholder="e.g. Noticed oil stain under vehicle. Coolant reservoir low."
          rows={3}
          onChange={e => onChange({ ...notes, additionalObservations: e.target.value })}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      {/* Customer requests */}
      <div className="field" style={{ marginBottom: 28 }}>
        <label>Customer Requests</label>
        <textarea
          value={notes.customerRequests}
          placeholder="e.g. Please call before starting any work. No upsell on wipers."
          rows={2}
          onChange={e => onChange({ ...notes, customerRequests: e.target.value })}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
        />
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
          style={{
            background: '#cc0000', color: '#fff',
            border: 'none', borderRadius: 8, padding: '10px 28px',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}
        >
          Generate Summary →
        </button>
      </div>
    </div>
  );
}
