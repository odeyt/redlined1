'use client';

import { useEffect, useState } from 'react';
import { colors, container, h2Style } from './theme';

const STEPS = [
  {
    label: 'Intake',
    icon: '🚗',
    heading: "Customer walks in. You're ready.",
    body: 'Capture vehicle details, customer info, and the reason for visit in seconds. Every job starts with a clean intake — no sticky notes, no whiteboard chaos.',
    points: [
      'VIN decode auto-fills make, model, year',
      'Customer history surfaces instantly',
      'Link multiple vehicles to one customer',
      'Photo attachments from the first moment',
    ],
  },
  {
    label: 'Job Card',
    icon: '🔧',
    heading: 'Every tech knows exactly what to do.',
    body: 'Assign jobs, log diagnostic notes, and track live status across your bays. Technicians work from their phone — no paperwork, no waiting for the front desk.',
    points: [
      'Assign to a tech in one tap',
      'Real-time status: Waiting → In Progress → Done',
      'Attach DTC codes and oscilloscope notes',
      'Parts requests straight from the job card',
    ],
  },
  {
    label: 'Estimate',
    icon: '📄',
    heading: 'Quotes sent before the car cools down.',
    body: 'Build itemised estimates with parts, labour, and fees. Send to the customer via SMS or email and get approval without a phone call.',
    points: [
      'Line items with parts cost + labour time',
      'Customer approval via SMS link',
      'Convert approved estimate to job in one click',
      'Upsell recommended services at point of estimate',
    ],
  },
  {
    label: 'Invoice',
    icon: '🧾',
    heading: 'Get paid before they leave the bay.',
    body: 'Generate a professional invoice the moment the job is closed. Collect payment on-site or send a pay link — cash, card, or digital wallet.',
    points: [
      'Auto-generated from the closed job card',
      'Accept card, cash, or online payment',
      'Send receipt instantly via email or SMS',
      'All transactions logged with full audit trail',
    ],
  },
];

export function FounderOriginSection() {
  const [active, setActive] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setAnimating(true);
      setTimeout(() => {
        setActive(prev => (prev + 1) % STEPS.length);
        setAnimating(false);
      }, 280);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  function goTo(i: number) {
    if (i === active) return;
    setAnimating(true);
    setTimeout(() => { setActive(i); setAnimating(false); }, 280);
  }

  const step = STEPS[active];

  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: colors.surfaceBg }}>
      <div style={container} className="rd1-two-col">

        {/* Left — animated copy */}
        <div>
          <div
            style={{
              opacity: animating ? 0 : 1,
              transform: animating ? 'translateY(8px)' : 'translateY(0)',
              transition: 'opacity 0.28s ease, transform 0.28s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '28px' }}>{step.icon}</span>
              <span style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: colors.primary,
              }}>
                {step.label}
              </span>
            </div>
            <h2 style={h2Style}>{step.heading}</h2>
            <p style={{ color: colors.textMuted, fontSize: '17px', lineHeight: 1.65, marginTop: '16px', marginBottom: '24px' }}>
              {step.body}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {step.points.map(pt => (
                <li key={pt} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '15px', color: colors.textMain }}>
                  <span aria-hidden="true" style={{ color: colors.success, fontWeight: 700, flexShrink: 0 }}>✓</span>
                  {pt}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right — workflow visual */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Step cards row */}
          <div style={{
            background: colors.surfaceWhite,
            border: `1px solid ${colors.borderLight}`,
            borderRadius: '16px',
            padding: '28px 20px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0', position: 'relative' }}>
              {/* Progress line behind cards */}
              <div style={{
                position: 'absolute',
                top: '28px',
                left: '10%',
                right: '10%',
                height: '2px',
                background: colors.borderLight,
                zIndex: 0,
              }} />
              <div style={{
                position: 'absolute',
                top: '28px',
                left: '10%',
                width: `${(active / (STEPS.length - 1)) * 80}%`,
                height: '2px',
                background: colors.primary,
                transition: 'width 0.5s ease',
                zIndex: 1,
              }} />

              {STEPS.map((s, i) => {
                const isActive = i === active;
                const isDone = i < active;
                return (
                  <button
                    key={s.label}
                    onClick={() => goTo(i)}
                    aria-label={`Go to ${s.label}`}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '10px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0 4px',
                      position: 'relative',
                      zIndex: 2,
                    }}
                  >
                    {/* Circle */}
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '9999px',
                      background: isActive ? colors.primary : isDone ? colors.primary : colors.surfaceBg,
                      border: `2px solid ${isActive || isDone ? colors.primary : colors.borderLight}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      transition: 'all 0.3s ease',
                      boxShadow: isActive ? `0 0 0 4px ${colors.primary}22` : 'none',
                    }}>
                      {isDone && !isActive
                        ? <span style={{ color: colors.surfaceWhite, fontSize: '14px', fontWeight: 700 }}>✓</span>
                        : <span style={{ filter: isActive ? 'none' : 'grayscale(1)', opacity: isActive ? 1 : 0.5 }}>{s.icon}</span>
                      }
                    </div>
                    {/* Label */}
                    <span style={{
                      fontSize: '11px',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? colors.primary : colors.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      transition: 'color 0.3s ease',
                    }}>
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active step detail card */}
            <div
              style={{
                marginTop: '24px',
                background: colors.surfaceBg,
                border: `1px solid ${colors.borderLight}`,
                borderRadius: '12px',
                padding: '16px',
                opacity: animating ? 0 : 1,
                transform: animating ? 'translateY(6px)' : 'translateY(0)',
                transition: 'opacity 0.28s ease, transform 0.28s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '20px' }}>{step.icon}</span>
                <span style={{ fontWeight: 700, fontSize: '13px', color: colors.textMain }}>{step.label}</span>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '10px', fontWeight: 700,
                  color: colors.primary,
                  background: `${colors.primary}15`,
                  padding: '3px 8px',
                  borderRadius: '9999px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Step {active + 1} of {STEPS.length}
                </span>
              </div>
              {/* Mini checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {step.points.map((pt, pi) => (
                  <div key={pt} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                      background: colors.primary,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ color: colors.surfaceWhite, fontSize: '10px', fontWeight: 700 }}>✓</span>
                    </div>
                    <span style={{ fontSize: '12px', color: colors.textMuted, lineHeight: 1.4 }}>{pt}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dot indicators */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  aria-label={`Step ${i + 1}`}
                  style={{
                    width: i === active ? '24px' : '8px',
                    height: '8px',
                    borderRadius: '9999px',
                    background: i === active ? colors.primary : colors.borderLight,
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    transition: 'width 0.3s ease, background 0.3s ease',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
