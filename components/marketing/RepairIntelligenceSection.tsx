'use client';

import { useState, useEffect } from 'react';
import { colors, container, h2Style, card } from './theme';

const TREE_STEPS = [
  { label: 'Complaint', detail: 'Sample: intermittent rough idle', color: '#6366f1' },
  { label: 'Symptoms', detail: 'Sample: stalls at stop, cold start only', color: '#0ea5e9' },
  { label: 'DTCs', detail: 'Sample: P0300, P0171', color: '#f59e0b' },
  { label: 'Tests performed', detail: 'Sample: fuel pressure test, smoke test', color: '#10b981' },
  { label: 'Failed attempts', detail: 'Sample: spark plug replacement (no change)', color: '#ef4444' },
  { label: 'Final repair', detail: 'Sample: intake manifold gasket replaced', color: '#22c55e' },
  { label: 'Verification', detail: 'Sample: road test, no fault recurrence', color: '#cc0000' },
];

const LOOP_STEPS = ['Repair Work', 'Repair Intelligence', 'Vehicle Memory', 'Customer Memory', 'Business Memory', 'Owner Recommendations', 'Better Decisions', 'Verified Outcomes'];

/**
 * RepairIntelligenceSection - see LANDING_PAGE_MASTER_SPEC.md Section 5.9.
 * PRODUCT_STATUS_MATRIX.md classifies Repair Intelligence PARTIAL - copy
 * describes the real capture/record capability without claiming the fully
 * autonomous learning loop is complete.
 */
export function RepairIntelligenceSection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive(p => (p + 1) % TREE_STEPS.length), 2000);
    return () => clearInterval(t);
  }, []);

  const activeStep = TREE_STEPS[active];

  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)' }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '32px' }}>
          <h2 style={h2Style}>Every repair should make the shop smarter.</h2>
          <p style={{ color: colors.textMuted, marginTop: '12px' }}>
            RedlineD1 captures how a problem was diagnosed, what failed, what fixed it, and how the repair was
            verified — turning completed repairs into reusable shop knowledge.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Step list */}
          <div style={{ ...card, flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '4px', padding: 0, overflow: 'hidden' }}>
            {TREE_STEPS.map((step, i) => {
              const isActive = i === active;
              return (
                <button
                  key={step.label}
                  onClick={() => setActive(i)}
                  style={{
                    display: 'flex', gap: '16px', alignItems: 'center',
                    padding: '14px 20px',
                    borderBottom: i < TREE_STEPS.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
                    background: isActive ? `${step.color}0f` : 'transparent',
                    borderLeft: isActive ? `3px solid ${step.color}` : '3px solid transparent',
                    cursor: 'pointer', textAlign: 'left', width: '100%', border: 'none',
                    borderBottom: i < TREE_STEPS.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 700,
                    background: isActive ? step.color : colors.surfaceBg,
                    color: isActive ? '#fff' : colors.textMuted,
                    border: `1px solid ${isActive ? step.color : colors.borderLight}`,
                    transition: 'all 0.2s ease',
                    boxShadow: isActive ? `0 0 10px ${step.color}66` : 'none',
                  }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: isActive ? 700 : 600, color: isActive ? step.color : colors.textMain, transition: 'color 0.2s' }}>
                      {step.label}
                    </div>
                    <div style={{ fontSize: '12px', color: colors.textMuted }}>{step.detail}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active detail panel */}
          <div style={{
            flex: '1 1 280px',
            padding: '32px',
            borderRadius: '16px',
            border: `2px solid ${activeStep.color}33`,
            background: `${activeStep.color}08`,
            transition: 'all 0.3s ease',
            minHeight: '280px',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: activeStep.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '20px', fontWeight: 800, color: '#fff',
              marginBottom: '20px',
              boxShadow: `0 4px 20px ${activeStep.color}55`,
              transition: 'all 0.3s ease',
            }}>
              {active + 1}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: activeStep.color, marginBottom: '12px', transition: 'color 0.3s' }}>
              {activeStep.label}
            </div>
            <p style={{ fontSize: '15px', color: colors.textMain, lineHeight: 1.7, margin: 0 }}>
              {activeStep.detail}
            </p>
            {/* Progress dots */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '28px' }}>
              {TREE_STEPS.map((s, i) => (
                <div key={i} onClick={() => setActive(i)} style={{
                  width: i === active ? 20 : 8, height: 8, borderRadius: '9999px',
                  background: i === active ? activeStep.color : colors.borderLight,
                  cursor: 'pointer', transition: 'all 0.3s ease',
                }} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '48px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: colors.textMain, marginBottom: '8px' }}>Every repair improves the next decision.</h3>
          <p style={{ fontSize: '13px', color: colors.textMuted, marginBottom: '16px' }}>Designed to improve through verified shop outcomes.</p>
          <div className="rd1-scroll-x">
            <div style={{ display: 'flex', gap: '8px', minWidth: '900px' }}>
              {LOOP_STEPS.map((step, i) => (
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ padding: '8px 14px', borderRadius: '8px', background: colors.surfaceBg, border: `1px solid ${colors.borderLight}`, fontSize: '12px', color: colors.textMain, whiteSpace: 'nowrap' }}>
                    {step}
                  </div>
                  {i < LOOP_STEPS.length - 1 && <span aria-hidden="true" style={{ color: colors.textMuted }}>&rarr;</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
