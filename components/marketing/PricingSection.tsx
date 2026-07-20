'use client';

import { useState } from 'react';
import Link from 'next/link';

const PLANS = [
  {
    key: 'free',
    name: 'Free Forever',
    monthly: 0,
    annual: 0,
    tagline: 'Start managing jobs at no cost, no expiry.',
    badge: null,
    featured: false,
    features: [
      'Up to 10 customers & vehicles',
      'Up to 5 completed jobs/month',
      'Digital inspections (2/month)',
      'Customer share links',
      'Estimates & invoices',
      '1 technician seat',
    ],
    cta: 'Start Free',
    ctaStyle: 'outline',
  },
  {
    key: 'solo',
    name: 'Solo',
    monthly: 24,
    annual: 240,
    tagline: 'For independent and mobile mechanics.',
    badge: 'Mobile Mechanics',
    featured: false,
    features: [
      '1 technician seat',
      'Unlimited jobs',
      'Digital inspections + photos',
      'Customer approval workflow',
      'Estimates & invoices',
      'Vehicle history',
    ],
    cta: 'Choose Solo',
    ctaStyle: 'outline',
  },
  {
    key: 'starter',
    name: 'Starter',
    monthly: 49,
    annual: 490,
    tagline: 'For small shops building a team.',
    badge: null,
    featured: false,
    features: [
      '1 technician seat',
      'Everything in Solo',
      'Team job assignments',
      'Priority support',
    ],
    cta: 'Choose Starter',
    ctaStyle: 'outline',
  },
  {
    key: 'professional',
    name: 'Professional',
    monthly: 99,
    annual: 990,
    tagline: 'For growing shops that want intelligence.',
    badge: 'Most Popular',
    featured: true,
    features: [
      'Up to 8 technician seats',
      'Everything in Starter',
      'AI repair intelligence',
      'Owner Command Center',
      'Customer retention alerts',
      'Performance analytics',
      'AI estimate assistant',
    ],
    cta: 'Choose Professional',
    ctaStyle: 'primary',
  },
  {
    key: 'business',
    name: 'Business',
    monthly: 179,
    annual: 1790,
    tagline: 'For larger and multi-location operations.',
    badge: null,
    featured: false,
    features: [
      'Unlimited technician seats',
      'Everything in Professional',
      'Multi-location dashboard',
      'Custom inspection templates',
      'Dedicated onboarding',
    ],
    cta: 'Choose Business',
    ctaStyle: 'outline',
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    monthly: null,
    annual: null,
    tagline: 'For groups, chains, and custom deployments.',
    badge: null,
    featured: false,
    features: [
      'Everything in Business',
      'Custom contract & SLA',
      'White-label options',
      'API access',
      'Custom integrations',
      'Dedicated account manager',
    ],
    cta: 'Contact Sales',
    ctaStyle: 'outline',
  },
];

