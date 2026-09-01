'use client';

import { useState, useEffect } from 'react';
import { colors, container, h2Style, card } from './theme';

const TIMELINE = [
  {
    label: 'First Visit',
    detail: 'Sample Customer — oil change',
    color: '#6366f1',
    insight: 'Every customer starts somewhere. The first visit creates the customer record, vehicle profile, and baseline — everything that makes every future visit faster and smarter.',
  },
  {
    label: 'Return Visit',
    detail: 'Brake inspection, work approved',
    color: '#10b981',
    insight: 'Return visits build the relationship record. Approved work, declined items, and technician findings are all linked to this customer and vehicle — visible on every future visit automatically.',
  },
  {
    label: 'Declined Item',
    detail: 'Cabin filter declined',
    color: '#f59e0b',
    insight: 'Declined work is never lost. It stays in the customer record and surfaces on their next visit — so your advisor can re-present with the right context instead of starting from scratch.',
  },
  {
    label: 'Most Recent Visit',
    detail: 'Invoice paid in full',
    color: '#cc0000',
    insight: 'A paid invoice is not the end of the relationship — it is a data point. Payment history, visit frequency, and lifetime value inform how your team prioritises and communicates with this customer going forward.',
  },
];

const METRICS = [
  { label: 'Lifetime Revenue', value: '$X,XXX', sub: 'illustrative', color: '#6366f1' },
  { label: 'Total Visits', value: '6', sub: 'sample', color: '#10b981' },
  { label: 'Average Invoice', value: '$XXX', sub: 'illustrative', color: '#f59e0b' },
  { label: 'Unpaid Balance', value: '$0', sub: 'current', color: '#cc0000' },
];

export function CustomerIntelligenceSection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive(p => (p + 1) % TIMELINE.length), 2500);
    return () => clearInterval(t);
  }, []);

  const step = TIMELINE[active];

  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)' }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '40px' }}>
          <h2 style={h2Style}>Understand the relationship, not just the last invoice.</h2>
          <p style={{ color: colors.textMuted, marginTop: '12px', lineHeight: 1.6 }}>
            Every visit, declined item, and payment is linked to the customer record. Your team sees the full picture before they say hello.
          </p>
        </div>

        {/* Metric tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '40px' }}>
          {METRICS.map((m) => (
            <div key={m.label} style={{
              ...card,
              borderTop: `3px solid ${m.color}`,
              transition: 'box-shadow 0.2s',
            }}>
              <div style={{ fontSize: '11px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{m.label}</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: m.color }}>{m.value}</div>
              <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '2px' }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Relationship timeline — interactive */}
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ ...card, flex: '1 1 280px', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${colors.borderLight}`, fontSize: '12px', fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Relationship Timeline (sample)
            </div>
            {TIMELINE.map((t, i) => {
              const isActive = i === active;
              return (
                <button
                  key={t.label}
                  onClick={() => setActive(i)}
                  style={{
                    display: 'flex', gap: '14px', alignItems: 'center',
                    width: '100%', padding: '14px 20px', cursor: 'pointer',
                    background: isActive ? `${t.color}0f` : 'transparent',
                    /* All four sides as longhands, never `border` alongside
                       them. `border: 'none'` used to sit on the line below
                       this one, and since React assigns style keys in object
                       order it wiped the accent it had just set: on first
                       paint the selected row rendered with NO left bar, and
                       it only appeared once the selection changed and React
                       diffed `borderLeft` on its own. That same diff is what
                       made React warn about mixing the two forms. */
                    borderLeft: isActive ? `3px solid ${t.color}` : '3px solid transparent',
                    borderRight: 'none', borderTop: 'none',
                    borderBottom: i < TIMELINE.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
                    transition: 'all 0.2s ease', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: isActive ? t.color : colors.borderLight,
                    boxShadow: isActive ? `0 0 8px ${t.color}` : 'none',
                    transition: 'all 0.2s ease',
                  }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: isActive ? 700 : 600, color: isActive ? t.color : colors.textMain, transition: 'color 0.2s' }}>{t.label}</div>
                    <div style={{ fontSize: '12px', color: colors.textMuted }}>{t.detail}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Insight panel */}
          <div style={{
            flex: '1 1 260px', padding: '32px', borderRadius: '16px',
            border: `2px solid ${step.color}33`,
            background: `${step.color}08`,
            transition: 'all 0.3s ease', minHeight: '220px',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '12px',
              background: step.color, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', fontWeight: 800, color: '#fff',
              marginBottom: '18px',
              boxShadow: `0 4px 16px ${step.color}55`,
              transition: 'all 0.3s ease',
            }}>
              {active + 1}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: step.color, marginBottom: '6px', transition: 'color 0.3s' }}>
              {step.label}
            </div>
            <div style={{ fontSize: '13px', color: step.color, opacity: 0.75, marginBottom: '14px' }}>{step.detail}</div>
            <p style={{ fontSize: '14px', color: colors.textMain, lineHeight: 1.75, margin: 0 }}>
              {step.insight}
            </p>
            <div style={{ display: 'flex', gap: '6px', marginTop: '24px' }}>
              {TIMELINE.map((t, i) => (
                <div key={i} onClick={() => setActive(i)} style={{
                  width: i === active ? 20 : 7, height: 7, borderRadius: '9999px',
                  background: i === active ? step.color : colors.borderLight,
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
