'use client';

/**
 * Parts Intelligence, inside the estimate.
 *
 * Not a shopping page. It opens beside the line the technician is already
 * writing, and its only output is one estimate line — priced, sourced and
 * frozen. Everything about the layout follows from that: the vehicle is shown
 * rather than asked for, the recommendation is explained rather than asserted,
 * and "Add to Estimate" is the single action.
 *
 * ## What it will not do
 *
 * It never adds a part on its own, however confident the score. The technician
 * chooses the part, the quantity and the markup, and can overwrite the sell
 * price outright. A recommendation is an argument, not a decision.
 *
 * ## Cost is a permission
 *
 * Source cost, shipping and markup are wholesale figures. The role comes back
 * from the server with the results — never from client state — and a role that
 * does not see costs sees only the sell price.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FITMENT_LABEL, FITMENT_WARNING, needsFitmentWarning } from '@/lib/parts/fitment';
import { LABEL_TEXT, type Recommendation } from '@/lib/parts/recommendation';
import { sellPriceFor, type MarkupType } from '@/lib/parts/snapshot';
import type { NormalizedPartResult, ProviderHealth, ProviderOutcome } from '@/lib/parts/types';

export interface ScoredResult extends NormalizedPartResult {
  recommendation: Recommendation;
}

export interface PartsSearchVehicle {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  engine?: string;
}

export interface AddPartPayload {
  part: NormalizedPartResult;
  qty: number;
  markupType: MarkupType;
  markupValue: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  shopId: string;
  currency: string;
  vehicle: PartsSearchVehicle;
  /** Label shown in the header, e.g. "2019 Toyota Tacoma 3.5L". */
  vehicleLabel?: string;
  onAdd: (payload: AddPartPayload) => void;
}

type SortKey = 'recommended' | 'landed' | 'item' | 'delivery' | 'fitment';

/**
 * Above every fixed element the app paints.
 *
 * AppShell's header is 8000, its nav overlay 9000, and Sidebar / ChatWidget /
 * EnvBanner are 9999. A dialog must cover the application, so it sits above
 * all of them. Exported so a test can assert it rather than trusting a
 * literal buried in a style object.
 */
export const MODAL_Z = 10000;

/** What the technician is searching by. */
export type SearchMode = 'description' | 'oem' | 'partNumber';

const MODE_LABEL: Record<SearchMode, string> = {
  description: 'Description',
  oem: 'OEM Number',
  partNumber: 'Part Number',
};

const MODE_PLACEHOLDER: Record<SearchMode, string> = {
  description: 'e.g. front brake pads',
  oem: 'e.g. 04465-0K340',
  partNumber: 'e.g. ACT976',
};

/** Said on every failure. The technician's next move, not an apology. */
export const MANUAL_FALLBACK = 'You can still add the part manually.';

/**
 * A technician-facing sentence for an HTTP status. Never the server's own.
 *
 * The proxy answers a session-less API call with "Unauthorized", and that
 * reached the technician verbatim — a word that names the problem and offers
 * nothing to do about it.
 */
export function messageForStatus(status: number): string {
  if (status === 401 || status === 403) {
    return 'Your session has expired. Reload the page and sign in again.';
  }
  if (status === 429) return 'Too many searches. Wait a moment and try again.';
  if (status === 422) return 'That search term was not accepted.';
  if (status >= 500) return 'Parts catalog is temporarily unavailable.';
  return 'Parts search could not be completed.';
}

/**
 * Every state the panel can be in, named.
 *
 * A click that silently does nothing is the defect this milestone exists to
 * fix, so "we are between states" is not allowed to be one of them.
 */
export type SearchState =
  | 'idle'
  | 'loading'
  | 'success'
  | 'empty'
  | 'error'
  | 'provider_unavailable';

const FITMENT_COLOR: Record<string, string> = {
  verified: '#16a34a',
  likely: '#d97706',
  unverified: '#6b7280',
  incompatible: '#dc2626',
};

