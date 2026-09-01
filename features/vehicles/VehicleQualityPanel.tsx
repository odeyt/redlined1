'use client';

/**
 * Vehicle data quality, and catalogue-assisted enrichment.
 *
 * ## What it will not do
 *
 * It never applies anything on its own. Missing fields arrive unticked,
 * conflicts arrive unticked, and the button says exactly how many fields it
 * is about to change. A catalogue is evidence about a vehicle, not a
 * correction to it — the customer's record may be right where the catalogue
 * is coarse.
 *
 * ## It never spends a provider call
 *
 * The analysis comes from GET, which reads the vehicle, the stored mapping
 * and the persistent reference cache. Opening this panel costs nothing.
 *
 * ## Stacked, not tabular
 *
 * Current-versus-catalogue is shown as stacked pairs rather than a wide
 * table. On a 390px phone in a workshop a two-column comparison either
 * scrolls sideways or truncates the values, and the values are the whole
 * point.
 */
import { useEffect, useState } from 'react';
import type { AppliedField } from '@/lib/vehicles/enrichmentSync';

interface Suggestion {
  field: string;
  label: string;
  comparison: 'MATCH' | 'CONFLICT' | 'MISSING_LOCAL' | 'UNKNOWN';
  currentValue: string | null;
  suggestedValue: string | null;
}

interface QualityResponse {
  fingerprint: string;
  quality: {
    status: 'COMPLETE' | 'INCOMPLETE' | 'CONFLICT';
    completeness: number;
    missingFields: Array<{ field: string; significance: string; label: string }>;
    conflicts: Array<{ field: string; currentValue: string; otherValue: string; detail: string }>;
    resolvable: boolean;
  };
  summary: string;
  catalog: {
    available: boolean;
    unavailableReason?: string;
    modificationDescription?: string;
    technicianConfirmed?: boolean;
    suggestions: Suggestion[];
  };
}

interface Props {
  shopId: string;
  vehicleId: string;
  /**
   * Called after a successful update, WITH the fields the server changed.
   *
   * The list is not decoration. This panel is mounted inside an edit form
   * that snapshots the vehicle into local state when it opens and never
   * re-reads it. Enrichment can write `fuelType`, which that form also edits,
   * so a caller told merely "something happened" would keep its stale value
   * and quietly write it back on the next save — undoing the enrichment
   * without anyone seeing it fail.
   *
   * Handing back the exact fields lets a caller sync those and leave every
   * other in-progress edit alone, which re-reading the whole record could
   * not do.
   */
  onApplied?: (applied: AppliedField[]) => void;
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; text: string }> = {
  COMPLETE: { bg: 'transparent', fg: '#16a34a', text: 'COMPLETE' },
  INCOMPLETE: { bg: 'transparent', fg: '#b45309', text: 'INCOMPLETE' },
  CONFLICT: { bg: 'transparent', fg: '#b45309', text: 'REVIEW NEEDED' },
};

/** Why the catalogue has nothing to say, in the technician's terms. */
const UNAVAILABLE: Record<string, string> = {
  no_mapping: 'This vehicle has not been matched to a catalogue variant yet. '
    + 'Search for parts on an estimate to match it.',
  mapping_not_resolved: 'The catalogue match for this vehicle is not finished.',
  fingerprint_stale: 'The vehicle changed since it was matched. Search for parts again to re-match it.',
  no_cached_variants: 'No stored catalogue details are available for this vehicle right now.',
  variant_not_in_cache: 'No stored catalogue details are available for this variant right now.',
};