export function PricingSection() {
  const [annual, setAnnual] = useState(false);

  function handlePlanClick(planKey: string) {
    if (planKey === 'enterprise') {
      window.location.href = 'mailto:admin@redlined1.com?subject=Enterprise%20plan%20inquiry';
      return;
    }
    const period = annual ? 'annual' : 'monthly';
    window.location.href = `/signup?plan=${planKey}&period=${period}&intent=paid`;
  }

  return (
    <section id="pricing" style={{ paddingBlock: 'clamp(56px, 8vw, 120px)', background: '#080808', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes price-red-pulse {
          0%,100% { box-shadow: 0 0 20px rgba(204,0,0,0.6), 0 4px 24px rgba(204,0,0,0.45); }
          50%      { box-shadow: 0 0 40px rgba(204,0,0,0.95), 0 8px 40px rgba(204,0,0,0.7); }
        }
        @keyframes price-white-pulse {
          0%,100% { box-shadow: 0 0 12px rgba(255,255,255,0.1), 0 2px 16px rgba(255,255,255,0.06); }
          50%      { box-shadow: 0 0 24px rgba(255,255,255,0.22), 0 4px 28px rgba(255,255,255,0.12); }
        }
        @keyframes price-shimmer {
          0%   { background-position: -300px 0; }
          100% { background-position: 300px 0; }
        }
        .price-btn-red  { animation: price-red-pulse 2.5s ease-in-out infinite; }
        .price-btn-white { animation: price-white-pulse 3s ease-in-out infinite; }
        .price-btn-red:hover  { animation: none !important; box-shadow: 0 0 60px rgba(204,0,0,1), 0 8px 48px rgba(204,0,0,0.8) !important; transform: translateY(-2px) scale(1.02); background: linear-gradient(135deg,#e52020,#aa0000) !important; }
        .price-btn-white:hover { animation: none !important; box-shadow: 0 0 32px rgba(255,255,255,0.35), 0 4px 24px rgba(204,0,0,0.3) !important; transform: translateY(-2px); border-color: rgba(204,0,0,0.5) !important; background: rgba(204,0,0,0.1) !important; }
        .price-btn-red:active, .price-btn-white:active { transform: translateY(0) scale(0.99) !important; }
      `}</style>

      {/* Background */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(204,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(204,0,0,0.03) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '800px', height: '400px',
        background: 'radial-gradient(ellipse, rgba(204,0,0,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: '1200px', marginInline: 'auto', paddingInline: 'clamp(16px, 5vw, 48px)', position: 'relative' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '20px', padding: '6px 14px', borderRadius: '9999px', background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.25)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#cc0000', boxShadow: '0 0 8px #cc0000' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#cc0000', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Pricing</span>
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 14px' }}>
            Simple pricing.<br />No surprises.
          </h2>
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.5)', maxWidth: '480px', margin: '0 auto 28px', lineHeight: 1.6 }}>
            Each plan unlocks more capacity, intelligence, and locations. Start free — upgrade when you grow.
          </p>

          {/* Toggle */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '6px 8px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={() => setAnnual(false)}
              style={{
                padding: '8px 18px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
                background: !annual ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: !annual ? '#fff' : 'rgba(255,255,255,0.4)',
                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
              }}
            >Monthly</button>
            <button
              onClick={() => setAnnual(true)}
              style={{
                padding: '8px 18px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
                background: annual ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: annual ? '#fff' : 'rgba(255,255,255,0.4)',
                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              Annual
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: 'rgba(34,197,94,0.2)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                SAVE ~17%
              </span>
            </button>
          </div>
        </div>

        {/* Plan grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', alignItems: 'start' }}>
          {PLANS.map((plan) => {
            const price = annual ? plan.annual : plan.monthly;
            const isFree = plan.key === 'free';
            const isEnterprise = plan.key === 'enterprise';

            return (
              <div
                key={plan.key}
                style={{
                  borderRadius: '20px',
                  padding: '28px 24px',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  background: plan.featured
                    ? 'linear-gradient(145deg, rgba(204,0,0,0.15), rgba(0,0,0,0.6))'
                    : 'rgba(255,255,255,0.03)',
                  border: plan.featured
                    ? '1.5px solid rgba(204,0,0,0.5)'
                    : '1px solid rgba(255,255,255,0.07)',
                  boxShadow: plan.featured
                    ? '0 0 40px rgba(204,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
              >
                {/* Featured glow */}
                {plan.featured && (
                  <div aria-hidden="true" style={{
                    position: 'absolute', inset: 0, borderRadius: '20px', pointerEvents: 'none',
                    background: 'radial-gradient(ellipse at top, rgba(204,0,0,0.08) 0%, transparent 70%)',
                  }} />
                )}

                {plan.badge && (
                  <div style={{
                    position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                    fontSize: '10px', fontWeight: 800, padding: '4px 12px', borderRadius: '9999px',
                    background: plan.featured ? '#cc0000' : 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    border: plan.featured ? 'none' : '1px solid rgba(255,255,255,0.15)',
                    whiteSpace: 'nowrap', letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>
                    {plan.badge}
                  </div>
                )}

                {/* Plan name */}
                <div style={{ marginTop: plan.badge ? '8px' : 0, marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: plan.featured ? '#ff4444' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {plan.name}
                  </span>
                </div>

                {/* Price */}
                <div style={{ marginBottom: '8px' }}>
                  {isEnterprise ? (
                    <span style={{ fontSize: '32px', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>Custom</span>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
                      <span style={{ fontSize: '38px', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>
                        {price === 0 ? 'Free' : `$${price}`}
                      </span>
                      {price !== 0 && price !== null && (
                        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', marginBottom: '6px' }}>
                          /{annual ? 'yr' : 'mo'}
                        </span>
                      )}
                    </div>
                  )}
                  {annual && price !== null && price !== 0 && (
                    <div style={{ fontSize: '11px', color: '#22c55e', marginTop: '3px' }}>
                      ~${Math.round((plan.monthly! * 12 - price))} saved vs monthly
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '22px', lineHeight: 1.5, minHeight: '38px' }}>
                  {plan.tagline}
                </div>

                {/* CTA */}
                {isFree ? (
                  <Link
                    href="/signup"
                    className="price-btn-red"
                    style={{
                      display: 'block', textAlign: 'center', padding: '13px 0',
                      borderRadius: '10px', fontWeight: 800, fontSize: '14px',
                      textDecoration: 'none', marginBottom: '22px',
                      background: 'linear-gradient(135deg, #e52020 0%, #aa0000 100%)',
                      color: '#fff',
                      border: '1px solid rgba(255,100,100,0.2)',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      position: 'relative', overflow: 'hidden',
                    }}
                  >
                    <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.12) 50%,transparent 60%)', backgroundSize: '300px 100%', animation: 'price-shimmer 3s linear infinite', pointerEvents: 'none' }} />
                    Start Free
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => handlePlanClick(plan.key)}
                    className={plan.featured ? 'price-btn-red' : 'price-btn-white'}
                    style={{
                      display: 'block', width: '100%', padding: '13px 0',
                      borderRadius: '10px', fontWeight: 800, fontSize: '14px',
                      cursor: 'pointer', marginBottom: '22px',
                      background: plan.featured
                        ? 'linear-gradient(135deg, #e52020 0%, #aa0000 100%)'
                        : 'rgba(255,255,255,0.07)',
                      color: '#fff',
                      border: plan.featured ? '1px solid rgba(255,100,100,0.2)' : '1px solid rgba(255,255,255,0.14)',
                      transition: 'transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s',
                      position: 'relative', overflow: 'hidden',
                    }}
                  >
                    {plan.featured && (
                      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.12) 50%,transparent 60%)', backgroundSize: '300px 100%', animation: 'price-shimmer 3s linear infinite', pointerEvents: 'none' }} />
                    )}
                    {plan.cta}
                  </button>
                )}

                {false && (
                  <p style={{ fontSize: '12px', color: '#f87171', marginTop: '-14px', marginBottom: '14px', textAlign: 'center' }}>
                    Could not start checkout.{' '}
                    <a href="mailto:admin@redlined1.com" style={{ color: '#f87171' }}>Contact us</a>
                  </p>
                )}

                {/* Features */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: '2px' }}>
                        <circle cx="7" cy="7" r="7" fill={plan.featured ? 'rgba(204,0,0,0.25)' : 'rgba(255,255,255,0.07)'} />
                        <path d="M4 7l2 2 4-4" stroke={plan.featured ? '#ff6666' : 'rgba(255,255,255,0.4)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom note */}
        <div style={{ textAlign: 'center', marginTop: '40px' }}>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.25)', lineHeight: 1.7 }}>
            Free Forever requires no credit card. Paid plans billed monthly or annually.<br />
            Cancel anytime. Prices in USD.
          </p>
        </div>
      </div>
    </section>
  );
}
