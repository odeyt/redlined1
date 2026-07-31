'use client';

import { useState } from 'react';

/**
 * Structured make/model/year fitment editor.
 *
 * Storage stays a single comma-separated string in `parts.compatibility` — the
 * column already exists and other modules read it as free text, so changing the
 * shape would break them. Each entry is rendered as a chip, which is what makes
 * a long fitment list scannable instead of one dense line of text.
 */

export interface CompatibilityEditorProps {
  /** Comma-separated fitment string, e.g. "Toyota Hilux 2015-2020, Ford Ranger". */
  value: string;
  onChange: (next: string) => void;
}

export function parseCompatibility(value: string): string[] {
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

export function VehicleCompatibilityEditor({ value, onChange }: CompatibilityEditorProps) {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [years, setYears] = useState('');

  const entries = parseCompatibility(value);

  function add() {
    const parts = [make.trim(), model.trim(), years.trim()].filter(Boolean);
    if (parts.length === 0) return;
    const entry = parts.join(' ');
    if (entries.some(e => e.toLowerCase() === entry.toLowerCase())) {
      setMake(''); setModel(''); setYears('');
      return; // already listed — adding again would create a duplicate chip
    }
    onChange([...entries, entry].join(', '));
    setMake(''); setModel(''); setYears('');
  }

  function remove(index: number) {
    onChange(entries.filter((_, i) => i !== index).join(', '));
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--line)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: 13,
    minWidth: 0,
  };

  return (
    <div>
      {entries.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {entries.map((entry, i) => (
            <span
              key={`${entry}-${i}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px 5px 12px', borderRadius: 8,
                background: 'rgba(59,130,246,0.10)',
                border: '1px solid rgba(59,130,246,0.30)',
                fontSize: 12.5, fontWeight: 600, color: 'var(--text)',
                lineHeight: 1.3,
              }}
            >
              <span aria-hidden="true" style={{ opacity: 0.75 }}>🚗</span>
              {entry}
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${entry}`}
                title={`Remove ${entry}`}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#3b82f6', fontSize: 15, lineHeight: 1, padding: '0 0 0 2px',
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr auto', gap: 6 }}>
        <input
          className="input" style={inputStyle} value={make}
          onChange={e => setMake(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Make — e.g. Toyota" aria-label="Vehicle make"
        />
        <input
          className="input" style={inputStyle} value={model}
          onChange={e => setModel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Model — e.g. Hilux" aria-label="Vehicle model"
        />
        <input
          className="input" style={inputStyle} value={years}
          onChange={e => setYears(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Years" aria-label="Model years"
        />
        <button
          type="button" onClick={add}
          style={{
            padding: '8px 14px', borderRadius: 8,
            border: '1px solid rgba(59,130,246,0.45)',
            background: 'rgba(59,130,246,0.10)',
            color: '#3b82f6', fontWeight: 700, fontSize: 13,
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          + Add
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
        Press Enter or click “+ Add” for each vehicle this part fits. Years are optional.
      </div>
    </div>
  );
}

/** Read-only chip list — used in the detail panel and anywhere fitment is shown. */
export function CompatibilityChips({ value, max }: { value: string; max?: number }) {
  const entries = parseCompatibility(value);
  if (entries.length === 0) return <span style={{ color: 'var(--muted)' }}>—</span>;

  const shown = max ? entries.slice(0, max) : entries;
  const hidden = entries.length - shown.length;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {shown.map((entry, i) => (
        <span
          key={`${entry}-${i}`}
          style={{
            padding: '3px 9px', borderRadius: 6,
            background: 'rgba(59,130,246,0.10)',
            border: '1px solid rgba(59,130,246,0.25)',
            fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
          }}
        >
          {entry}
        </span>
      ))}
      {hidden > 0 && (
        <span
          title={entries.slice(shown.length).join(', ')}
          style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11.5, color: 'var(--muted)' }}
        >
          +{hidden} more
        </span>
      )}
    </div>
  );
}
