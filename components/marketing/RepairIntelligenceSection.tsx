'use client';

import { useState, useEffect } from 'react';

const TREE_STEPS = [
  { label: 'Complaint',      detail: 'Intermittent rough idle at operating temp',       color: '#6366f1', icon: '🗣️' },
  { label: 'Symptoms',       detail: 'Stalls at stop, cold start only, miss under load', color: '#0ea5e9', icon: '🔎' },
  { label: 'DTCs',           detail: 'P0300 random misfire, P0171 lean bank 1',          color: '#f59e0b', icon: '📡' },
  { label: 'Tests Performed',detail: 'Fuel pressure test, smoke test, injector balance',  color: '#10b981', icon: '🧪' },
  { label: 'Failed Attempts',detail: 'Spark plug replacement — no change in symptoms',   color: '#ef4444', icon: '❌' },
  { label: 'Final Repair',   detail: 'Intake manifold gasket replaced',                  color: '#22c55e', icon: '🔧' },
  { label: 'Verification',   detail: 'Road test complete — no fault recurrence at 50mi', color: '#cc0000', icon: '✅' },
];

const LOOP_STEPS = [
  { label: 'Repair Work',           icon: '🔧', color: '#6366f1' },
  { label: 'Repair Intelligence',   icon: '🧠', color: '#0ea5e9' },
  { label: 'Vehicle Memory',        icon: '🚗', color: '#f59e0b' },
  { label: 'Customer Memory',       icon: '👤', color: '#10b981' },
  { label: 'Business Memory',       icon: '🏪', color: '#8b5cf6' },
  { label: 'Owner Recommendations', icon: '💡', color: '#ef4444' },
  { label: 'Better Decisions',      icon: '📈', color: '#22c55e' },
  { label: 'Verified Outcomes',     icon: '✅', color: '#cc0000' },
];

export function RepairIntelligenceSection() {
  const [active, setActive] = useState(0);
  const [loopActive, setLoopActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive(p => (p + 1) % TREE_STEPS.length), 2200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setLoopActive(p => (p + 1) % LOOP_STEPS.length), 900);
    return () => clearInterval(t);
  }, []);

  const activeStep = TREE_STEPS[active];

  return (
    <section style={{ paddingBlock: 'clamp(56px,8vw,128px)', background: '#07070a', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes ri-dot-ping { 0%{transform:scale(1);opacity:1} 100%{transform:scale(2.5);opacity:0} }
        @keyframes ri-fade-up  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .ri-step-btn { transition: all 0.2s ease; }
        .ri-step-btn:hover { background: rgba(255,255,255,0.04) !important; }
        .ri-loop-pill { transition: all 0.3s ease; }
      `}</style>

      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(99,102,241,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.025) 1px,transparent 1px)', backgroundSize: '48px 48px' }} />
      <div aria-hidden="true" style={{ position: 'absolute', bottom: 0, left: '15%', width: 600, height: 400, background: 'radial-gradient(ellipse,rgba(99,102,241,0.06) 0%,transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: 1200, marginInline: 'auto', paddingInline: 'clamp(16px,5vw,48px)', position: 'relative' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '6px 14px', borderRadius: 9999, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Repair Intelligence</span>
          </div>
          <h2 style={{ fontSize: 'clamp(26px,4vw,44px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', margin: '0 0 14px', lineHeight: 1.1 }}>
            Every repair should make<br />
            <span style={{ color: '#6366f1' }}>the shop smarter.</span>
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', maxWidth: 560, lineHeight: 1.8 }}>
            RedlineD1 captures how a problem was diagnosed, what failed, what fixed it, and how the repair was
            verified — turning completed repairs into reusable shop knowledge.
          </p>
        </div>

        {/* Step list + detail panel */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 72 }}>

          {/* Step list */}
          <div style={{ flex: '1 1 320px', borderRadius: 18, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
            {TREE_STEPS.map((step, i) => {
              const isActive = i === active;
              return (
                <button
                  key={step.label}
                  onClick={() => setActive(i)}
                  className="ri-step-btn"
                  style={{
                    display: 'flex', gap: 14, alignItems: 'center',
                    padding: '14px 20px', width: '100%', textAlign: 'left',
                    background: isActive ? `${step.color}0e` : 'transparent',
                    borderLeft: `3px solid ${isActive ? step.color : 'transparent'}`,
                    borderRight: 'none', borderTop: 'none',
                    borderBottom: i < TREE_STEPS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14,
                      background: isActive ? step.color : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isActive ? step.color : 'rgba(255,255,255,0.08)'}`,
                      boxShadow: isActive ? `0 0 12px ${step.color}66` : 'none',
                      transition: 'all 0.25s',
                    }}>
                      {step.icon}
                    </div>
                    {isActive && (
                      <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `1px solid ${step.color}`, animation: 'ri-dot-ping 1.2s ease infinite', pointerEvents: 'none' }} />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? step.color : 'rgba(255,255,255,0.55)', transition: 'color 0.2s' }}>{step.label}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{step.detail}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active detail */}
          <div style={{
            flex: '1 1 280px', padding: 32, borderRadius: 20, minHeight: 280,
            border: `1.5px solid ${activeStep.color}44`,
            background: `linear-gradient(135deg, ${activeStep.color}0c 0%, rgba(0,0,0,0.4) 100%)`,
            boxShadow: `0 0 40px ${activeStep.color}12`,
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            transition: 'border-color 0.4s, box-shadow 0.4s',
          }}>
            <div style={{ fontSize: 36, marginBottom: 16, animation: 'ri-fade-up 0.35s ease' }}>{activeStep.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: activeStep.color, marginBottom: 10, transition: 'color 0.3s' }}>
              {activeStep.label}
            </div>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, margin: 0 }}>
              {activeStep.detail}
            </p>
            <div style={{ display: 'flex', gap: 6, marginTop: 28 }}>
              {TREE_STEPS.map((s, i) => (
                <div key={i} onClick={() => setActive(i)} style={{
                  height: 4, borderRadius: 9999, cursor: 'pointer', transition: 'all 0.3s',
                  flex: i === active ? 3 : 1,
                  background: i === active ? activeStep.color : 'rgba(255,255,255,0.08)',
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* Loop section */}
        <div>
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 'clamp(18px,3vw,28px)', fontWeight: 900, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              Every repair improves the next decision.
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Designed to improve through verified shop outcomes
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {LOOP_STEPS.map((step, i) => {
              const isLit = i === loopActive;
              const isPrev = i === (loopActive - 1 + LOOP_STEPS.length) % LOOP_STEPS.length;
              return (
                <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    className="ri-loop-pill"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 18px', borderRadius: 12,
                      background: isLit ? `${step.color}18` : 'rgba(255,255,255,0.03)',
                      border: `1.5px solid ${isLit ? step.color : isPrev ? `${step.color}33` : 'rgba(255,255,255,0.07)'}`,
                      boxShadow: isLit ? `0 0 20px ${step.color}33` : 'none',
                    }}
                  >
                    <span style={{ fontSize: 14, filter: isLit ? 'none' : 'grayscale(1) opacity(0.4)', transition: 'filter 0.3s' }}>{step.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: isLit ? 700 : 500, color: isLit ? '#fff' : 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', transition: 'color 0.3s' }}>
                      {step.label}
                    </span>
                  </div>
                  {i < LOOP_STEPS.length - 1 && (
                    <span style={{ color: isLit ? step.color : 'rgba(255,255,255,0.12)', fontSize: 14, transition: 'color 0.3s' }}>→</span>
                  )}
                </div>
              );
            })}
            {/* loop back arrow */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: 13 }}>↩ loops back</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
