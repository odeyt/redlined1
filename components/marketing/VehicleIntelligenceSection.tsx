'use client';

import { useState, useEffect } from 'react';
import { colors, container, h2Style, card, disclaimer } from './theme';

const SIGNALS = [
  {
    label: 'Visit History',
    value: '4 recorded visits (sample)',
    color: '#6366f1',
    detail: 'Every past visit is linked to the vehicle record — services performed, mileage at each visit, technician notes, and outcome. The moment a vehicle comes back in, the full history is in front of your team.',
  },
  {
    label: 'Repeat Concerns',
    value: 'Rough idle noted twice',
    color: '#f59e0b',
    detail: 'Concerns noted across multiple visits are surfaced automatically. If a customer mentioned a rough idle six months ago and it comes up again today, that pattern is visible before the technician opens the hood.',
  },
  {
    label: 'Recurring DTCs',
    value: 'P0171 seen on 2 visits',
    color: '#ef4444',
    detail: 'Fault codes logged across previous inspections and repairs are tracked per vehicle. A code that appears on multiple visits signals a persistent issue — not a one-time event — before the diagnosis even starts.',
  },
  {
    label: 'Declined Work',
    value: '1 item declined last visit',
    color: '#f97316',
    detail: 'Work the customer declined on a prior visit is flagged on every future visit. Your advisor knows what was recommended and not approved — so they can re-present the right way without the customer feeling chased.',
  },
  {
    label: 'Risk Signal',
    value: 'Elevated — repeat symptom',
    color: '#cc0000',
    detail: 'When a vehicle pattern suggests elevated risk — a recurring symptom, a previously declined critical item, or an aging component — the signal is surfaced before the vehicle goes into the bay.',
  },
  {
    label: 'Recommended Check',
    value: 'Fuel trim recheck',
    color: '#10b981',
    detail: 'Based on the vehicle history and prior findings, RedlineD1 surfaces what deserves attention on this visit. Not a replacement for a technician inspection — a starting point informed by what the shop already knows.',
  },
];

export function VehicleIntelligenceSection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive(p => (p + 1) % SIGNALS.length), 2500);
    return () => clearInterval(t);
  }, []);

  const sig = SIGNALS[active];

  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: colors.surfaceBg }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '40px' }}>
          <h2 style={h2Style}>Every vehicle arrives with context.</h2>
          <p style={{ color: colors.textMuted, marginTop: '12px' }}>
            Visit history, repeat concerns, recurring fault codes, declined work, and repair patterns — surfaced
            automatically the moment a vehicle comes back in.
          </p>
          <p style={disclaimer}>Based on recorded shop data. Not a replacement for inspection or diagnosis.</p>
        </div>

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Signal list */}
          <div style={{ ...card, flex: '1 1 300px', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${colors.borderLight}`, fontSize: '12px', fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Sample Vehicle — 2018 Sedan
            </div>
            {SIGNALS.map((s, i) => {
              const isActive = i === active;
              return (
                <button
                  key={s.label}
                  onClick={() => setActive(i)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    width: '100%', padding: '14px 20px', cursor: 'pointer',
                    borderBottom: i < SIGNALS.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
                    background: isActive ? `${s.color}0f` : 'transparent',
                    borderLeft: isActive ? `3px solid ${s.color}` : '3px solid transparent',
                    border: 'none', borderBottom: i < SIGNALS.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
                    transition: 'all 0.2s ease', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '13px', color: isActive ? s.color : colors.textMuted, fontWeight: isActive ? 700 : 400, transition: 'color 0.2s' }}>{s.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: isActive ? s.color : colors.textMain, transition: 'color 0.2s' }}>{s.value}</span>
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          <div style={{
            flex: '1 1 280px', padding: '32px', borderRadius: '16px',
            border: `2px solid ${sig.color}33`,
            background: `${sig.color}08`,
            transition: 'all 0.3s ease', minHeight: '260px',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '12px', background: sig.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', fontWeight: 800, color: '#fff',
              marginBottom: '18px', boxShadow: `0 4px 16px ${sig.color}55`,
              transition: 'all 0.3s ease',
            }}>
              {active + 1}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: sig.color, marginBottom: '10px', transition: 'color 0.3s' }}>
              {sig.label}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: sig.color, marginBottom: '14px', opacity: 0.8 }}>
              {sig.value}
            </div>
            <p style={{ fontSize: '14px', color: colors.textMain, lineHeight: 1.7, margin: 0 }}>
              {sig.detail}
            </p>
            <div style={{ display: 'flex', gap: '6px', marginTop: '24px' }}>
              {SIGNALS.map((s, i) => (
                <div key={i} onClick={() => setActive(i)} style={{
                  width: i === active ? 20 : 7, height: 7, borderRadius: '9999px',
                  background: i === active ? sig.color : colors.borderLight,
                  cursor: 'pointer', transition: 'all 0.3s ease',
                }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
