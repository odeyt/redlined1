'use client';

import { useState, useEffect } from 'react';
import { colors, container, h2Style } from './theme';

const PRIORITY_STYLE: Record<string, { bg: string; color: string; border: string; glow: string }> = {
  High:   { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5', glow: '#dc262622' },
  Medium: { bg: '#fffbeb', color: '#d97706', border: '#fcd34d', glow: '#d9770622' },
  Low:    { bg: '#f0fdf4', color: '#16a34a', border: '#86efac', glow: '#16a34a22' },
};

const ACTION_QUEUE = [
  {
    priority: 'High',
    icon: '💸',
    action: 'Follow up on stale estimate',
    reason: 'No customer response in 3 days',
    evidence: '1 estimate pending',
    value: '$2,400',
    status: 'Open',
    age: '3d',
  },
  {
    priority: 'High',
    icon: '🧾',
    action: 'Send invoice for completed job',
    reason: 'Job marked complete, not yet invoiced',
    evidence: '1 job card',
    value: '$680',
    status: 'Open',
    age: '1d',
  },
  {
    priority: 'Medium',
    icon: '📦',
    action: 'Reorder brake pads',
    reason: 'Inventory below reorder threshold',
    evidence: '2 SKUs low',
    value: '—',
    status: 'Open',
    age: '2d',
  },
  {
    priority: 'Medium',
    icon: '📅',
    action: 'Schedule approved work',
    reason: 'Approved estimate not yet scheduled',
    evidence: '1 estimate approved',
    value: '$920',
    status: 'In progress',
    age: '5h',
  },
];

const METRICS = [
  { label: 'Open Actions', value: '4', color: '#cc0000', pulse: true },
  { label: 'Revenue at Risk', value: '$3,100', color: '#d97706', pulse: false },
  { label: 'Avg Response Time', value: '2.1d', color: '#6366f1', pulse: false },
  { label: 'Resolved Today', value: '7', color: '#10b981', pulse: false },
];

export function CommandCenterSection() {
  const [activeRow, setActiveRow] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setActiveRow(p => (p + 1) % ACTION_QUEUE.length);
      setTick(p => p + 1);
    }, 2800);
    return () => clearInterval(t);
  }, []);

  const active = ACTION_QUEUE[activeRow];
  const ps = PRIORITY_STYLE[active.priority];

  return (
    <section id="intelligence" style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: '#0a0a0a', position: 'relative', overflow: 'hidden' }}>

      {/* Background grid */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(204,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(204,0,0,0.04) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      {/* Red ambient glow */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: '-120px', left: '50%', transform: 'translateX(-50%)',
        width: '600px', height: '300px', borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(204,0,0,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ ...container, position: 'relative' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '40px' }}>
          <div style={{ maxWidth: '560px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e', animation: 'none' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live Operations</span>
            </div>
            <h2 style={{ ...h2Style, color: '#fff', fontSize: 'clamp(26px, 4vw, 42px)' }}>
              Know what deserves attention<br />before the day gets away.
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '12px', fontSize: '15px', lineHeight: 1.65 }}>
              RedlineD1 surfaces the highest-priority actions across your shop every morning — revenue gaps, overdue follow-ups, inventory alerts — so nothing falls through.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>Core: Available Now</span>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>Full Scoring: Rolling Out</span>
          </div>
        </div>

        {/* Metric bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '32px' }}>
          {METRICS.map((m) => (
            <div key={m.label} style={{
              padding: '18px 20px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${m.color}30`,
              borderTop: `2px solid ${m.color}`,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ fontSize: '26px', fontWeight: 800, color: m.color, letterSpacing: '-0.02em' }}>{m.value}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</div>
              {m.pulse && (
                <div style={{ position: 'absolute', top: 14, right: 14, width: 8, height: 8, borderRadius: '50%', background: m.color, boxShadow: `0 0 8px ${m.color}` }} />
              )}
            </div>
          ))}
        </div>

        {/* Main layout: action queue + detail */}
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* Action queue list */}
          <div style={{
            flex: '1 1 340px',
            borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.02)',
            overflow: 'hidden',
          }}>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '80px 1fr 80px 60px',
              padding: '10px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              <span>Priority</span><span>Action</span><span>Value</span><span>Age</span>
            </div>

            {ACTION_QUEUE.map((row, i) => {
              const isActive = i === activeRow;
              const ps = PRIORITY_STYLE[row.priority];
              return (
                <button
                  key={row.action}
                  onClick={() => setActiveRow(i)}
                  style={{
                    display: 'grid', gridTemplateColumns: '80px 1fr 80px 60px',
                    width: '100%', padding: '16px 20px', cursor: 'pointer',
                    background: isActive ? `${ps.glow}` : 'transparent',
                    borderLeft: isActive ? `3px solid ${ps.color}` : '3px solid transparent',
                    borderRight: 'none', borderTop: 'none',
                    borderBottom: i < ACTION_QUEUE.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    transition: 'all 0.25s ease', textAlign: 'left', alignItems: 'center', gap: '0',
                  }}
                >
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                    background: isActive ? ps.bg : 'rgba(255,255,255,0.05)',
                    color: isActive ? ps.color : 'rgba(255,255,255,0.4)',
                    border: isActive ? `1px solid ${ps.border}` : '1px solid transparent',
                    transition: 'all 0.25s', width: 'fit-content',
                  }}>
                    {row.priority}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: isActive ? 600 : 400, color: isActive ? '#fff' : 'rgba(255,255,255,0.55)', paddingInline: '12px', transition: 'color 0.2s' }}>
                    {row.icon} {row.action}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: isActive ? '#22c55e' : 'rgba(255,255,255,0.3)', transition: 'color 0.2s' }}>
                    {row.value}
                  </span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{row.age}</span>
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          <div style={{
            flex: '1 1 260px',
            padding: '28px',
            borderRadius: '16px',
            border: `1px solid ${ps.color}44`,
            background: `linear-gradient(135deg, ${ps.glow}, rgba(0,0,0,0.3))`,
            transition: 'all 0.35s ease',
            minHeight: '260px',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                <span style={{ fontSize: '28px' }}>{active.icon}</span>
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px',
                  background: ps.bg, color: ps.color, border: `1px solid ${ps.border}`,
                }}>
                  {active.priority} Priority
                </span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginBottom: '10px', lineHeight: 1.35 }}>
                {active.action}
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', marginBottom: '20px', lineHeight: 1.6 }}>
                {active.reason}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { label: 'Evidence', val: active.evidence },
                  { label: 'Est. Value', val: active.value },
                  { label: 'Status', val: active.status },
                  { label: 'Open', val: active.age + ' ago' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBlock: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{r.label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{r.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Progress dots */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '24px' }}>
              {ACTION_QUEUE.map((_, i) => (
                <div key={i} onClick={() => setActiveRow(i)} style={{
                  height: 6, borderRadius: '9999px',
                  width: i === activeRow ? 22 : 6,
                  background: i === activeRow ? ps.color : 'rgba(255,255,255,0.15)',
                  cursor: 'pointer', transition: 'all 0.3s ease',
                }} />
              ))}
            </div>
          </div>
        </div>

        <p style={{ marginTop: '16px', fontSize: '11px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
          Sample data shown for illustration only. Dollar figures are not real shop data.
        </p>
      </div>
    </section>
  );
}
