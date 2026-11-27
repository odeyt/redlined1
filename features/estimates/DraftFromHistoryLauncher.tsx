'use client';

/**
 * "Draft from past jobs" — the button and its suggestion dialog.
 *
 * Owner decision (2026-11-27): suggest estimate lines from the shop's own past
 * estimates for the same make and model with similar work, at the prices the
 * shop charged. No AI. Behind `estimate_drafting` (default OFF); renders
 * nothing while it is off.
 *
 * Staff tick the lines they want and add them; nothing is added on its own,
 * and the added lines are ordinary lines they can edit or delete.
 *
 * Same two rules as PartsSearchLauncher: the button is type="button" (it sits
 * inside the estimate <form>, where a plain button would submit it), and the
 * dialog is portalled to <body> so it is never trapped under the app chrome.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useFeatureFlag } from '@/components/featureFlags/FeatureFlagProvider';
import { flagRequestHeaders } from '@/lib/featureFlags/requestHeaders';
import { formatMoney } from '@/lib/currencies';
import type { DraftResult, SuggestedLine } from '@/lib/estimates/draftFromHistory';

interface Props {
  vehicle: string;
  jobCardId: string;
  /** The estimate being edited, so it is not suggested to itself. */
  excludeId: string | null;
  onAdd: (lines: SuggestedLine[]) => void;
  className?: string;
}

export function DraftFromHistoryLauncher(props: Props) {
  const enabled = useFeatureFlag('estimate_drafting');
  if (!enabled) return null;
  return <Launcher {...props} />;
}

function Launcher({ vehicle, jobCardId, excludeId, onAdd, className }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DraftResult | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  async function load() {
    setOpen(true);
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/estimates/draft-from-history', {
        method: 'POST',
        credentials: 'include',
        headers: flagRequestHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ vehicle, jobCardId, excludeId }),
      });
      const body = await res.json() as DraftResult & { error?: string; disabled?: boolean };
      if (!res.ok || body.error) { setError(body.error || 'Could not look up past estimates.'); return; }
      if (body.disabled) { setError('Drafting from past jobs is not enabled for this shop.'); return; }
      setResult(body);
      // Pre-tick lines seen in more than one past estimate: the shop's usual work.
      setPicked(new Set(body.lines.map((l, i) => (l.seenIn > 1 ? i : -1)).filter(i => i >= 0)));
    } catch {
      setError('Could not look up past estimates.');
    } finally {
      setLoading(false);
    }
  }

  function toggle(i: number) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function add() {
    if (!result) return;
    const lines = result.lines.filter((_, i) => picked.has(i));
    if (lines.length > 0) onAdd(lines);
    setOpen(false);
  }

  const muted = { fontSize: 12, color: 'var(--muted)' } as const;
  const nothingToGoOn = !vehicle.trim() && !jobCardId;

  return (
    <>
      <button
        type="button"
        className={className}
        title="Suggest lines from your past estimates for this vehicle"
        onClick={load}
      >
        📋 Draft from past jobs
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog" aria-modal="true" aria-label="Draft from past jobs"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div style={{ background: 'var(--surface)', color: 'var(--text)', borderRadius: 12, width: 'min(720px, 100%)', maxHeight: '85vh', overflow: 'auto', padding: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 15, flex: 1 }}>Draft from past jobs</h3>
              <button type="button" className="mini-btn" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div style={{ ...muted, marginBottom: 12 }}>
              Lines from your own past estimates for the same make and model with similar work, at the prices you charged. Tick what applies, then edit as usual.
            </div>

            {nothingToGoOn && !loading && (
              <div style={muted}>Pick the vehicle or the job card first, so there is something to match on.</div>
            )}
            {loading && <div style={muted}>Looking through past estimates…</div>}
            {error && <div style={{ ...muted, color: '#ef4444' }}>{error}</div>}

            {result && (
              <>
                <div style={{ ...muted, marginBottom: 10 }}>
                  Matched on: {[...result.vehicleTerms, ...result.workTerms].join(', ') || '—'}
                  {result.matches.length > 0 && <> · {result.matches.length} similar estimate{result.matches.length === 1 ? '' : 's'}: {result.matches.map(m => m.number).join(', ')}</>}
                </div>

                {result.lines.length === 0 ? (
                  <div style={muted}>
                    No similar past estimates found. Add lines by hand or with Search Parts.
                    {result.workTerms.length === 0 && ' Linking a job card with notes gives better matches.'}
                  </div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.lines.map((l, i) => (
                      <li key={`${l.description}-${i}`}>
                        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', background: picked.has(i) ? 'rgba(34,197,94,0.06)' : 'transparent' }}>
                          <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} style={{ marginTop: 3 }} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{l.description}</span>
                            {l.laoDescription && <span style={{ ...muted, display: 'block' }}>{l.laoDescription}</span>}
                            <span style={{ ...muted, display: 'block', fontSize: 11 }}>
                              In {l.seenIn} past estimate{l.seenIn === 1 ? '' : 's'}: {l.sources.slice(0, 4).join(', ')}{l.sources.length > 4 ? '…' : ''}
                            </span>
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {l.qty} × {formatMoney(l.rate, l.currency)}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                  <button type="button" className="mini-btn" onClick={() => setOpen(false)}>Cancel</button>
                  <button type="button" className="mini-btn primary" disabled={picked.size === 0} onClick={add}>
                    Add {picked.size} line{picked.size === 1 ? '' : 's'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
