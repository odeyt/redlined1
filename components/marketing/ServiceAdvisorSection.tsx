'use client';

import { useState, useEffect } from 'react';
import { colors, container, h2Style, card, badge } from './theme';

const REVIEW_ITEMS = [
  {
    icon: '⚠️',
    label: 'Missing description on line 3',
    color: '#f59e0b',
    detail: 'Line items without a description create customer confusion and slow approvals. RedlineD1 flags blank descriptions before the estimate leaves the shop — so your advisor can fill them in with the right language.',
  },
  {
    icon: '🔍',
    label: 'Zero-price item flagged for review',
    color: '#ef4444',
    detail: 'A $0 line item on a sent estimate looks like an error or a free service you did not intend to offer. RedlineD1 catches these before the estimate goes out and prompts your team to confirm or correct.',
  },
  {
    icon: '📋',
    label: 'Possible duplicate line detected',
    color: '#f97316',
    detail: 'Duplicate parts or labor lines inflate the estimate total and erode customer trust the moment they spot it. The AI layer compares line items and surfaces likely duplicates for human review before sending.',
  },
  {
    icon: '🔧',
    label: 'Labor not itemized for this repair',
    color: '#8b5cf6',
    detail: 'An estimate with parts but no labor line is incomplete — and leaves money on the table. RedlineD1 identifies repair types that typically require itemized labor and prompts the advisor to add it.',
  },
];

const TRUST_LABELS = ['Evidence-based', 'Human-reviewed', 'Transparent', 'Editable', 'Ethical'];

export function ServiceAdvisorSection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive(p => (p + 1) % REVIEW_ITEMS.length), 2500);
    return () => clearInterval(t);
  }, []);

  const item = REVIEW_ITEMS[active];

  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: colors.surfaceDark, color: colors.textOnDark }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '32px' }}>
          <h2 style={{ ...h2Style, color: colors.textOnDark }}>Build better estimates. Explain repairs more clearly.</h2>
          <p style={{ color: 'rgba(250,250,250,0.65)', marginTop: '12px' }}>
            Before an estimate goes out, RedlineD1 reviews it for gaps and drafts a plain-language explanation your
            staff can edit and send.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '32px' }}>
          {TRUST_LABELS.map((label) => (
            <span key={label} style={{ ...badge, background: 'rgba(250,250,250,0.08)', color: colors.textOnDark, border: '1px solid rgba(250,250,250,0.15)' }}>
              {label}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Review item list */}
          <div style={{
            flex: '1 1 300px', borderRadius: '16px',
            background: 'rgba(250,250,250,0.05)',
            border: '1px solid rgba(250,250,250,0.12)',
            overflow: 'hidden',
          }}>
            {REVIEW_ITEMS.map((r, i) => {
              const isActive = i === active;
              return (
                <button
                  key={r.label}
                  onClick={() => setActive(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    width: '100%', padding: '16px 20px', cursor: 'pointer',
                    background: isActive ? `${r.color}20` : 'transparent',
                    borderLeft: isActive ? `3px solid ${r.color}` : '3px solid transparent',
                    border: 'none', borderBottom: i < REVIEW_ITEMS.length - 1 ? '1px solid rgba(250,250,250,0.1)' : 'none',
                    transition: 'all 0.2s ease', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '18px', flexShrink: 0 }}>{r.icon}</span>
                  <span style={{ fontSize: '14px', color: isActive ? r.color : 'rgba(250,250,250,0.85)', fontWeight: isActive ? 700 : 400, transition: 'color 0.2s' }}>
                    {r.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          <div style={{
            flex: '1 1 280px', padding: '32px', borderRadius: '16px',
            border: `2px solid ${item.color}44`,
            background: `${item.color}15`,
            transition: 'all 0.3s ease', minHeight: '220px',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>{item.icon}</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: item.color, marginBottom: '14px', transition: 'color 0.3s' }}>
              {item.label}
            </div>
            <p style={{ fontSize: '14px', color: 'rgba(250,250,250,0.85)', lineHeight: 1.75, margin: 0 }}>
              {item.detail}
            </p>
            <div style={{ display: 'flex', gap: '6px', marginTop: '24px' }}>
              {REVIEW_ITEMS.map((r, i) => (
                <div key={i} onClick={() => setActive(i)} style={{
                  width: i === active ? 20 : 7, height: 7, borderRadius: '9999px',
                  background: i === active ? item.color : 'rgba(250,250,250,0.2)',
                  cursor: 'pointer', transition: 'all 0.3s ease',
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: '20px', height: '3px', background: 'rgba(250,250,250,0.1)', borderRadius: '9999px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${((active + 1) / REVIEW_ITEMS.length) * 100}%`,
            background: item.color, borderRadius: '9999px',
            transition: 'width 0.3s ease, background 0.3s ease',
          }} />
        </div>
      </div>
    </section>
  );
}
