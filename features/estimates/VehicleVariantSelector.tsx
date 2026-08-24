'use client';

/**
 * Choosing which catalogue variant a vehicle is.
 *
 * ## Why this is a primary workflow, not an error path
 *
 * Redlined1 records engine on 6 of 114 vehicles and trim on none. For almost
 * every real car the catalogue offers several variants and nothing in our data
 * separates them — so this panel is the ordinary road to verified fitment, not
 * a fallback from a failure.
 *
 * It is written that way: it explains what we know, what the catalogue offers,
 * and why the choice is needed. It does not apologise, and it does not imply
 * the technician is fixing something broken.
 *
 * ## No recommendation without evidence
 *
 * Candidates are ordered so the most plausible are first, and a candidate the
 * vehicle's own engine data actually matches is marked. Nothing else is
 * marked — labelling the first row "recommended" when the ordering is
 * arbitrary is how a technician confirms the wrong engine in a hurry.
 */
import { useMemo, useState } from 'react';
import type { ModificationCandidate } from '@/lib/parts/vehicleResolution/types';

export interface VariantSelectorProps {
  vehicleLabel: string;
  /** What Redlined1 itself holds, shown so the choice is informed. */
  knownEngine?: string;
  candidates: ModificationCandidate[];
  reason: string;
  confirming: boolean;
  error?: string;
  onConfirm: (providerVehicleId: number) => void;
  onCancel: () => void;
}

/** "3.5L · 3498 cc · 200 kW · Petrol" — only what the provider supplied. */
function specLine(c: ModificationCandidate): string {
  const bits: string[] = [];
  if (c.displacementL !== undefined) bits.push(`${c.displacementL.toFixed(1)}L`);
  if (c.powerKw !== undefined) bits.push(`${c.powerKw} kW`);
  if (c.fuel) bits.push(c.fuel);
  if (c.driveType) bits.push(c.driveType);
  if (c.transmission) bits.push(c.transmission);
  return bits.join(' · ');
}

function productionLine(c: ModificationCandidate): string {
  if (c.yearFrom === undefined && c.yearTo === undefined) return '';
  return `Production ${c.yearFrom ?? '…'}–${c.yearTo ?? 'present'}`;
}

/** Litres from the shop's free text, for highlighting only. */
function knownLitres(engine?: string): number | undefined {
  const s = String(engine ?? '').toLowerCase();
  const cc = s.match(/(\d{3,4})\s*cc/);
  if (cc) return Math.round(Number(cc[1]) / 100) / 10;
  const l = s.match(/(\d)[.,](\d)/);
  return l ? Number(`${l[1]}.${l[2]}`) : undefined;
}

export function VehicleVariantSelector({
  vehicleLabel, knownEngine, candidates, reason, confirming, error, onConfirm, onCancel,
}: VariantSelectorProps) {
  const [selected, setSelected] = useState<number | null>(null);

  const wantedL = knownLitres(knownEngine);

  /**
   * Deterministic ordering.
   *
   * Displacement agreement first when we have any, then power, then production
   * start, then the description. Stable, so the same vehicle always presents
   * the same list — a picker that reorders between visits is one a technician
   * stops reading.
   */
  const ordered = useMemo(() => {
    const matchesEngine = (c: ModificationCandidate) =>
      wantedL !== undefined && c.displacementL !== undefined
      && Math.abs(c.displacementL - wantedL) < 0.15;

    return [...candidates].sort((a, b) => {
      const ea = matchesEngine(a) ? 0 : 1;
      const eb = matchesEngine(b) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      if ((a.displacementL ?? 0) !== (b.displacementL ?? 0)) {
        return (a.displacementL ?? 0) - (b.displacementL ?? 0);
      }
      if ((a.yearFrom ?? 0) !== (b.yearFrom ?? 0)) return (a.yearFrom ?? 0) - (b.yearFrom ?? 0);
      return a.description.localeCompare(b.description);
    });
  }, [candidates, wantedL]);

  const engineMatches = (c: ModificationCandidate) =>
    wantedL !== undefined && c.displacementL !== undefined
    && Math.abs(c.displacementL - wantedL) < 0.15;

  return (
    <div data-testid="variant-selector" style={{ padding: '4px 0' }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>
        Vehicle variant required
      </div>

      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
        Redlined1 knows: <strong style={{ color: 'var(--text)' }}>{vehicleLabel}</strong>
        {knownEngine ? <> · engine <strong style={{ color: 'var(--text)' }}>{knownEngine}</strong></> : null}
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        {reason} Choose the exact variant to check parts fitment against it.
      </div>

      {error && (
        <div style={{
          background: 'rgba(220,38,38,0.08)', border: '1px solid #fca5a5', color: '#b91c1c',
          borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 10,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} role="radiogroup" aria-label="Vehicle variant">
        {ordered.map(c => {
          const isSelected = selected === c.vehicleId;
          const matches = engineMatches(c);
          return (
            <button
              key={c.vehicleId}
              type="button"
              role="radio"
              aria-checked={isSelected}
              data-testid={`variant-${c.vehicleId}`}
              onClick={() => setSelected(c.vehicleId)}
              style={{
                textAlign: 'left', cursor: 'pointer', borderRadius: 10, padding: 12,
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--line)'}`,
                background: isSelected ? 'rgba(204,0,0,0.04)' : 'var(--surface-soft)',
                color: 'var(--text)',
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{c.description}</span>
                {matches && (
                  // Marked ONLY because the vehicle's own engine matches. No
                  // badge exists for "first in the list".
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#16a34a' }}>
                    MATCHES RECORDED ENGINE
                  </span>
                )}
              </div>

              {specLine(c) && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{specLine(c)}</div>
              )}
              {c.engineCode && (
                <div style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'break-word' }}>
                  Engine {c.engineCode}
                </div>
              )}
              {productionLine(c) && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{productionLine(c)}</div>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid="confirm-variant"
          disabled={selected === null || confirming}
          onClick={() => selected !== null && onConfirm(selected)}
          className="btn btn-primary"
          style={{ flex: '1 1 200px', minHeight: 44, fontWeight: 800, opacity: selected === null || confirming ? 0.5 : 1 }}
        >
          {confirming ? 'Confirming vehicle variant…' : 'Confirm vehicle variant'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={confirming}
          className="btn"
          style={{ minHeight: 44 }}
        >
          Skip and search anyway
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
        {/* Skipping is legitimate. Without a variant, fitment stays UNVERIFIED
            — which is the honest state, not a penalty. */}
        Without a confirmed variant, parts can still be searched and added, but
        fitment will remain unverified.
      </div>
    </div>
  );
}
