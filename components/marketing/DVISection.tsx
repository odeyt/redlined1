'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const D = {
  bg: '#080808',
  surface: '#0d0d14',
  surfaceSoft: '#111118',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',
  red: '#cc0000',
  redBright: '#e74c3c',
  redGlow: 'rgba(204,0,0,0.3)',
  green: '#22d3a0',
  amber: '#f59e0b',
  blue: '#60a5fa',
  text: '#e8eaf0',
  muted: 'rgba(255,255,255,0.45)',
  mutedLight: 'rgba(255,255,255,0.28)',
};

const STEP_COLORS = ['#60a5fa','#fbbf24','#22d3a0','#a78bfa','#34d399','#e74c3c'];

// ── SVG inspection photo (battery fail) ─────────────────────────────────────
function InspectionPhoto() {
  return (
    <svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', borderRadius: 10, display: 'block' }}>
      <defs>
        <radialGradient id="bg-grd" cx="40%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#1a1a1a" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </radialGradient>
        <radialGradient id="light-grd" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,220,120,0.18)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <filter id="blur2">
          <feGaussianBlur stdDeviation="2" />
        </filter>
        <filter id="glow-red">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Engine bay background */}
      <rect width="320" height="200" fill="url(#bg-grd)" />

      {/* Engine bay texture lines */}
      <line x1="0" y1="180" x2="320" y2="180" stroke="#222" strokeWidth="8" />
      <rect x="0" y="175" width="320" height="25" fill="#111" />
      <line x1="40" y1="0" x2="40" y2="180" stroke="#1a1a1a" strokeWidth="12" />
      <line x1="280" y1="0" x2="280" y2="180" stroke="#1a1a1a" strokeWidth="12" />

      {/* Engine block suggestion */}
      <rect x="55" y="60" width="210" height="90" rx="4" fill="#1c1c1c" stroke="#2a2a2a" strokeWidth="1" />
      <rect x="70" y="75" width="80" height="55" rx="3" fill="#232323" stroke="#333" strokeWidth="1" />
      <rect x="170" y="75" width="80" height="55" rx="3" fill="#232323" stroke="#333" strokeWidth="1" />

      {/* Hoses / wires */}
      <path d="M 60 30 Q 100 50 80 120" stroke="#2d2d2d" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M 260 25 Q 220 60 240 130" stroke="#2d2d2d" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M 120 25 Q 160 45 155 70" stroke="#333" strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* BATTERY — main subject */}
      <rect x="88" y="22" width="144" height="80" rx="6" fill="#1e1e24" stroke="#444" strokeWidth="1.5" />
      {/* Battery label */}
      <rect x="100" y="32" width="120" height="30" rx="3" fill="#cc0000" opacity="0.85" />
      <text x="160" y="51" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="monospace">BATTERY</text>
      {/* Battery body detail */}
      <rect x="96" y="68" width="28" height="26" rx="2" fill="#252525" stroke="#555" strokeWidth="1" />
      <rect x="130" y="68" width="28" height="26" rx="2" fill="#252525" stroke="#555" strokeWidth="1" />
      <rect x="164" y="68" width="28" height="26" rx="2" fill="#252525" stroke="#555" strokeWidth="1" />
      <rect x="198" y="68" width="28" height="26" rx="2" fill="#252525" stroke="#555" strokeWidth="1" />
      {/* Terminals */}
      <rect x="100" y="16" width="16" height="12" rx="2" fill="#888" />
      <rect x="204" y="16" width="16" height="12" rx="2" fill="#888" />
      {/* Terminal posts */}
      <circle cx="108" cy="16" r="5" fill="#aaa" />
      <circle cx="212" cy="16" r="5" fill="#aaa" />

      {/* CORROSION on positive terminal (white/blue-ish crust) */}
      <ellipse cx="108" cy="14" rx="10" ry="6" fill="rgba(180,200,220,0.55)" filter="url(#blur2)" />
      <ellipse cx="108" cy="13" rx="7" ry="4" fill="rgba(200,220,240,0.7)" />

      {/* Spotlight glow over battery */}
      <ellipse cx="160" cy="55" rx="80" ry="50" fill="url(#light-grd)" />

      {/* RED WARNING CIRCLE + X overlay on battery */}
      <circle cx="250" cy="35" r="18" fill="rgba(220,38,38,0.15)" stroke="#ef4444" strokeWidth="2" filter="url(#glow-red)" />
      <line x1="242" y1="27" x2="258" y2="43" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="258" y1="27" x2="242" y2="43" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />

      {/* Measurement annotation */}
      <rect x="55" y="150" width="210" height="22" rx="4" fill="rgba(0,0,0,0.7)" stroke="rgba(239,68,68,0.5)" strokeWidth="1" />
      <text x="66" y="165" fill="#f87171" fontSize="9" fontWeight="700" fontFamily="monospace">⚡ LOAD TEST: 234 CCA</text>
      <text x="190" y="165" fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="monospace">SPEC: 550 CCA</text>

      {/* FAIL badge */}
      <rect x="62" y="108" width="40" height="16" rx="8" fill="rgba(239,68,68,0.9)" />
      <text x="82" y="119" textAnchor="middle" fill="white" fontSize="8" fontWeight="800" fontFamily="sans-serif">FAIL</text>

      {/* Photo corner watermark */}
      <text x="8" y="14" fill="rgba(255,255,255,0.18)" fontSize="8" fontFamily="monospace">RD1 INSPECT</text>
      <text x="248" y="195" fill="rgba(255,255,255,0.18)" fontSize="7" fontFamily="monospace">J.SANTOS · DVI-0042</text>

      {/* Vignette */}
      <rect width="320" height="200" fill="url(#vignette)" opacity="0.6" />
      <defs>
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="50%" stopColor="transparent" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
      </defs>
    </svg>
  );
}

