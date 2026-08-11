'use client';

import { useState, useEffect, useMemo } from 'react';
import type { InspectionItem } from '@/services/inspectionService';

/**
 * Guided DVI — one check at a time.
 *
 * The form lists every item at once: on a full template that is sixty-odd rows
 * of four-way radio buttons. A technician working down it on a phone, under a
 * car, loses their place and marks the wrong row — and because "N/A" is the
 * default, a missed row is indistinguishable from one deliberately skipped.
 *
 * Walking the list removes both problems. One check fills the screen, the
 * verdict is four large targets rather than four small ones, and the progress
 * count is of items actually judged — so "48 of 62" is a real statement about
 * the inspection rather than a scroll position.
 *
 * N/A stays available and stays meaningful: chosen here, it is a decision the
 * inspector made, which is what a customer report needs it to be.
 */

const VERDICTS: { value: InspectionItem['status']; label: string; color: string; bg: string }[] = [
  { value: 'Pass',      label: 'Pass',      color: '#16a34a', bg: 'rgba(34,197,94,0.14)' },
  { value: 'Attention', label: 'Attention', color: '#d97706', bg: 'rgba(245,158,11,0.14)' },
  { value: 'Fail',      label: 'Fail',      color: '#dc2626', bg: 'rgba(220,38,38,0.14)' },
  { value: 'N/A',       label: 'N/A',       color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
];

interface Props {
  items: InspectionItem[];
  /** Called on every change so the parent's form state stays authoritative. */
  onChange: (items: InspectionItem[]) => void;
  onPhoto: (itemId: string) => void;
  uploadingItemId: string | null;
  onClose: () => void;
  title: string;
}

export function GuidedInspection({ items, onChange, onPhoto, uploadingItemId, onClose, title }: Props) {
  const [idx, setIdx] = useState(0);
  // What the inspector actually judged this session. The stored status cannot
  // tell us: every item starts as 'N/A', so an untouched row and a deliberate
  // N/A look identical in the data.
  const [judged, setJudged] = useState<Set<string>>(new Set());
  const [showReview, setShowReview] = useState(false);

  const item = items[idx];
  const total = items.length;

  // Section boundaries, so the header can say which part of the car this is.
  const sections = useMemo(() => {
    const seen: string[] = [];
    items.forEach(i => { if (!seen.includes(i.category)) seen.push(i.category); });
    return seen;
  }, [items]);

  const sectionStart = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach((i, n) => { if (!(i.category in map)) map[i.category] = n; });
    return map;
  }, [items]);

  /**
   * Verdicts live in the parent's form state until Save, so closing the tab
   * mid-walkthrough loses them. Fifty checks marked under a car is an hour of
   * work, and the browser gives us exactly one chance to say so.
   *
   * Only armed once something has actually been judged — a confirmation
   * prompt on an untouched form is the kind of noise that teaches people to
   * dismiss it without reading.
   */
  useEffect(() => {
    if (judged.size === 0) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [judged.size]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showReview) return;
      const hit = { '1': 'Pass', '2': 'Attention', '3': 'Fail', '4': 'N/A' }[e.key];
      if (hit) { e.preventDefault(); setVerdict(hit as InspectionItem['status']); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
      if (e.key === 'Escape')     { e.preventDefault(); onClose(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // re-bound each render so the handlers close over the current index

  function patch(id: string, changes: Partial<InspectionItem>) {
    onChange(items.map(it => (it.id === id ? { ...it, ...changes } : it)));
  }

  function setVerdict(status: InspectionItem['status']) {
    if (!item) return;
    patch(item.id, { status });
    setJudged(prev => new Set(prev).add(item.id));
    // Pass and N/A need nothing further, so they advance. Attention and Fail
    // are where the notes and the photo matter — stopping there is the point.
    if (status === 'Pass' || status === 'N/A') setTimeout(next, 140);
  }

  function next() {
    // Reading idx directly rather than from a setIdx updater: an updater must
    // be pure, and calling setShowReview inside one meant the last item's Next
    // did nothing at all — the walkthrough stopped one short of the end.
    if (idx >= total - 1) { setShowReview(true); return; }
    setIdx(idx + 1);
  }

  const judgedCount = judged.size;
  const flagged = items.filter(i => i.status === 'Attention' || i.status === 'Fail');
  const unjudged = items.filter(i => !judged.has(i.id));

  const card: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--gi-card-edge)', borderRadius: 18,
    padding: 'clamp(16px, 4vw, 26px)', width: '100%', maxWidth: 620, boxSizing: 'border-box',
  };
  const ghost: React.CSSProperties = {
    minHeight: 48, padding: '12px 18px', borderRadius: 12, border: '1px solid var(--btn-border)',
    background: 'var(--btn-bg)', color: 'var(--muted)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  };

  return (
    <div className="gi-scope" role="dialog" aria-label="Guided inspection"
      style={{
        position: 'fixed', inset: 0, zIndex: 2500, background: 'rgba(0,0,0,0.88)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '16px 14px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        overflowY: 'auto',
      }}>
      <style>{`
        .gi-scope { --gi-field:#191922; --gi-edge:#66668c; --gi-card-edge:#3a3a52; }
        [data-theme="light"] .gi-scope { --gi-field:#f1f2f6; --gi-edge:#8b92a6; --gi-card-edge:#c3c7d3; }
        .gdvi-fade { animation: gdvi-in .2s ease both; }
        @keyframes gdvi-in { from { opacity:0; transform: translateY(6px);} to { opacity:1; transform:none; } }
        @media (prefers-reduced-motion: reduce) { .gdvi-fade { animation: none; } }
        .gdvi-verdicts { display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; }
        @media (min-width: 520px) { .gdvi-verdicts { grid-template-columns: repeat(4, 1fr); } }
      `}</style>

      {/* Progress */}
      <div style={{ width: '100%', maxWidth: 620, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 7 }}>
          <span style={{ opacity: 0.85 }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', opacity: 0.75, fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Back to form
          </button>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${total ? (judgedCount / total) * 100 : 0}%`, borderRadius: 99, background: 'linear-gradient(90deg, #22c55e, #16a34a)', transition: 'width .25s ease' }} />
        </div>
        <div style={{ color: '#fff', opacity: 0.7, fontSize: 12, marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span>
            {judgedCount} of {total} checked
            {flagged.length > 0 && <span style={{ color: '#f59e0b', marginLeft: 10 }}>· {flagged.length} flagged</span>}
          </span>
          {/* Always reachable. Any bug that stops the flow advancing must not
              also trap the inspector inside it. */}
          {!showReview && (
            <button onClick={() => setShowReview(true)}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 8, color: '#fff', padding: '5px 12px', minHeight: 32, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Review →
            </button>
          )}
        </div>
      </div>

      {/* ── One check ── */}
      {!showReview && item && (
        <div style={card} className="gdvi-fade" key={item.id}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>
            {item.category} · {idx + 1} of {total}
          </div>
          <h2 style={{ fontSize: 'clamp(18px, 4.4vw, 23px)', fontWeight: 800, margin: '0 0 16px', color: 'var(--text)', lineHeight: 1.25 }}>
            {item.name}
          </h2>

          <div className="gdvi-verdicts">
            {VERDICTS.map(v => {
              const active = item.status === v.value && judged.has(item.id);
              return (
                <button key={v.value} onClick={() => setVerdict(v.value)}
                  style={{
                    minHeight: 60, borderRadius: 14, cursor: 'pointer', fontSize: 15, fontWeight: 800,
                    border: `2px solid ${active ? v.color : 'var(--gi-edge)'}`,
                    background: active ? v.bg : 'var(--gi-field)',
                    color: active ? v.color : 'var(--text)',
                  }}>
                  {v.label}
                </button>
              );
            })}
          </div>

          {/* Notes and photo appear where they matter: a flagged item. */}
          {(item.status === 'Attention' || item.status === 'Fail') && judged.has(item.id) && (
            <div style={{ marginTop: 14, display: 'grid', gap: 10 }} className="gdvi-fade">
              <input
                value={item.notes}
                onChange={e => patch(item.id, { notes: e.target.value })}
                placeholder="What did you find? (optional)"
                style={{ width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '13px 15px', minHeight: 50, borderRadius: 12, border: '1px solid var(--gi-edge)', background: 'var(--gi-field)', color: 'var(--text)' }}
              />
              {item.photoUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.photoUrl} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--gi-edge)' }} />
                  <button onClick={() => onPhoto(item.id)} style={ghost}>Replace photo</button>
                </div>
              ) : (
                <button onClick={() => onPhoto(item.id)} disabled={uploadingItemId === item.id}
                  style={{ ...ghost, minHeight: 52 }}>
                  {uploadingItemId === item.id ? 'Uploading…' : '📷 Add photo'}
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0} style={{ ...ghost, opacity: idx === 0 ? 0.4 : 1 }}>← Back</button>
            <button onClick={next} style={{ ...ghost, flex: 1 }}>
              {idx >= total - 1 ? 'Finish →' : 'Next →'}
            </button>
          </div>

          <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--muted)' }}>
            Keys: 1 Pass · 2 Attention · 3 Fail · 4 N/A · ← → to move
          </p>
        </div>
      )}

      {/* ── Review ── */}
      {showReview && (
        <div style={card} className="gdvi-fade">
          <h2 style={{ fontSize: 'clamp(18px, 4.4vw, 23px)', fontWeight: 800, margin: '0 0 6px', color: 'var(--text)' }}>
            Inspection summary
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 16px' }}>
            {judgedCount} of {total} checked · {flagged.length} needing attention
          </p>

          {flagged.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
              {flagged.map(f => (
                <button key={f.id} onClick={() => { setShowReview(false); setIdx(items.findIndex(i => i.id === f.id)); }}
                  style={{ textAlign: 'left', padding: '11px 14px', borderRadius: 12, cursor: 'pointer', minHeight: 52,
                    border: `1px solid ${f.status === 'Fail' ? '#dc2626' : '#d97706'}`,
                    background: f.status === 'Fail' ? 'rgba(220,38,38,0.1)' : 'rgba(245,158,11,0.1)',
                    color: 'var(--text)', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{f.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: f.status === 'Fail' ? '#dc2626' : '#d97706' }}>{f.status.toUpperCase()}</span>
                </button>
              ))}
            </div>
          )}

          {unjudged.length > 0 && (
            <p style={{ fontSize: 13, color: 'var(--warn)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10, padding: '11px 14px', marginBottom: 14 }}>
              {unjudged.length} not checked. They will be reported as N/A —{' '}
              <button onClick={() => { setShowReview(false); setIdx(items.findIndex(i => !judged.has(i.id))); }}
                style={{ background: 'none', border: 'none', color: 'var(--warn)', font: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                go to the first one
              </button>.
            </p>
          )}

          {/* Jump straight to a section rather than stepping back through it. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {sections.map(s => (
              <button key={s} onClick={() => { setShowReview(false); setIdx(sectionStart[s]); }}
                style={{ padding: '8px 12px', minHeight: 44, borderRadius: 10, border: '1px solid var(--gi-edge)', background: 'var(--gi-field)', color: 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {s}
              </button>
            ))}
          </div>

          <button onClick={onClose}
            style={{ width: '100%', minHeight: 54, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
            Done — back to the form
          </button>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
            Photos upload as you add them. The verdicts save when you save the inspection.
          </p>
        </div>
      )}
    </div>
  );
}
