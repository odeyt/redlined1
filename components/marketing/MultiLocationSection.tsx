'use client';

import { useState, useEffect } from 'react';

const SHARED = ['Shared customer records', 'Shared vehicle history', 'Shared job-card visibility'];

/**
 * MultiLocationSection — matches the real, live shop_mirrors bidirectional
 * mirroring capability confirmed AVAILABLE NOW in PRODUCT_STATUS_MATRIX.md.
 */
export function MultiLocationSection() {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const t = setInterval(() => { setPulse(true); setTimeout(() => setPulse(false), 600); }, 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <section style={{ paddingBlock: 'clamp(56px,8vw,128px)', background: '#07070a', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes ml-sync-pulse { 0%,100%{opacity:0.3;transform:scale(1)} 50%{opacity:1;transform:scale(1.15)} }
        @keyframes ml-line-flow { 0%{stroke-dashoffset:40} 100%{stroke-dashoffset:0} }
        @keyframes ml-loc-glow { 0%,100%{box-shadow:0 0 0 rgba(99,102,241,0)} 50%{box-shadow:0 0 32px rgba(99,102,241,0.2)} }
        .ml-loc-card { transition: all 0.3s ease; }
        .ml-loc-card:hover { transform: translateY(-3px); border-color: rgba(99,102,241,0.4) !important; }
      `}</style>

      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(99,102,241,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.025) 1px,transparent 1px)', backgroundSize: '48px 48px' }} />
      <div aria-hidden="true" style={{ position: 'absolute', top: '20%', right: 0, width: 500, height: 400, background: 'radial-gradient(ellipse,rgba(99,102,241,0.07) 0%,transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: 1200, marginInline: 'auto', paddingInline: 'clamp(16px,5vw,48px)', position: 'relative', display: 'flex', gap: 64, alignItems: 'center', flexWrap: 'wrap' }}>

        {/* Left text */}
        <div style={{ flex: '1 1 360px', maxWidth: 520 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '6px 14px', borderRadius: 9999, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Multi-Location</span>
          </div>
          <h2 style={{ fontSize: 'clamp(26px,4vw,44px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', margin: '0 0 16px', lineHeight: 1.1 }}>
            Run every location from<br />
            <span style={{ color: '#6366f1' }}>one connected system.</span>
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', lineHeight: 1.8, margin: 0 }}>
            RedlineD1 mirrors customer, vehicle, and job data across multiple locations,
            so owners and staff see one shared picture instead of separate silos.
          </p>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 32, marginTop: 36, flexWrap: 'wrap' }}>
            {[
              { val: '100%', label: 'Real-time sync' },
              { val: '∞', label: 'Locations supported' },
              { val: '0', label: 'Data silos' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#6366f1', lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right visual */}
        <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>

          {/* Sync indicator */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', border: '1.5px solid rgba(99,102,241,0.5)',
              background: 'rgba(99,102,241,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
              animation: pulse ? 'ml-sync-pulse 0.6s ease' : 'none',
              boxShadow: pulse ? '0 0 24px rgba(99,102,241,0.6)' : '0 0 8px rgba(99,102,241,0.2)',
              transition: 'box-shadow 0.3s',
            }}>
              🔄
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em', background: '#0d0d14', padding: '2px 6px', borderRadius: 4 }}>Live Sync</span>
          </div>

          {['Location 1', 'Location 2'].map((loc, idx) => (
            <div
              key={loc}
              className="ml-loc-card"
              style={{
                padding: '24px 28px', borderRadius: 18,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(0,0,0,0.4) 100%)',
                border: '1px solid rgba(99,102,241,0.2)',
                marginLeft: idx === 1 ? 'auto' : 0,
                maxWidth: 300, width: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                  📍
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{loc}</div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
                  <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700 }}>LIVE</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {SHARED.map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                      <circle cx="6" cy="6" r="6" fill="rgba(99,102,241,0.2)" />
                      <path d="M3.5 6l1.5 1.5 3.5-3" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
