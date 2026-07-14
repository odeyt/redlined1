'use client';

import { useState, useEffect } from 'react';
import { colors, container, h2Style } from './theme';

const STEPS = [
  {
    label: 'Intake',
    color: '#6366f1',
    description: 'Capture customer and vehicle details instantly. VIN decode pulls year, make, model, and trim automatically — no manual entry, no duplicates.',
  },
  {
    label: 'Job Card',
    color: '#0ea5e9',
    description: 'Every job gets a live card that connects the customer, vehicle, technician, parts, and timeline in one view. Nothing falls through the cracks.',
  },
  {
    label: 'Digital Inspection',
    color: '#f59e0b',
    description: 'Technicians complete photo-backed inspection checklists on any device. Results link directly to the vehicle history and pre-fill the estimate.',
  },
  {
    label: 'Estimate',
    color: '#10b981',
    description: 'Build itemized estimates from inspection findings in seconds. Send to the customer for approval with one tap — tracked and timestamped.',
  },
  {
    label: 'Repair Order',
    color: '#f97316',
    description: 'Approved estimates convert to repair orders automatically. Technicians see their work queue, log time, and mark jobs complete in real time.',
  },
  {
    label: 'Invoice',
    color: '#ec4899',
    description: 'Generate professional invoices from completed repair orders. Line items, taxes, discounts, and payment terms set once — applied every time.',
  },
  {
    label: 'Payment',
    color: '#8b5cf6',
    description: 'Collect payment in-shop or send a pay link. Every transaction is recorded against the job card and customer account automatically.',
  },
  {
    label: 'Intelligence',
    color: '#cc0000',
    description: 'Every repair, inspection, and customer interaction feeds the AI layer. Get predictive maintenance alerts, repair cost benchmarks, and fleet insights — built from your own shop data.',
  },
];

export function WorkflowSection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive(prev => (prev + 1) % STEPS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const step = STEPS[active];

  return (
    <section id="workflow" style={{ paddingBlock: 'clamp(56px, 8vw, 128px)' }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '40px' }}>
          <h2 style={h2Style}>One connected repair lifecycle.</h2>
          <p style={{ color: colors.textMuted, marginTop: '12px' }}>
            Every step below is available today — no separate tools, no re-entering the same customer or vehicle twice. Digital inspections connect directly to the vehicle, job, estimate, and permanent repair history.
          </p>
        </div>

        {/* Step pills */}
        <div className="rd1-scroll-x">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '760px', paddingBottom: '8px' }}>
            {STEPS.map((s, i) => {
              const isActive = i === active;
              const isLast = i === STEPS.length - 1;
              return (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => setActive(i)}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '9999px',
                      fontSize: '14px',
                      fontWeight: isActive ? 700 : 500,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      border: `2px solid ${isActive ? s.color : colors.borderLight}`,
                      background: isActive ? s.color : colors.surfaceWhite,
                      color: isActive ? '#fff' : colors.textMain,
                      transition: 'all 0.25s ease',
                      boxShadow: isActive ? `0 4px 16px ${s.color}44` : 'none',
                      transform: isActive ? 'translateY(-2px)' : 'none',
                    }}
                  >
                    {s.label}
                  </button>
                  {!isLast && (
                    <div aria-hidden="true" style={{
                      width: '24px', height: '2px',
                      background: i === STEPS.length - 2 ? 'transparent' : colors.borderLight,
                      borderTop: i === STEPS.length - 2 ? `2px dashed ${colors.textMuted}` : 'none',
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Description panel */}
        <div style={{
          marginTop: '28px',
          padding: '24px 28px',
          borderRadius: '16px',
          border: `2px solid ${step.color}33`,
          background: `${step.color}0a`,
          transition: 'all 0.3s ease',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '16px',
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: step.color,
            marginTop: 6, flexShrink: 0,
            boxShadow: `0 0 12px ${step.color}`,
          }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: step.color, marginBottom: '6px' }}>
              {step.label}
            </div>
            <p style={{ color: colors.textMain, fontSize: '15px', lineHeight: 1.7, margin: 0 }}>
              {step.description}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: '16px', height: '3px', background: colors.borderLight, borderRadius: '9999px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${((active + 1) / STEPS.length) * 100}%`,
            background: step.color,
            borderRadius: '9999px',
            transition: 'width 0.3s ease, background 0.3s ease',
          }} />
        </div>
      </div>
    </section>
  );
}
