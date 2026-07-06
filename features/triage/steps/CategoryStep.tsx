'use client';

import { COMPLAINT_CATEGORIES, CategoryId } from '@/lib/triage/QuestionTypes';

interface Props {
  selected: CategoryId | null;
  onSelect: (id: CategoryId) => void;
  onNext: () => void;
  onBack: () => void;
}

export function CategoryStep({ selected, onSelect, onNext, onBack }: Props) {
  return (
    <div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Select the complaint category that best describes the customer&apos;s concern.
        This determines the questions asked next.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
        gap: 10,
        marginBottom: 28,
      }}>
        {COMPLAINT_CATEGORIES.map(cat => {
          const isSelected = selected === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id as CategoryId)}
              style={{
                background:   isSelected ? 'rgba(204,0,0,0.15)' : 'var(--surface)',
                border:       isSelected ? '2px solid #cc0000' : '1px solid var(--line)',
                borderRadius: 10,
                padding:      '14px 10px',
                cursor:       'pointer',
                textAlign:    'center',
                transition:   'border-color 0.15s, background 0.15s',
                display:      'flex',
                flexDirection: 'column',
                alignItems:   'center',
                gap:          6,
              }}
            >
              <span style={{ fontSize: 26 }}>{cat.icon}</span>
              <span style={{
                fontSize:   11,
                fontWeight: isSelected ? 800 : 600,
                color:      isSelected ? '#cc0000' : 'var(--text)',
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                lineHeight: 1.3,
              }}>
                {cat.label}
              </span>
            </button>
          );
        })}
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
          disabled={!selected}
          style={{
            background: selected ? '#cc0000' : 'var(--surface-soft)',
            color: selected ? '#fff' : 'var(--muted)',
            border: 'none', borderRadius: 8, padding: '10px 28px',
            fontWeight: 700, fontSize: 14, cursor: selected ? 'pointer' : 'not-allowed',
          }}
        >
          Continue to Questions →
        </button>
      </div>
    </div>
  );
}