export function VehicleQualityPanel({ shopId, vehicleId, onApplied }: Props) {
  const [data, setData] = useState<QualityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [applied, setApplied] = useState('');

  /**
   * A counter, not a callback.
   *
   * An effect that awaits a function which then calls setState is a
   * set-state-in-effect: React traces it and warns about cascading renders.
   * Bumping a key and letting the effect own the whole fetch keeps every
   * setState inside a promise callback, which is the pattern the rule
   * describes as correct — and it removes a stale-closure risk at the same
   * time.
   */
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Guards against setting state on a component the technician has
    // already navigated away from.
    let alive = true;

    fetch(`/api/vehicles/quality?shopId=${encodeURIComponent(shopId)}`
      + `&vehicleId=${encodeURIComponent(vehicleId)}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('load'))))
      .then(json => { if (alive) { setData(json); setError(''); } })
      .catch(() => { if (alive) { setError('Vehicle quality could not be loaded.'); } })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [shopId, vehicleId, refreshKey]);

  if (loading) {
    return <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>
      Checking vehicle data…
    </div>;
  }
  if (error || !data) {
    return <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>{error}</div>;
  }

  const { quality, catalog } = data;
  const style = STATUS_STYLE[quality.status];

  /** Only fields with something to do. A MATCH needs no action. */
  const actionable = catalog.suggestions.filter(
    s => s.comparison === 'MISSING_LOCAL' || s.comparison === 'CONFLICT');
  const matches = catalog.suggestions.filter(s => s.comparison === 'MATCH');

  function toggle(field: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field); else next.add(field);
      return next;
    });
  }

  async function apply() {
    if (!selected.size || saving || !data) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/vehicles/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Field NAMES only. The server decides the values.
        body: JSON.stringify({
          shopId, vehicleId,
          fields: [...selected],
          fingerprint: data.fingerprint,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.code !== 'APPLIED') {
        setError(json?.error ?? 'The vehicle could not be updated.');
        return;
      }
      const appliedFields: AppliedField[] = Array.isArray(json.applied)
        ? json.applied.map((e: { field: string; after: string | number | null }) =>
          ({ field: e.field, after: e.after }))
        : [];
      setApplied(`Updated ${appliedFields.length} field${appliedFields.length === 1 ? '' : 's'}.`);
      setSelected(new Set());
      setOpen(false);
      // Re-read through the effect rather than calling the fetch again.
      setLoading(true);
      setRefreshKey(k => k + 1);
      onApplied?.(appliedFields);
    } catch {
      setError('The vehicle could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="vehicle-quality" style={{
      border: '1px solid var(--line)', borderRadius: 10, padding: 14,
      background: 'var(--surface-soft)',
      /**
       * A value with nothing to wrap on must break rather than push the page
       * sideways.
       *
       * Measured at 320px: a single unbroken token in a catalogue value took
       * the layout to 435px and the whole document scrolled horizontally. The
       * stacked design already survives 320px with real data — this is the one
       * input that defeated it, and engine codes, plate strings and hand-typed
       * model names are all routinely unbroken.
       *
       * `overflow-wrap` is inherited, so declaring it here covers the summary,
       * the conflict box and every current/catalogue value without repeating
       * it at each one. `break-word` rather than `anywhere` so it only breaks
       * a word that would otherwise overflow, leaving normal wrapping alone.
       */
      overflowWrap: 'break-word',
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}>
        VEHICLE DATA QUALITY
      </div>

      {/* Status is stated in WORDS as well as colour — a colour-only warning
          is invisible to a colour-blind technician and to a screen reader. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 6 }}>
        <span data-testid="quality-status"
          style={{ fontWeight: 800, fontSize: 13, color: style.fg }}>
          {style.text}
        </span>
        {catalog.technicianConfirmed && (
          <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>
            ✓ Catalogue variant confirmed
          </span>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{data.summary}</div>

      {quality.conflicts.length > 0 && (
        <div data-testid="quality-conflicts" style={{ marginTop: 10 }}>
          {quality.conflicts.map(c => (
            <div key={c.field} style={{
              border: '1px solid #f59e0b', borderRadius: 8, padding: '8px 10px',
              fontSize: 12, marginBottom: 6,
            }}>
              <div style={{ fontWeight: 800, color: '#b45309' }}>VEHICLE DATA CONFLICT</div>
              <div style={{ color: 'var(--muted)', marginTop: 3 }}>{c.detail}</div>
              <div style={{ marginTop: 6 }}>
                <div><span style={{ color: 'var(--muted)' }}>Recorded {c.field}: </span>
                  <strong>{c.currentValue}</strong></div>
                <div><span style={{ color: 'var(--muted)' }}>Display shows: </span>
                  <strong>{c.otherValue}</strong></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {quality.missingFields.filter(m => m.significance === 'FITMENT_ENRICHMENT').length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12 }}>
          <div style={{ color: 'var(--muted)' }}>Missing for precise parts matching:</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--text)' }}>
            {quality.missingFields
              .filter(m => m.significance === 'FITMENT_ENRICHMENT')
              .map(m => <li key={m.field}>{m.label}</li>)}
          </ul>
        </div>
      )}

      {applied && (
        <div role="status" style={{ fontSize: 12, color: '#16a34a', marginTop: 8, fontWeight: 700 }}>
          {applied}
        </div>
      )}

      {!catalog.available && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
          {UNAVAILABLE[catalog.unavailableReason ?? ''] ?? 'No catalogue details available.'}
        </div>
      )}

      {catalog.available && actionable.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
          Catalogue details agree with this record — nothing to update.
        </div>
      )}

      {catalog.available && actionable.length > 0 && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            marginTop: 10, padding: '8px 14px', borderRadius: 999, fontSize: 12,
            fontWeight: 700, minHeight: 44, cursor: 'pointer',
            border: '1px solid var(--accent)', background: 'transparent', color: 'var(--text)',
          }}
        >
          Review catalogue details ({actionable.length})
        </button>
      )}

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}>
            CATALOG VEHICLE DETAILS
          </div>
          {catalog.modificationDescription && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {catalog.modificationDescription}
            </div>
          )}

          {/* Stacked pairs. A two-column table cannot hold "M 272.974" beside
              a label on a 390px screen without truncating one of them. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '10px 0' }}>
            {actionable.map(s => {
              const id = `enrich-${s.field}`;
              const isConflict = s.comparison === 'CONFLICT';
              return (
                <div key={s.field} style={{
                  border: `1px solid ${isConflict ? '#f59e0b' : 'var(--line)'}`,
                  borderRadius: 8, padding: '10px 12px',
                }}>
                  <label htmlFor={id} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                  }}>
                    <input
                      id={id}
                      type="checkbox"
                      checked={selected.has(s.field)}
                      onChange={() => toggle(s.field)}
                      style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }}
                    />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{s.label}</span>
                      {isConflict && (
                        <span style={{ fontSize: 11, color: '#b45309', fontWeight: 700, marginLeft: 8 }}>
                          DIFFERS
                        </span>
                      )}
                      <span style={{ display: 'block', fontSize: 12, marginTop: 6 }}>
                        <span style={{ color: 'var(--muted)' }}>Current </span>
                        <strong>{s.currentValue ?? '—'}</strong>
                      </span>
                      <span style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                        <span style={{ color: 'var(--muted)' }}>Catalog </span>
                        <strong>{s.suggestedValue}</strong>
                      </span>
                    </span>
                  </label>
                </div>
              );
            })}
          </div>

          {matches.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
              Already agrees: {matches.map(m => m.label).join(', ')}
            </div>
          )}

          {error && (
            <div role="alert" style={{ fontSize: 12, color: '#b45309', marginBottom: 8, fontWeight: 700 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={!selected.size || saving}
              onClick={() => void apply()}
              style={{
                padding: '9px 16px', borderRadius: 999, fontSize: 12, fontWeight: 800,
                minHeight: 44, cursor: !selected.size || saving ? 'default' : 'pointer',
                border: '1px solid var(--accent)',
                background: !selected.size || saving ? 'transparent' : 'var(--accent)',
                color: !selected.size || saving ? 'var(--muted)' : '#fff',
              }}
            >
              {saving ? 'Applying…'
                : selected.size ? `Apply ${selected.size} update${selected.size === 1 ? '' : 's'}`
                  : 'Select fields to apply'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setSelected(new Set()); setError(''); }}
              style={{
                padding: '9px 16px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                minHeight: 44, cursor: 'pointer', border: '1px solid var(--line)',
                background: 'transparent', color: 'var(--text)',
              }}
            >
              Cancel
            </button>
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
            Nothing is changed until you apply it. Catalogue details are evidence about
            this vehicle, not a correction to it.
          </div>
        </div>
      )}
    </div>
  );
}