// ── Workflow step screens ────────────────────────────────────────────────────
const DEMO_STEPS = [
  {
    label: 'Inspect', icon: '📋', color: '#60a5fa',
    headline: 'Structured checklist on any device',
    sub: 'Technicians work through a consistent 26-item template. Nothing gets missed.',
    component: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { name: 'Front brake pads', status: 'attention', note: '3 mm remaining', done: true },
          { name: 'Rear brake pads',  status: 'pass',      note: '',              done: true },
          { name: 'Brake fluid',      status: 'pass',      note: '',              done: true },
          { name: 'Battery',          status: 'fail',      note: 'Load test failed', done: true },
          { name: 'Air filter',       status: 'attention', note: 'Heavily soiled', done: true },
          { name: 'Front left tire',  status: 'pass',      note: '',              done: false },
        ].map((item, i) => {
          const cfg = { pass: { bg: 'rgba(34,211,160,0.08)', border: 'rgba(34,211,160,0.25)', dot: '#22d3a0', label: 'Pass', fg: '#4ade80' }, attention: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', dot: '#f59e0b', label: 'Attention', fg: '#fbbf24' }, fail: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.35)', dot: '#ef4444', label: 'Fail', fg: '#f87171' } }[item.status] ?? { bg: 'rgba(255,255,255,0.04)', border: D.border, dot: '#aaa', label: '?', fg: '#aaa' };
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: item.done ? cfg.bg : 'rgba(255,255,255,0.03)', border: `1px solid ${item.done ? cfg.border : D.border}`, opacity: item.done ? 1 : 0.5 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${item.done ? cfg.dot : 'rgba(255,255,255,0.2)'}`, background: item.done ? `${cfg.dot}22` : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {item.done && <span style={{ fontSize: 8, color: cfg.dot }}>✓</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: item.done ? D.text : D.muted }}>{item.name}</div>
                {item.note && <div style={{ fontSize: 10, color: D.muted, marginTop: 1 }}>{item.note}</div>}
              </div>
              {item.done && (
                <span style={{ fontSize: 10, fontWeight: 700, color: cfg.fg, background: cfg.bg, border: `1px solid ${cfg.border}`, padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>{cfg.label}</span>
              )}
            </div>
          );
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, padding: '6px 10px', borderRadius: 8, background: 'rgba(96,165,250,0.08)', border: '1px dashed rgba(96,165,250,0.3)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', boxShadow: '0 0 6px #60a5fa', animation: 'pulse 1s infinite' }} />
          <span style={{ fontSize: 11, color: '#60a5fa' }}>Front left tire — in progress…</span>
        </div>
      </div>
    ),
  },
  {
    label: 'Document', icon: '📷', color: '#fbbf24',
    headline: 'Photo evidence attached on the spot',
    sub: 'Tap any item to attach a photo directly from your phone camera. Visual proof builds trust.',
    component: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#f87171' }}>Battery — FAIL · Load test 234 CCA (spec 550)</span>
        </div>
        {/* The inspection photo */}
        <div style={{ borderRadius: 10, overflow: 'hidden', border: '1.5px solid rgba(239,68,68,0.4)', boxShadow: '0 0 24px rgba(239,68,68,0.2)' }}>
          <InspectionPhoto />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['Terminal corrosion visible', 'Load test below spec', 'CCA drop critical'].map((tag, i) => (
            <span key={i} style={{ fontSize: 10, fontWeight: 600, color: '#fbbf24', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: '3px 8px', borderRadius: 999 }}>{tag}</span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: D.muted, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: `1px solid ${D.border}` }}>
          📝 Tech note: <span style={{ color: D.text }}>Terminal corrosion on positive post. Battery failed load test at 234 CCA against 550 CCA spec. Recommend immediate replacement.</span>
        </div>
      </div>
    ),
  },
  {
    label: 'Review', icon: '🔍', color: '#22d3a0',
    headline: 'Instant summary — Pass, Attention, Fail',
    sub: 'Critical findings surface immediately. Nothing buried. Nothing missed.',
    component: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
          {[{ l: 'Fail', c: 1, color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)' }, { l: 'Attention', c: 3, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' }, { l: 'Pass', c: 18, color: '#22d3a0', bg: 'rgba(34,211,160,0.1)', border: 'rgba(34,211,160,0.3)' }, { l: 'N/A', c: 2, color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.04)', border: D.border }].map(s => (
            <div key={s.l} style={{ textAlign: 'center', padding: '12px 4px', borderRadius: 10, background: s.bg, border: `1.5px solid ${s.border}` }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: s.color, lineHeight: 1, textShadow: `0 0 16px ${s.color}` }}>{s.c}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 6, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', display: 'flex' }}>
          <div style={{ width: '4%',  background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
          <div style={{ width: '12.5%', background: '#f59e0b', boxShadow: '0 0 8px #f59e0b' }} />
          <div style={{ width: '75%', background: '#22d3a0', boxShadow: '0 0 8px #22d3a0' }} />
          <div style={{ flex: 1,   background: 'rgba(255,255,255,0.12)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[{ name: 'Battery', status: 'Fail', note: 'Load test 234 CCA / 550 CCA spec', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' }, { name: 'Front brake pads', status: 'Attention', note: '3 mm remaining — monitor', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' }, { name: 'Air filter', status: 'Attention', note: 'Heavily soiled', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' }, { name: 'Rear left tire', status: 'Attention', note: '4/32 tread depth', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' }].map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: it.bg, border: `1px solid ${it.border}` }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: it.color, background: `${it.color}18`, padding: '2px 6px', borderRadius: 999, whiteSpace: 'nowrap' }}>{it.status}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: D.text }}>{it.name}</div>
                <div style={{ fontSize: 10, color: D.muted }}>{it.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    label: 'Share', icon: '🔗', color: '#a78bfa',
    headline: 'Secure share link — sent instantly',
    sub: 'One tap sends the full report to the customer. No app. No login. Any device.',
    component: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(167,139,250,0.08)', border: '1.5px solid rgba(167,139,250,0.35)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(167,139,250,0.15)', border: '1.5px solid rgba(167,139,250,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🔗</div>
          <div>
            <div style={{ fontSize: 11, color: D.muted, marginBottom: 3 }}>Secure inspection link</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', fontFamily: 'monospace' }}>redlined1.app/i/dvi-0042-x7k9p</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[{ icon: '📱', label: 'SMS sent', sub: 'Khun Somchai +66 81 234 5678', done: true, color: '#22d3a0' }, { icon: '✉️', label: 'Email sent', sub: 'somchai@email.com', done: true, color: '#22d3a0' }, { icon: '📋', label: 'Link copied to clipboard', sub: 'Ready to paste in LINE / WhatsApp', done: true, color: '#22d3a0' }].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'rgba(34,211,160,0.06)', border: '1px solid rgba(34,211,160,0.2)' }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: D.text }}>{item.label}</div>
                <div style={{ fontSize: 10, color: D.muted }}>{item.sub}</div>
              </div>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(34,211,160,0.2)', border: '1.5px solid #22d3a0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: '#22d3a0' }}>✓</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.border}`, fontSize: 11, color: D.muted, textAlign: 'center' }}>
          Customer can review + approve from any device — no account needed
        </div>
      </div>
    ),
  },
  {
    label: 'Approve', icon: '✅', color: '#34d399',
    headline: 'Customer approves each item online',
    sub: 'Digital approval replaces phone tag. Timestamped. Traceable. Professional.',
    component: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)', fontSize: 11, color: '#34d399', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
          Customer is reviewing — DVI-0042 · opened 2 min ago
        </div>
        {[
          { name: 'Battery replacement', price: '฿2,800', approve: true },
          { name: 'Front brake pads', price: '฿1,400', approve: true },
          { name: 'Air filter replacement', price: '฿320', approve: null },
          { name: 'Rear tires (pair)', price: '฿4,200', approve: false },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: item.approve === true ? 'rgba(52,211,153,0.08)' : item.approve === false ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${item.approve === true ? 'rgba(52,211,153,0.3)' : item.approve === false ? 'rgba(239,68,68,0.2)' : D.border}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: D.text }}>{item.name}</div>
              <div style={{ fontSize: 11, color: D.muted }}>{item.price}</div>
            </div>
            {item.approve === true && (
              <span style={{ fontSize: 10, fontWeight: 800, color: '#34d399', background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)', padding: '3px 9px', borderRadius: 999 }}>APPROVED ✓</span>
            )}
            {item.approve === false && (
              <span style={{ fontSize: 10, fontWeight: 800, color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: '3px 9px', borderRadius: 999 }}>DECLINED</span>
            )}
            {item.approve === null && (
              <span style={{ fontSize: 10, color: D.muted, background: 'rgba(255,255,255,0.04)', border: `1px solid ${D.border}`, padding: '3px 9px', borderRadius: 999 }}>Pending…</span>
            )}
          </div>
        ))}
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: D.muted }}>Approved total</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#34d399' }}>฿4,200</div>
          </div>
          <div style={{ fontSize: 10, color: D.muted, textAlign: 'right' }}>
            <div>Signed: Somchai Wiroj</div>
            <div style={{ color: 'rgba(255,255,255,0.2)' }}>2026-07-16 · 14:38</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    label: 'Repair', icon: '🔧', color: '#e74c3c',
    headline: 'One click to estimate and job card',
    sub: 'Approved findings become a quote instantly. No re-entry. Close the loop.',
    component: () => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(231,76,60,0.8)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Estimate</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>EST-0089 · 2019 Toyota Hilux</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#fbbf24', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', padding: '3px 9px', borderRadius: 999 }}>AWAITING PARTS</span>
        </div>
        {[
          { part: 'Battery 80D26R', labor: 'Install', price: '฿2,800', status: 'ordered' },
          { part: 'Brake pads front', labor: 'Replace + bleed', price: '฿1,400', status: 'in-stock' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.border}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: D.text }}>{item.part}</div>
              <div style={{ fontSize: 10, color: D.muted }}>Labor: {item.labor}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: D.text }}>{item.price}</div>
              <span style={{ fontSize: 9, fontWeight: 700, color: item.status === 'in-stock' ? '#22d3a0' : '#fbbf24', background: item.status === 'in-stock' ? 'rgba(34,211,160,0.1)' : 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: 999, border: `1px solid ${item.status === 'in-stock' ? 'rgba(34,211,160,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                {item.status === 'in-stock' ? 'In stock' : 'Ordered'}
              </span>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.25)' }}>
          <span style={{ fontSize: 12, color: D.muted }}>Total approved</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#e74c3c', textShadow: '0 0 16px rgba(231,76,60,0.5)' }}>฿4,200</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: D.red, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#fff', boxShadow: '0 4px 16px rgba(204,0,0,0.4)', cursor: 'pointer' }}>
            Open Job Card →
          </div>
          <div style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid ${D.border}`, textAlign: 'center', fontSize: 12, fontWeight: 600, color: D.muted, cursor: 'pointer' }}>
            Send Invoice
          </div>
        </div>
      </div>
    ),
  },
];

