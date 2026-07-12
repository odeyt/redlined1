'use client';

import { COMPLAINT_CATEGORIES, CategoryId } from '@/lib/triage/QuestionTypes';

interface Props {
  selected: CategoryId[];
  onSelect: (ids: CategoryId[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export function CategoryStep({ selected, onSelect, onNext, onBack }: Props) {
  function toggle(id: CategoryId) {
    onSelect(
      selected.includes(id)
        ? selected.filter(s => s !== id)
        : [...selected, id]
    );
  }

  const hasSelection = selected.length > 0;

  return (
    <div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>
        Select one or more complaint categories that describe the customer&apos;s concern.
      </p>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {selected.map(id => {
            const cat = COMPLAINT_CATEGORIES.find(c => c.id === id);
            return (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(204,0,0,0.12)', color: '#cc0000', border: '1px solid rgba(204,0,0,0.3)' }}>
                {cat?.icon} {cat?.label}
                <button type="button" onClick={() => toggle(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cc0000', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            );
          })}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
        gap: 10,
        marginBottom: 28,
      }}>
        {COMPLAINT_CATEGORIES.map(cat => {
          const isSelected = selected.includes(cat.id as CategoryId);
          return (
            <button
              key={cat.id}
              onClick={() => toggle(cat.id as CategoryId)}
              style={{
                background:    isSelected ? 'rgba(204,0,0,0.15)' : 'var(--surface)',
                border:        isSelected ? '2px solid #cc0000' : '1px solid var(--line)',
                borderRadius:  10,
                padding:       '14px 10px',
                cursor:        'pointer',
                textAlign:     'center',
                transition:    'border-color 0.15s, background 0.15s',
                display:       'flex',
                flexDirection: 'column',
                alignItems:    'center',
                gap:           6,
                position:      'relative',
              }}
            >
              {isSelected && (
                <span style={{ position: 'absolute', top: 5, right: 7, fontSize: 14, color: '#cc0000', fontWeight: 900, lineHeight: 1 }}>✓</span>
              )}
              <span style={{ fontSize: 26 }}>{cat.icon}</span>
              <span style={{
                fontSize:      11,
                fontWeight:    isSelected ? 800 : 600,
                color:         isSelected ? '#cc0000' : 'var(--text)',
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                lineHeight:    1.3,
              }}>
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
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
          disabled={!hasSelection}
          onMouseEnter={e => { if (hasSelection) { e.currentTarget.style.background = '#cc0000'; e.currentTarget.style.color = '#fff'; } }}
          onMouseLeave={e => { if (hasSelection) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#cc0000'; } }}
          style={{
            background: 'transparent',
            color:      hasSelection ? '#cc0000' : 'var(--muted)',
            border: hasSelection ? '2px solid #cc0000' : '2px solid var(--line)', borderRadius: 999, padding: '10px 28px',
            fontWeight: 700, fontSize: 14, cursor: hasSelection ? 'pointer' : 'not-allowed',
            transition: 'background .15s, color .15s',
          }}
        >
          Continue to Questions →
        </button>
        {hasSelection && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{selected.length} selected</span>
        )}
      </div>
    </div>
  );
}