const FITMENT_ORDER: Record<string, number> = {
  verified: 3, likely: 2, unverified: 1, incompatible: 0,
};

function money(v: number | null | undefined, cur: string): string {
  if (v === null || v === undefined) return '—';
  return `${cur} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Checked 4 minutes ago" — never "live". Cached data must not pretend. */
function checkedAgo(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 1) return 'Checked just now';
  if (mins === 1) return 'Checked 1 minute ago';
  if (mins < 60) return `Checked ${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? 'Checked 1 hour ago' : `Checked ${hrs} hours ago`;
}

function deliveryText(p: NormalizedPartResult): string {
  if (!p.estimatedDeliveryStart && !p.estimatedDeliveryEnd) return '—';
  const fmt = (s?: string) => {
    const t = Date.parse(s ?? '');
    return Number.isFinite(t)
      ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';
  };
  const a = fmt(p.estimatedDeliveryStart);
  const b = fmt(p.estimatedDeliveryEnd);
  return a && b && a !== b ? `${a}–${b}` : (b || a || '—');
}

export function PartsSearchModal({
  open, onClose, shopId, currency, vehicle, vehicleLabel, onAdd,
}: Props) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('description');
  const [state, setState] = useState<SearchState>('idle');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScoredResult[]>([]);
  const [providers, setProviders] = useState<ProviderHealth[]>([]);
  const [outcomes, setOutcomes] = useState<ProviderOutcome[]>([]);
  const [error, setError] = useState('');
  const [role, setRole] = useState('');
  const [sort, setSort] = useState<SortKey>('recommended');
  const [selected, setSelected] = useState<ScoredResult | null>(null);
  const [qty, setQty] = useState('1');
  const [markupType, setMarkupType] = useState<MarkupType>('percentage');
  const [markupValue, setMarkupValue] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // Owners and managers see wholesale. Technicians follow the existing rule
  // that hides costs from them, and the SERVER decided which they are.
  const canSeeCost = role === 'owner' || role === 'manager' || role === 'admin';

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [open]);

  // No reset effect. The parent renders this only while it is open, so closing
  // UNMOUNTS it and every field above resets by itself — which also guarantees
  // a stale result set can never be carried into a different estimate. An
  // effect that cleared state on close would do the same job less reliably and
  // would set state during render.

  async function runSearch(bypassCache = false) {
    const q = query.trim();
    if (q.length < 2) { setError('Enter at least two characters.'); setState('error'); return; }

    setLoading(true);
    setState('loading');
    setError('');
    try {
      const res = await fetch('/api/parts/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q, shopId, currency,
          // The mode decides which field the term is sent as. A part number
          // typed into a description search reaches a different provider
          // endpoint and comes back with different evidence, so choosing
          // "OEM Number" is a real instruction rather than a hint.
          ...(mode === 'oem' ? { oemNumber: q } : {}),
          ...(mode === 'partNumber' ? { manufacturerPartNumber: q } : {}),
          vin: vehicle.vin || undefined,
          year: vehicle.year, make: vehicle.make, model: vehicle.model,
          trim: vehicle.trim || undefined, engine: vehicle.engine || undefined,
          bypassCache: bypassCache || undefined,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        // Our own words, not the server's — and every failure ends with the
        // one thing the technician needs, which is that the estimate can
        // still be written by hand.
        setError(`${messageForStatus(res.status)} ${MANUAL_FALLBACK}`);
        setResults([]);
        setState('error');
        return;
      }

      const rows = Array.isArray(json?.results) ? json.results : [];
      const provs = Array.isArray(json?.providers) ? json.providers : [];
      setResults(rows);
      setProviders(provs);
      setOutcomes(Array.isArray(json?.outcomes) ? json.outcomes : []);
      setRole(typeof json?.role === 'string' ? json.role : '');
      if (json?.error) setError(json.error);

      // Named outcome, so the panel never sits in an unexplained blank.
      const anyEnabled = provs.some((p: ProviderHealth) => p.enabled);
      setState(
        json?.error ? 'error'
          : !anyEnabled ? 'provider_unavailable'
            : rows.length ? 'success' : 'empty',
      );
    } catch {
      // A network failure here is not an estimate failure. Say so plainly.
      setError(`Could not reach the parts service. ${MANUAL_FALLBACK}`);
      setResults([]);
      setState('error');
    } finally {
      setLoading(false);
    }
  }

  const sorted = useMemo(() => {
    const rows = [...results];
    switch (sort) {
      case 'landed':
        return rows.sort((a, b) => (a.landedCost ?? Infinity) - (b.landedCost ?? Infinity));
      case 'item':
        return rows.sort((a, b) => (a.itemPrice ?? Infinity) - (b.itemPrice ?? Infinity));
      case 'delivery':
        return rows.sort((a, b) =>
          (Date.parse(a.estimatedDeliveryEnd ?? '') || Infinity) -
          (Date.parse(b.estimatedDeliveryEnd ?? '') || Infinity));
      case 'fitment':
        return rows.sort((a, b) =>
          FITMENT_ORDER[b.fitmentStatus] - FITMENT_ORDER[a.fitmentStatus] ||
          b.recommendation.score - a.recommendation.score);
      default:
        return rows.sort((a, b) => b.recommendation.score - a.recommendation.score);
    }
  }, [results, sort]);

  /** Only providers that actually returned data appear in the comparison. */
  const comparison = useMemo(() => {
    if (!selected) return [];
    const key = (selected.manufacturerPartNumber ?? '').toUpperCase();
    if (!key) return [];
    return results.filter(r =>
      (r.manufacturerPartNumber ?? '').toUpperCase() === key &&
      typeof r.landedCost === 'number');
  }, [results, selected]);

  if (!open) return null;
  // The portal needs a document. A guard rather than a mounted flag set from
  // an effect: this only ever renders after a click, so there is no server
  // render to hydrate against and no state to set during one.
  if (typeof document === 'undefined') return null;

  const enabled = providers.filter(p => p.enabled);
  const disabled = providers.filter(p => !p.enabled);

  const qtyNum = Math.max(1, Number(qty) || 1);
  const landed = selected?.landedCost ?? selected?.itemPrice ?? 0;

  /**
   * Whether the SOURCE quoted a price at all.
   *
   * A catalogue (AutoPartsAPI) identifies a part; it does not sell it. With no
   * source price a percentage markup has nothing to apply to — 35% of nothing
   * is nothing — so the only honest control is the shop typing the sell price
   * itself, through the estimate's existing manual pricing.
   */
  const hasSourcePrice = typeof selected?.landedCost === 'number'
    || typeof selected?.itemPrice === 'number';

  // Forced to manual when there is no source price, rather than silently
  // producing a zero-cost line.
  const effectiveMarkupType: MarkupType = hasSourcePrice ? markupType : 'manual';

  const markupNum = Number(markupValue);
  const markupReady = markupValue.trim() !== '' && Number.isFinite(markupNum);
  const sellUnit = selected && markupReady
    ? sellPriceFor(landed, effectiveMarkupType, markupNum)
    : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search parts"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        // ABOVE the app chrome, and portalled to <body>.
        //
        // This is the bug that made the button look dead. At 3000 the dialog
        // opened UNDERNEATH AppShell's header (8000) and Sidebar (9999), so
        // its title, close button and search field were painted behind the
        // application. Measured in a browser: the card's top sat at y=14 with
        // a 72px header over it.
        //
        // The portal matters as much as the number. Rendering inside the
        // estimate panel leaves the dialog at the mercy of any ancestor that
        // creates a containing block (transform, filter, contain) or clips
        // with overflow. Escaping to <body> removes that whole class of bug
        // rather than this one instance of it.
        zIndex: MODAL_Z,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '2vh 8px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', color: 'var(--text)', borderRadius: 12,
          // Single column on a phone, comfortable on a desktop. Never wider
          // than the viewport, so the page body cannot scroll sideways.
          width: '100%', maxWidth: 860, marginBottom: 24,
          border: '1px solid var(--line)', boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Search Parts</div>
              {/* The vehicle is SHOWN, never re-entered — Redlined1 already
                  knows it from the estimate. */}
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                {vehicleLabel || 'No vehicle linked to this estimate'}
                {vehicle.vin && (
                  <span style={{ marginLeft: 8 }}>
                    VIN ••••{vehicle.vin.slice(-4)}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close"
              style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>
              ✕
            </button>
          </div>

          {/* Search by — the term means different things to the providers, so
              the technician says which it is rather than us guessing. */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }} role="group" aria-label="Search by">
            {(Object.keys(MODE_LABEL) as SearchMode[]).map(m => (
              <button
                key={m}
                type="button"
                data-testid={`mode-${m}`}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', minHeight: 36,
                  border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--line)'}`,
                  background: mode === m ? 'var(--accent)' : 'transparent',
                  color: mode === m ? '#fff' : 'var(--text)',
                }}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void runSearch(); } }}
              placeholder={MODE_PLACEHOLDER[mode]}
              maxLength={120}
              aria-label="Part search"
              style={{
                flex: '1 1 220px', minWidth: 0, border: '1px solid var(--line)',
                borderRadius: 8, padding: '10px 12px', fontSize: 14,
                background: 'var(--surface-soft)', color: 'var(--text)',
              }}
            />
            <button
              onClick={() => void runSearch()}
              disabled={loading}
              className="btn btn-primary"
              style={{ minHeight: 44, padding: '0 20px', fontWeight: 700 }}
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>

          {/* Provider strip. Honest about what is off and why. */}
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', fontSize: 11 }}>
            {enabled.map(p => (
              <span key={p.id} style={{ color: '#16a34a', fontWeight: 700 }}>✓ {p.name}</span>
            ))}
            {disabled.map(p => (
              <span key={p.id} title={p.reason} style={{ color: 'var(--muted)' }}>
                ○ {p.name} unavailable
              </span>
            ))}
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div style={{ padding: '16px 20px' }}>
          {error && (
            <div style={{
              background: 'rgba(220,38,38,0.08)', border: '1px solid #fca5a5',
              color: '#b91c1c', borderRadius: 8, padding: '10px 12px',
              fontSize: 13, marginBottom: 12,
            }}>
              {error}
            </div>
          )}

          {outcomes.filter(o => !o.ok).map(o => (
            <div key={o.provider} style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid #f59e0b',
              color: '#b45309', borderRadius: 8, padding: '8px 12px',
              fontSize: 12, marginBottom: 8,
            }}>
              {o.provider}: {o.message} You can still add the part manually.
            </div>
          ))}

          {/* One line per named state, so the technician is never left
              guessing whether the click registered. */}
          <div data-testid="search-state" data-state={state} aria-live="polite">
            {state === 'idle' && (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                Enter a {MODE_LABEL[mode].toLowerCase()} and press Search.
              </div>
            )}
            {state === 'loading' && (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                Searching parts...
              </div>
            )}
            {state === 'empty' && (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                No matching parts found. {MANUAL_FALLBACK}
              </div>
            )}
            {state === 'provider_unavailable' && (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                Parts catalog unavailable. You can still add a part manually.
              </div>
            )}
          </div>

          {results.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {([
                ['recommended', 'Recommended'],
                ['landed', 'Lowest landed cost'],
                ['item', 'Item price'],
                ['delivery', 'Delivery'],
                ['fitment', 'Fitment'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  style={{
                    padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', minHeight: 32,
                    border: `1px solid ${sort === key ? 'var(--accent)' : 'var(--line)'}`,
                    background: sort === key ? 'var(--accent)' : 'transparent',
                    color: sort === key ? '#fff' : 'var(--text)',
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => void runSearch(true)}
                title="Ask the providers again instead of using the cached answer"
                style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', minHeight: 32, border: '1px dashed var(--line)',
                  background: 'transparent', color: 'var(--muted)',
                }}
              >
                ⟳ Refresh prices
              </button>
            </div>
          )}

          {/* ── Results ──────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sorted.map((r, i) => {
              const isSelected = selected === r;
              const incompatible = r.fitmentStatus === 'incompatible';
              return (
                <div
                  key={`${r.provider}-${r.providerListingId ?? i}`}
                  style={{
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: 10, padding: 12,
                    background: isSelected ? 'rgba(204,0,0,0.04)' : 'var(--surface-soft)',
                    opacity: incompatible ? 0.65 : 1,
                  }}
                >
                  {r.recommendation.label && (
                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: '.06em', marginBottom: 6 }}>
                      🏆 {LABEL_TEXT[r.recommendation.label]}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {r.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.imageUrl}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 6, background: '#fff', flexShrink: 0 }}
                      />
                    )}

                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, wordBreak: 'break-word' }}>{r.title}</div>

                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, fontSize: 11 }}>
                        <span style={{ fontWeight: 800, color: FITMENT_COLOR[r.fitmentStatus] }}>
                          {FITMENT_LABEL[r.fitmentStatus]}
                        </span>
                        {r.brand && <span style={{ color: 'var(--muted)' }}>{r.brand}</span>}
                        {r.manufacturerPartNumber && <span style={{ color: 'var(--muted)' }}>#{r.manufacturerPartNumber}</span>}
                        <span style={{ color: 'var(--muted)' }}>{r.provider}</span>
                        {r.condition && <span style={{ color: 'var(--muted)' }}>{r.condition}</span>}
                      </div>

                      {needsFitmentWarning(r.fitmentStatus) && (
                        <div style={{ fontSize: 11, color: '#b45309', marginTop: 6, fontWeight: 700 }}>
                          ⚠ {FITMENT_WARNING}
                        </div>
                      )}
                      {r.fitmentReason && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{r.fitmentReason}</div>
                      )}

                      <div style={{ marginTop: 8, fontSize: 12 }}>
                        {canSeeCost ? (
                          <>
                            <div>Item {money(r.itemPrice, r.currency)}</div>
                            <div>Shipping {r.shippingCost === undefined ? 'not stated' : money(r.shippingCost, r.currency)}</div>
                            <div style={{ fontWeight: 800 }}>Landed {money(r.landedCost, r.currency)}</div>
                            {r.landedCostCompleteness === 'partial' && (
                              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                                Excludes tax and import duty — not published by the seller.
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ color: 'var(--muted)' }}>Source pricing hidden for your role.</div>
                        )}
                        <div style={{ color: 'var(--muted)', marginTop: 4 }}>
                          Delivery {deliveryText(r)} · Score {r.recommendation.score}/100
                        </div>
                        <div style={{ color: 'var(--muted)', fontSize: 10, marginTop: 2 }}>
                          {checkedAgo(r.sourceCheckedAt, now)}
                        </div>
                      </div>

                      {r.recommendation.reasons.length > 0 && (
                        <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 11, color: 'var(--muted)' }}>
                          {r.recommendation.reasons.map((reason, idx) => <li key={idx}>{reason}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => { setSelected(r); setMarkupValue(''); }}
                    disabled={incompatible}
                    style={{
                      marginTop: 10, width: '100%', minHeight: 44, borderRadius: 8,
                      border: '1px solid var(--accent)', cursor: incompatible ? 'not-allowed' : 'pointer',
                      background: isSelected ? 'var(--accent)' : 'transparent',
                      color: isSelected ? '#fff' : 'var(--accent)', fontWeight: 700, fontSize: 13,
                    }}
                  >
                    {incompatible ? 'Does not fit this vehicle' : isSelected ? 'Selected' : 'Select this part'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* ── Price comparison, only where real data exists ─────────────── */}
          {comparison.length > 1 && (
            <div style={{ marginTop: 16, overflowX: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', marginBottom: 6 }}>
                {selected?.manufacturerPartNumber} — across providers
              </div>
              <table style={{ width: '100%', minWidth: 380, borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Provider', 'Item', 'Shipping', 'Landed'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((c, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px 8px' }}>{c.provider}</td>
                      <td style={{ padding: '6px 8px' }}>{money(c.itemPrice, c.currency)}</td>
                      <td style={{ padding: '6px 8px' }}>{c.shippingCost === 0 ? 'Free' : money(c.shippingCost, c.currency)}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 700 }}>{money(c.landedCost, c.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Add bar. Sticky, so it is reachable on a phone. ─────────────── */}
        {selected && (
          <div style={{
            position: 'sticky', bottom: 0, background: 'var(--surface)',
            borderTop: '1px solid var(--line)', padding: '12px 20px',
            borderRadius: '0 0 12px 12px',
          }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', flex: '0 0 70px' }}>
                Qty
                <input
                  type="number" min={1} value={qty}
                  onChange={e => setQty(e.target.value)}
                  style={{ width: '100%', minHeight: 40, border: '1px solid var(--line)', borderRadius: 6, padding: '6px 8px', background: 'var(--surface-soft)', color: 'var(--text)' }}
                />
              </label>

              <label style={{ fontSize: 11, color: 'var(--muted)', flex: '0 0 120px' }}>
                Markup
                <select
                  value={effectiveMarkupType}
                  disabled={!hasSourcePrice}
                  title={hasSourcePrice ? undefined : 'This source publishes no price, so the sell price is set directly.'}
                  onChange={e => setMarkupType(e.target.value as MarkupType)}
                  style={{ width: '100%', minHeight: 40, border: '1px solid var(--line)', borderRadius: 6, padding: '6px 8px', background: 'var(--surface-soft)', color: 'var(--text)' }}
                >
                  <option value="percentage">Percent</option>
                  <option value="fixed">Fixed amount</option>
                  <option value="manual">Set sell price</option>
                </select>
              </label>

              <label style={{ fontSize: 11, color: 'var(--muted)', flex: '0 0 110px' }}>
                {effectiveMarkupType === 'percentage' ? '%' : effectiveMarkupType === 'fixed' ? 'Amount' : 'Sell price'}
                <input
                  type="number" inputMode="decimal" value={markupValue}
                  onChange={e => setMarkupValue(e.target.value)}
                  // No default. Inventing one would price a customer's job on
                  // a number nobody chose.
                  placeholder="—"
                  style={{ width: '100%', minHeight: 40, border: '1px solid var(--line)', borderRadius: 6, padding: '6px 8px', background: 'var(--surface-soft)', color: 'var(--text)' }}
                />
              </label>

              <div style={{ flex: '1 1 140px', fontSize: 12 }}>
                {canSeeCost && (
                  <div style={{ color: 'var(--muted)' }}>
                    {/* A catalogue publishes what a part IS, not what it costs.
                        Saying so is the honest answer; inventing a number here
                        would put a price on a customer's estimate that no
                        seller has ever quoted. */}
                    {hasSourcePrice
                      ? `Landed ${money(landed, selected.currency)}`
                      : 'Price unavailable from this source'}
                  </div>
                )}
                <div style={{ fontWeight: 800 }}>
                  Sell {sellUnit === null ? '—' : money(sellUnit, selected.currency)}
                  {qtyNum > 1 && sellUnit !== null && (
                    <span style={{ color: 'var(--muted)', fontWeight: 500 }}> × {qtyNum}</span>
                  )}
                </div>
              </div>

              <button
                onClick={() => {
                  if (sellUnit === null) return;
                  onAdd({ part: selected, qty: qtyNum, markupType: effectiveMarkupType, markupValue: markupNum });
                  onClose();
                }}
                disabled={sellUnit === null}
                className="btn btn-primary"
                style={{ flex: '1 1 160px', minHeight: 44, fontWeight: 800, opacity: sellUnit === null ? 0.5 : 1 }}
              >
                Add to Estimate
              </button>
            </div>

            {sellUnit === null && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                {hasSourcePrice
                  ? 'Enter a markup to price this line. There is no shop default, so nothing is assumed.'
                  : 'This source lists the part but not a price. Enter the sell price to add it.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
