'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const FLOW_STEPS = [
  { label: 'Export',           icon: '📤', color: '#6366f1', desc: 'Export your data from your current system — CSV, Excel, or native export formats.',                          detail: 'Supports Tekmetric, Shopmonkey, Mitchell 1, Shop-Ware, and 10+ other platforms.' },
  { label: 'Upload',           icon: '☁️', color: '#0ea5e9', desc: 'Upload directly into RedlineD1. Drag-and-drop or file select — no technical setup.',                        detail: 'Files are encrypted in transit and scanned before processing.' },
  { label: 'Map Fields',       icon: '🗺️', color: '#f59e0b', desc: 'Match your columns to RedlineD1 fields. Common formats auto-map in seconds.',                               detail: 'Smart detection recognizes 50+ standard field names automatically.' },
  { label: 'Detect Duplicates',icon: '🔍', color: '#ef4444', desc: 'The import engine flags duplicate customers, vehicles, and parts before they land.',                        detail: 'Fuzzy matching catches name and phone number variations.' },
  { label: 'Validate',         icon: '✅', color: '#10b981', desc: 'Review a validation summary — counts, warnings, and any records that need attention.',                      detail: 'Zero records are imported until you approve the validation report.' },
  { label: 'Review',           icon: '👁️', color: '#8b5cf6', desc: 'Preview a sample of imported records before committing. Go back and adjust if needed.',                    detail: 'See exactly what your data will look like inside RedlineD1.' },
  { label: 'Go Live',          icon: '🚀', color: '#cc0000', desc: 'Confirm the import. Your data is live in RedlineD1 — connected, searchable, and ready.',                   detail: 'Average migration completes in under 10 minutes.' },
];

const STEP_INTERVAL = 3500;

// kept for tier card colors only
const COLORS = ['#6366f1','#0ea5e9','#f59e0b','#ef4444','#10b981','#8b5cf6','#cc0000'];

const SOURCE_PLATFORMS = [
  'Tekmetric','Shopmonkey','Shop-Ware','AutoLeap','Mitchell 1','RO Writer',
  'Protractor','NAPA TRACS','MaxxTraxx','Manager SE','Shop Boss','GaragePlug','CSV / Excel',
];

const TIERS = [
  {
    name: 'Self-Service Import',
    icon: '📥',
    badge: 'Available Now',
    badgeColor: '#22c55e',
    desc: 'Import parts and inventory data yourself via CSV or Excel. Structured template provided. Best for shops with clean, export-ready data.',
    features: ['Parts & inventory import', 'CSV / Excel template', 'Validation preview', 'No wait time'],
    cta: 'Start Free — Import Included',
    ctaHref: '/signup',
    ctaType: 'link',
    color: '#6366f1',
  },
  {
    name: 'Assisted Migration',
    icon: '🤝',
    badge: 'With Onboarding',
    badgeColor: '#f59e0b',
    desc: 'Our team maps and validates your data alongside you during onboarding. Included with Professional and Business plans.',
    features: ['Guided field mapping', 'Data validation review', 'Customer & vehicle history', 'Onboarding session included'],
    cta: 'Get Professional',
    ctaHref: null,
    ctaType: 'checkout',
    planId: 'professional',
    color: '#cc0000',
    featured: true,
  },
  {
    name: 'White-Glove Migration',
    icon: '🏆',
    badge: 'Enterprise',
    badgeColor: '#8b5cf6',
    desc: 'Full-service migration handled end to end by our team. We extract, clean, map, validate, and import — you just review and go live.',
    features: ['Full extraction & mapping', 'Data cleaning included', 'Multi-source consolidation', 'Dedicated migration manager'],
    cta: 'Contact Sales',
    ctaHref: 'mailto:admin@redlined1.com?subject=White-Glove%20Migration%20inquiry',
    ctaType: 'mailto',
    color: '#8b5cf6',
  },
];