// ── Feature pills (unchanged data, new style) ────────────────────────────────
const FEATURES: { icon: string; title: string; color: string; detail: string }[] = [
  { icon: '📋', title: 'Built-In Checklists', color: '#818cf8', detail: 'Default 26-item checklist covers Brakes, Tires, Fluids, Lights, Under Hood, and Suspension — plus intake and outtake QA checklists. Custom shop templates also supported.' },
  { icon: '🔴', title: 'Pass / Attention / Fail', color: '#ef4444', detail: 'Every item classified and colour-coded. Critical findings surface immediately. Customers see a clear visual summary — no interpretation required.' },
  { icon: '📷', title: 'Per-Item Photos', color: '#38bdf8', detail: 'Attach a photo to any item from a phone or tablet. Photos appear in the customer report alongside the finding. Visual evidence removes doubt and builds trust.' },
  { icon: '✍️', title: 'Technician Notes', color: '#fbbf24', detail: 'Measurements, observations, and repair recommendations carry over to the estimate automatically. No re-entry.' },
  { icon: '🔗', title: 'Customer Share Link', color: '#22d3a0', detail: 'Secure unique link for each inspection. No account required to view. Customers review the full report on any device.' },
  { icon: '✅', title: 'Online Approval', color: '#a78bfa', detail: 'Customers approve or decline each finding individually. Name-signed digital approval is timestamped and stored. No paper, no phone tag.' },
  { icon: '✉️', title: 'Email Report', color: '#f472b6', detail: 'Send the full report to the customer email from inside the app. Includes link to interactive report — no download needed.' },
  { icon: '📄', title: 'Connected to Estimates', color: '#2dd4bf', detail: 'Convert a completed inspection to an estimate in one click. Findings carry over without re-entry. AI-assisted estimate drafting available.' },
  { icon: '📂', title: 'Vehicle History', color: '#e74c3c', detail: 'Every inspection is linked to the customer and vehicle record — visible on every future visit. Build trust with documented history the customer can see.' },
];

