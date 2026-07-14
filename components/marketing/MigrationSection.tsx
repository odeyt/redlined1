'use client';

import { useState } from 'react';
import Link from 'next/link';

const FLOW_STEPS = [
  { label: 'Export', desc: 'Export your data from your current system — CSV, Excel, or native export formats.' },
  { label: 'Upload', desc: 'Upload directly into RedlineD1. Drag-and-drop or file select — no technical setup.' },
  { label: 'Map Fields', desc: 'Match your columns to RedlineD1 fields. Common formats auto-map in seconds.' },
  { label: 'Detect Duplicates', desc: 'The import engine flags duplicate customers, vehicles, and parts before they land.' },
  { label: 'Validate', desc: 'Review a validation summary — counts, warnings, and any records that need attention.' },
  { label: 'Review', desc: 'Preview a sample of imported records before committing. Go back and adjust if needed.' },
  { label: 'Go Live', desc: 'Confirm the import. Your data is live in RedlineD1 — connected, searchable, and ready.' },
];

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
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [checkoutError, setCheckoutError] = useState(false);

  async function handleCheckout(planId: string) {
    setLoadingPlan(true);
    setCheckoutError(false);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, billingInterval: 'monthly' }),
      });
      if (res.status === 401) { window.location.href = '/login?next=pricing'; return; }
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setCheckoutError(true);
    } finally {
      setLoadingPlan(false);
    }
  }

  const step = FLOW_STEPS[activeStep];
  const stepColor = COLORS[activeStep];

  return (
    <section id="migration" style={{ paddingBlock: 'clamp(56px, 8vw, 120px)', background: '#080808', position: 'relative', overflow: 'hidden' }}>

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
              const c = COLORS[i];
              return (
                <button
                  key={s.label}
                  onClick={() => setActiveStep(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '8px 16px', borderRadius: '9999px', cursor: 'pointer',
                    border: `1.5px solid ${isActive ? c : 'rgba(255,255,255,0.08)'}`,
                    background: isActive ? `${c}18` : 'transparent',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.35)',
                    fontSize: '13px', fontWeight: isActive ? 700 : 400,
                    transition: 'all 0.2s',
                    boxShadow: isActive ? `0 0 14px ${c}33` : 'none',
                  }}
                >
                  <span style={{ fontSize: '10px', fontWeight: 800, color: isActive ? c : 'rgba(255,255,255,0.2)' }}>{i + 1}</span>
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Step detail */}
          <div style={{
            padding: '24px 28px', borderRadius: '16px',
            border: `1.5px solid ${stepColor}33`,
            background: `${stepColor}0a`,
            transition: 'all 0.3s ease',
            display: 'flex', alignItems: 'flex-start', gap: '16px',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: '10px', flexShrink: 0,
              background: stepColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px', fontWeight: 800, color: '#fff',
              boxShadow: `0 4px 14px ${stepColor}55`,
            }}>
              {activeStep + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: stepColor, marginBottom: '6px' }}>{step.label}</div>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: 0 }}>{step.desc}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: '14px', height: '2px', background: 'rgba(255,255,255,0.06)', borderRadius: '9999px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '9999px',
              width: `${((activeStep + 1) / FLOW_STEPS.length) * 100}%`,
              background: stepColor, transition: 'width 0.3s ease, background 0.3s ease',
            }} />
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
                <>
                  <button
                    type="button"
                    disabled={loadingPlan}
                    onClick={() => handleCheckout(tier.planId!)}
                    style={{
                      width: '100%', padding: '12px 0', borderRadius: '10px',
                      fontWeight: 700, fontSize: '14px', cursor: loadingPlan ? 'wait' : 'pointer',
                      background: '#cc0000', color: '#fff', border: 'none',
                      boxShadow: '0 4px 20px rgba(204,0,0,0.35)',
                      opacity: loadingPlan ? 0.7 : 1, transition: 'all 0.2s',
                    }}
                  >
                    {loadingPlan ? 'Redirecting…' : tier.cta}
                  </button>
                  {checkoutError && (
                    <p style={{ fontSize: '12px', color: '#f87171', marginTop: '8px', textAlign: 'center' }}>
                      Could not start checkout.{' '}
                      <a href="mailto:admin@redlined1.com" style={{ color: '#f87171' }}>Contact us</a>
                    </p>
                  )}
                </>
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