export function MigrationSection() {
  const [activeStep, setActiveStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startProgress() {
    if (progressRef.current) clearInterval(progressRef.current);
    setProgressPct(0);
    const start = Date.now();
    progressRef.current = setInterval(() => {
      const pct = Math.min(((Date.now() - start) / STEP_INTERVAL) * 100, 100);
      setProgressPct(pct);
      if (pct >= 100 && progressRef.current) clearInterval(progressRef.current);
    }, 30);
  }

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;
      setAnimating(true);
      setTimeout(() => {
        setActiveStep(prev => (prev + 1) % FLOW_STEPS.length);
        setAnimating(false);
      }, 280);
      startProgress();
    }, STEP_INTERVAL);
  }

  function jumpTo(i: number) {
    pausedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    setAnimating(true);
    setTimeout(() => { setActiveStep(i); setAnimating(false); }, 200);
    startProgress();
    pauseTimeoutRef.current = setTimeout(() => {
      pausedRef.current = false;
      startTimer();
    }, 8000);
  }

  useEffect(() => {
    startProgress();
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCheckout(planId: string) {
    window.location.href = `/signup?plan=${planId}&billing=monthly`;
  }

  const step = FLOW_STEPS[activeStep];
  const stepColor = step.color;

  return (
    <section id="migration" style={{ paddingBlock: 'clamp(56px, 8vw, 120px)', background: '#080808', position: 'relative', overflow: 'hidden' }}>

      <style>{`
        @keyframes mig-icon-pop {
          0%   { transform: scale(0.8); opacity: 0.5; }
          60%  { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .mig-pill { transition: all 0.25s ease; }
        .mig-pill:hover { transform: translateY(-1px); }
      `}</style>

      {/* Background grid */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, right: '10%',
        width: '500px', height: '300px',
        background: 'radial-gradient(ellipse, rgba(99,102,241,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: '1200px', marginInline: 'auto', paddingInline: 'clamp(16px, 5vw, 48px)', position: 'relative' }}>

        {/* Header */}
        <div style={{ marginBottom: '56px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '20px', padding: '6px 14px', borderRadius: '9999px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Data Migration</span>
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 14px', maxWidth: '640px' }}>
            Switch without losing<br />your shop history.
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.45)', maxWidth: '560px', lineHeight: 1.7 }}>
            RedlineD1 supports migration through structured imports, assisted onboarding, and full white-glove service. Your customer records, vehicle history, and parts data come with you.
          </p>
        </div>

        {/* Interactive migration flow */}
        <div style={{ marginBottom: '64px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px' }}>
            Migration process
          </div>

          {/* Step pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
            {FLOW_STEPS.map((s, i) => {
              const isActive = i === activeStep;
              return (
                <button
                  key={s.label}
                  onClick={() => jumpTo(i)}
                  className="mig-pill"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '8px 16px', borderRadius: '9999px', cursor: 'pointer',
                    border: `1.5px solid ${isActive ? s.color : 'rgba(255,255,255,0.08)'}`,
                    background: isActive ? `${s.color}18` : 'transparent',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.35)',
                    fontSize: '13px', fontWeight: isActive ? 700 : 400,
                    boxShadow: isActive ? `0 0 16px ${s.color}44, 0 0 32px ${s.color}20` : 'none',
                  }}
                >
                  <span style={{ filter: isActive ? 'none' : 'grayscale(1) opacity(0.4)', transition: 'filter 0.3s' }}>{s.icon}</span>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: isActive ? s.color : 'rgba(255,255,255,0.2)' }}>{i + 1}</span>
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Step detail card */}
          <div style={{
            padding: '28px 32px', borderRadius: '20px',
            border: `1.5px solid ${stepColor}44`,
            background: `linear-gradient(135deg, ${stepColor}0c 0%, rgba(0,0,0,0.3) 100%)`,
            boxShadow: `0 0 40px ${stepColor}18`,
            display: 'flex', alignItems: 'flex-start', gap: '20px',
            opacity: animating ? 0 : 1,
            transform: animating ? 'translateY(8px)' : 'translateY(0)',
            transition: 'opacity 0.28s ease, transform 0.28s ease, border-color 0.4s ease, box-shadow 0.4s ease',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '14px', flexShrink: 0,
              background: `linear-gradient(135deg, ${stepColor}cc, ${stepColor}88)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px',
              boxShadow: `0 8px 24px ${stepColor}55`,
              animation: animating ? 'none' : 'mig-icon-pop 0.4s ease',
            }}>
              {step.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: stepColor }}>{step.label}</div>
                <div style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                  background: `${stepColor}18`, color: stepColor, border: `1px solid ${stepColor}33`,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  Step {activeStep + 1} of {FLOW_STEPS.length}
                </div>
              </div>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, margin: '0 0 6px' }}>{step.desc}</p>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, margin: 0 }}>{step.detail}</p>
            </div>
          </div>

          {/* Per-step progress segments */}
          <div style={{ marginTop: '16px', display: 'flex', gap: '4px' }}>
            {FLOW_STEPS.map((s, i) => {
              const isActive = i === activeStep;
              const isDone = i < activeStep;
              return (
                <button
                  key={i}
                  onClick={() => jumpTo(i)}
                  style={{
                    flex: 1, height: '4px', borderRadius: '9999px', cursor: 'pointer',
                    border: 'none', padding: 0, position: 'relative', overflow: 'hidden',
                    background: isDone ? `${s.color}55` : 'rgba(255,255,255,0.06)',
                  }}
                >
                  {isActive && (
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: '9999px',
                      background: stepColor,
                      transformOrigin: 'left',
                      transform: `scaleX(${progressPct / 100})`,
                    }} />
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>Click any step to explore</span>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>{activeStep + 1} / {FLOW_STEPS.length}</span>
          </div>
        </div>

        {/* Tier cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginBottom: '48px' }}>
          {TIERS.map((tier) => (
            <div key={tier.name} style={{
              padding: '28px', borderRadius: '20px', position: 'relative',
              background: tier.featured
                ? 'linear-gradient(145deg, rgba(204,0,0,0.12), rgba(0,0,0,0.5))'
                : 'rgba(255,255,255,0.03)',
              border: tier.featured
                ? '1.5px solid rgba(204,0,0,0.4)'
                : '1px solid rgba(255,255,255,0.07)',
              boxShadow: tier.featured ? '0 0 40px rgba(204,0,0,0.1)' : 'none',
              display: 'flex', flexDirection: 'column',
            }}>
              {tier.featured && (
                <div aria-hidden="true" style={{
                  position: 'absolute', inset: 0, borderRadius: '20px', pointerEvents: 'none',
                  background: 'radial-gradient(ellipse at top, rgba(204,0,0,0.07) 0%, transparent 70%)',
                }} />
              )}

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '26px' }}>{tier.icon}</span>
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px',
                  background: `${tier.badgeColor}18`, color: tier.badgeColor,
                  border: `1px solid ${tier.badgeColor}33`, letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  {tier.badge}
                </span>
              </div>

              <div style={{ fontSize: '17px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>{tier.name}</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: '20px', flex: 1 }}>{tier.desc}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '22px' }}>
                {tier.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                      <circle cx="7" cy="7" r="7" fill={`${tier.color}22`} />
                      <path d="M4 7l2 2 4-4" stroke={tier.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>{f}</span>
                  </div>
                ))}
              </div>

              {tier.ctaType === 'link' && (
                <Link href={tier.ctaHref!} style={{
                  display: 'block', textAlign: 'center', padding: '12px 0',
                  borderRadius: '10px', fontWeight: 700, fontSize: '14px', textDecoration: 'none',
                  background: 'rgba(255,255,255,0.07)', color: '#fff',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}>
                  {tier.cta}
                </Link>
              )}
              {tier.ctaType === 'checkout' && (
                <button
                  type="button"
                  onClick={() => handleCheckout(tier.planId!)}
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: '10px',
                    fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #e52020 0%, #aa0000 100%)',
                    color: '#fff', border: 'none',
                    boxShadow: '0 4px 20px rgba(204,0,0,0.35)',
                    transition: 'all 0.2s',
                  }}
                >
                  {tier.cta}
                </button>
              )}
              {tier.ctaType === 'mailto' && (
                <a
                  href={tier.ctaHref!}
                  style={{
                    display: 'block', textAlign: 'center', padding: '12px 0',
                    borderRadius: '10px', fontWeight: 700, fontSize: '14px', textDecoration: 'none',
                    background: 'rgba(139,92,246,0.12)', color: '#a78bfa',
                    border: '1px solid rgba(139,92,246,0.25)',
                  }}
                >
                  {tier.cta}
                </a>
              )}
            </div>
          ))}
        </div>

        {/* Platform tags */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>
            Coming from another platform?
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {SOURCE_PLATFORMS.map((p) => (
              <span key={p} style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
                color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                {p}
              </span>
            ))}
          </div>
        </div>

        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.18)', lineHeight: 1.7, maxWidth: '720px', marginTop: '16px', fontStyle: 'italic' }}>
          These are common platforms shop owners switch from. RedlineD1 has no official partnership with any listed platform. Import capabilities vary by source and available export format. Parts and inventory import is available today; customer and vehicle history migration is handled through Assisted or White-Glove onboarding.
        </p>
      </div>
    </section>
  );
}