// ── Main component ───────────────────────────────────────────────────────────
export function DVISection() {
  const [step, setStep]   = useState(0);
  const [feat, setFeat]   = useState(0);
  const [paused, setPaused] = useState(false);
  const stepTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const featTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-advance demo steps
  useEffect(() => {
    if (paused) return;
    stepTimerRef.current = setInterval(() => setStep(p => (p + 1) % DEMO_STEPS.length), 4000);
    return () => { if (stepTimerRef.current) clearInterval(stepTimerRef.current); };
  }, [paused]);

  // Auto-advance feature pills
  useEffect(() => {
    featTimerRef.current = setInterval(() => setFeat(p => (p + 1) % FEATURES.length), 3200);
    return () => { if (featTimerRef.current) clearInterval(featTimerRef.current); };
  }, []);

  function handleStepClick(i: number) {
    setStep(i);
    setPaused(true);
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    setTimeout(() => setPaused(false), 12000);
  }

  const currentStep = DEMO_STEPS[step];
  const currentFeat = FEATURES[feat];

  return (
    <>
      {/* ── HERO + INTERACTIVE DEMO ──────────────────────────────────────── */}
      <section id="digital-inspections" style={{ paddingBlock: 'clamp(56px,8vw,120px)', background: D.bg, position: 'relative', overflow: 'hidden' }}>

        {/* Background grid */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: `linear-gradient(${D.border} 1px, transparent 1px), linear-gradient(90deg, ${D.border} 1px, transparent 1px)`, backgroundSize: '48px 48px' }} />
        <div aria-hidden="true" style={{ position: 'absolute', top: '10%', left: '55%', width: 700, height: 500, background: 'radial-gradient(ellipse, rgba(204,0,0,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1280, marginInline: 'auto', paddingInline: 'clamp(16px,5vw,48px)', position: 'relative' }}>

          {/* ── Two-column: headline left, demo right ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: 48, alignItems: 'start' }}>

            {/* LEFT: headline + step tabs + bullets */}
            <div>
              {/* Eyebrow */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '6px 14px', borderRadius: 9999, background: 'rgba(34,211,160,0.1)', border: '1px solid rgba(34,211,160,0.25)' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: D.green, boxShadow: `0 0 8px ${D.green}` }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: D.green, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Digital Vehicle Inspections</span>
              </div>

              <h2 style={{ fontSize: 'clamp(28px,3.8vw,46px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.08, margin: '0 0 16px' }}>
                Show customers<br />
                <span style={{ color: D.red, textShadow: `0 0 40px ${D.redGlow}` }}>exactly</span> what<br />
                the tech found.
              </h2>
              <p style={{ fontSize: 17, lineHeight: 1.65, color: D.muted, margin: '0 0 32px', maxWidth: 480 }}>
                Structured checklists, photo evidence, and instant share links. Every finding connected to the estimate, job card, and vehicle history.
              </p>

              {/* Step navigator */}
              <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: D.mutedLight, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Live walkthrough</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {DEMO_STEPS.map((s, i) => (
                    <button
                      key={s.label}
                      onClick={() => handleStepClick(i)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 9999,
                        fontSize: 13, fontWeight: i === step ? 700 : 500,
                        cursor: 'pointer', border: 'none',
                        background: i === step ? `${s.color}20` : 'rgba(255,255,255,0.04)',
                        color: i === step ? s.color : D.muted,
                        outline: `1.5px solid ${i === step ? s.color : 'rgba(255,255,255,0.08)'}`,
                        boxShadow: i === step ? `0 0 18px ${s.color}33` : 'none',
                        transition: 'all 0.25s',
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{s.icon}</span>
                      {s.label}
                    </button>
                  ))}
                </div>
                {/* Step progress bar */}
                <div style={{ marginTop: 12, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${((step + 1) / DEMO_STEPS.length) * 100}%`, background: currentStep.color, boxShadow: `0 0 8px ${currentStep.color}`, borderRadius: 999, transition: 'width 0.4s ease, background 0.4s ease' }} />
                </div>
              </div>

              {/* Bullets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'No missed items', sub: 'Structured 26-item checklist, same every time' },
                  { label: 'Photo proof per finding', sub: 'Visual evidence removes customer doubt instantly' },
                  { label: 'Customer approves online', sub: 'No phone tag — timestamped digital approval' },
                  { label: 'One click to estimate', sub: 'Findings carry over — zero re-entry needed' },
                ].map(pt => (
                  <div key={pt.label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(34,211,160,0.12)', border: '1px solid rgba(34,211,160,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, boxShadow: '0 0 8px rgba(34,211,160,0.15)' }}>
                      <span style={{ fontSize: 10, color: D.green, fontWeight: 800 }}>✓</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: D.text }}>{pt.label}</div>
                      <div style={{ fontSize: 12, color: D.muted, marginTop: 2 }}>{pt.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
                <Link href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 28px', borderRadius: 9, background: D.red, color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none', boxShadow: '0 4px 20px rgba(204,0,0,0.4)', border: 'none', minHeight: 44 }}>
                  Start Free
                </Link>
                <a href="#dvi-features" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '13px 24px', borderRadius: 9, background: 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 600, fontSize: 15, textDecoration: 'none', border: `1px solid ${D.border}`, minHeight: 44 }}>
                  See all features
                </a>
              </div>
            </div>

            {/* RIGHT: animated demo card */}
            <div style={{ position: 'sticky', top: 24 }}>
              {/* Card header */}
              <div style={{ borderRadius: 20, overflow: 'hidden', background: D.surface, border: `1.5px solid ${currentStep.color}44`, boxShadow: `0 0 60px ${currentStep.color}18, 0 12px 48px rgba(0,0,0,0.6)`, transition: 'border-color 0.4s, box-shadow 0.4s' }}>
                {/* Top bar */}
                <div style={{ background: 'linear-gradient(135deg, #0f0f18 0%, #1a0505 100%)', padding: '14px 18px', borderBottom: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: `${currentStep.color}22`, border: `1.5px solid ${currentStep.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, transition: 'all 0.3s' }}>
                      {currentStep.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: D.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Step {step + 1} of {DEMO_STEPS.length}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: currentStep.color, textShadow: `0 0 12px ${currentStep.color}66`, transition: 'color 0.3s' }}>{currentStep.label}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: D.muted }}>DVI-0042 · J. Santos</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: D.text }}>2019 Toyota Hilux</div>
                  </div>
                </div>

                {/* Headline inside card */}
                <div style={{ padding: '12px 18px 0', background: D.surfaceSoft }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: currentStep.color, marginBottom: 2, transition: 'color 0.3s' }}>{currentStep.headline}</div>
                  <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.5, paddingBottom: 10, borderBottom: `1px solid ${D.border}` }}>{currentStep.sub}</div>
                </div>

                {/* Dynamic screen content */}
                <div style={{ padding: '12px 16px 16px', background: D.surfaceSoft, minHeight: 280 }}>
                  <currentStep.component />
                </div>

                {/* Bottom progress row */}
                <div style={{ padding: '10px 16px', background: D.surface, borderTop: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                    {DEMO_STEPS.map((s, i) => (
                      <div key={i} onClick={() => handleStepClick(i)} style={{ flex: i === step ? 3 : 1, height: 4, borderRadius: 999, background: i === step ? s.color : 'rgba(255,255,255,0.08)', boxShadow: i === step ? `0 0 6px ${s.color}` : 'none', cursor: 'pointer', transition: 'all 0.3s' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 10, color: D.muted, flexShrink: 0 }}>{step + 1}/{DEMO_STEPS.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURE SHOWCASE ─────────────────────────────────────────────── */}
      <section id="dvi-features" style={{ paddingBlock: 'clamp(56px,8vw,96px)', background: D.surfaceSoft, position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: `linear-gradient(${D.border} 1px, transparent 1px), linear-gradient(90deg, ${D.border} 1px, transparent 1px)`, backgroundSize: '48px 48px' }} />
        <div style={{ maxWidth: 1280, marginInline: 'auto', paddingInline: 'clamp(16px,5vw,48px)', position: 'relative' }}>

          <div style={{ maxWidth: 640, marginBottom: 40 }}>
            <h2 style={{ fontSize: 'clamp(24px,3.5vw,36px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.025em', margin: '0 0 12px' }}>
              Everything the inspection needs, built into every job.
            </h2>
            <p style={{ color: D.muted, lineHeight: 1.6, fontSize: 16, margin: 0 }}>
              Available now in every active RedlineD1 account.
            </p>
          </div>

          {/* Feature pills */}
          <div className="rd1-scroll-x" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', minWidth: 600 }}>
              {FEATURES.map((f, i) => {
                const isActive = i === feat;
                return (
                  <button key={f.title} onClick={() => setFeat(i)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 9999, fontSize: 13, fontWeight: isActive ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap', border: 'none', outline: `1.5px solid ${isActive ? f.color : 'rgba(255,255,255,0.1)'}`, background: isActive ? `${f.color}20` : 'rgba(255,255,255,0.04)', color: isActive ? f.color : 'rgba(255,255,255,0.5)', boxShadow: isActive ? `0 0 18px ${f.color}44` : 'none', transform: isActive ? 'translateY(-2px)' : 'none', transition: 'all 0.25s' }}>
                    <span style={{ fontSize: 15 }}>{f.icon}</span>{f.title}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active feature detail */}
          <div style={{ padding: '32px 36px', borderRadius: 20, border: `1.5px solid ${currentFeat.color}44`, background: `linear-gradient(135deg, ${currentFeat.color}12 0%, ${D.surface} 60%)`, boxShadow: `0 0 40px ${currentFeat.color}18, 0 8px 32px rgba(0,0,0,0.4)`, transition: 'all 0.3s', display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: `${currentFeat.color}22`, border: `1.5px solid ${currentFeat.color}55`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, boxShadow: `0 0 24px ${currentFeat.color}44`, transition: 'all 0.3s' }}>
              {currentFeat.icon}
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: currentFeat.color, textShadow: `0 0 20px ${currentFeat.color}66`, transition: 'color 0.3s' }}>{currentFeat.title}</div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(34,211,160,0.12)', color: D.green, border: '1px solid rgba(34,211,160,0.3)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: D.green, boxShadow: `0 0 5px ${D.green}` }} /> Available now
                </span>
              </div>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, margin: 0 }}>{currentFeat.detail}</p>
            </div>
          </div>

          <div style={{ marginTop: 16, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${((feat + 1) / FEATURES.length) * 100}%`, background: currentFeat.color, borderRadius: 999, boxShadow: `0 0 8px ${currentFeat.color}`, transition: 'width 0.3s ease, background 0.3s ease' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 14, justifyContent: 'center' }}>
            {FEATURES.map((f, i) => (
              <div key={i} onClick={() => setFeat(i)} style={{ width: i === feat ? 24 : 8, height: 8, borderRadius: 999, background: i === feat ? currentFeat.color : 'rgba(255,255,255,0.12)', cursor: 'pointer', boxShadow: i === feat ? `0 0 8px ${currentFeat.color}` : 'none', transition: 'all 0.3s' }} />
            ))}
          </div>

          {/* Mobile mechanic callout */}
          <div style={{ marginTop: 48, padding: '28px 32px', background: 'linear-gradient(135deg, rgba(204,0,0,0.08) 0%, #0d0d14 60%)', border: '1px solid rgba(204,0,0,0.2)', borderRadius: 20, boxShadow: '0 4px 32px rgba(0,0,0,0.4)', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(204,0,0,0.8)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>For mobile mechanics</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Professional inspections — without a physical shop.</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: D.muted, margin: 0 }}>Inspect at customer homes, workplaces, or fleet yards. Capture photos from your phone, share the report instantly, and keep every inspection in the customer record.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
              {['Phone-friendly inspection workflow','On-site photo capture','Consistent inspection checklists','Professional customer report','Online customer approval','Inspection history — no office required'].map(pt => (
                <div key={pt} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: D.green, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: 'rgba(34,211,160,0.12)', flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{pt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
