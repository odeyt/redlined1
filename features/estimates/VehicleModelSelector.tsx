'use client';

/**
 * Choosing which catalogue MODEL SERIES a vehicle is.
 *
 * ## Why this exists
 *
 * A 2009 Mercedes-Benz S-Class matches two catalogue series for that year.
 * Ambiguity at the model step produces no MODIFICATION candidates, so the
 * variant chooser has nothing to offer and cannot render — and before this,
 * the technician was left reading "No matching parts found", which blames the
 * catalogue for a question Redlined1 could not answer.
 *
 * ## What it will not do
 *
 * It does not preselect, and it does not rank one series above another. The
 * resolver could not tell them apart on the evidence it had; a default here
 * would be a guess wearing the resolver's authority, and the choice is
 * recorded as technician-confirmed — the strongest evidence in the fitment
 * chain. Nothing is assumed until someone who can see the car decides.
 *
 * Choosing a series is not the end: it narrows which variants exist, and the
 * vehicle may still need a variant chosen after this.
 */
import { useState } from 'react';
import type { ModelSeriesCandidate } from '@/lib/parts/vehicleResolution/types';

interface Props {
  vehicleLabel: string;
  candidates: ModelSeriesCandidate[];
  /** The catalogue's own words for why it could not decide. */
  reason?: string;
  busy?: boolean;
  error?: string;
  onConfirm: (modelId: number) => void;
  onCancel: () => void;
}

/** "2005–2013", "2005–", or "" when the catalogue gives no window. */
function years(c: ModelSeriesCandidate): string {
  if (!c.yearFrom && !c.yearTo) return '';
  return `${c.yearFrom ?? '?'}–${c.yearTo ?? 'present'}`;
}

export function VehicleModelSelector({
  vehicleLabel, candidates, reason, busy, error, onConfirm, onCancel,
}: Props) {
  const [chosen, setChosen] = useState<number | null>(null);

  return (
    <div data-testid="model-selector">
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.04em' }}>
        VEHICLE MODEL AMBIGUOUS
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
        Redlined1 knows: <strong style={{ color: 'var(--text)' }}>{vehicleLabel}</strong>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
        The catalog contains {candidates.length} model series matching this vehicle.
        {reason ? ` ${reason}` : ''} Choose the exact series so parts can be checked
        against it. Nothing has been assumed about which series this vehicle is.
      </div>

      <div
        role="radiogroup"
        aria-label="Vehicle model series"
        style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}
      >
        {candidates.map(c => {
          const active = chosen === c.modelId;
          const span = years(c);
          return (
            <button
              key={c.modelId}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setChosen(c.modelId)}
              style={{
                textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                minHeight: 44, background: 'transparent', color: 'var(--text)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                boxShadow: active ? '0 0 0 1px var(--accent) inset' : 'none',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</div>
              {span && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  Production {span}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#b45309', marginBottom: 8, fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={chosen === null || busy}
          onClick={() => chosen !== null && onConfirm(chosen)}
          style={{
            padding: '9px 16px', borderRadius: 999, fontSize: 12, fontWeight: 800,
            minHeight: 38, cursor: chosen === null || busy ? 'default' : 'pointer',
            border: '1px solid var(--accent)',
            background: chosen === null || busy ? 'transparent' : 'var(--accent)',
            color: chosen === null || busy ? 'var(--muted)' : '#fff',
          }}
        >
          {busy ? 'Checking…' : 'Confirm model series'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '9px 16px', borderRadius: 999, fontSize: 12, fontWeight: 700,
            minHeight: 38, cursor: 'pointer', border: '1px solid var(--line)',
            background: 'transparent', color: 'var(--text)',
          }}
        >
          Search by OEM Instead
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
        Without a series, parts can still be searched by OEM or part number and added
        manually, but fitment will remain unverified.
      </div>
    </div>
  );
}
