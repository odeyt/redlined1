'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const ROTATING_WORDS = ['Repair Shops', 'Mobile Mechanics', 'Fleet Managers', 'Shop Owners'];

const STATS = [
  { label: 'Open Jobs', value: '12', color: '#6366f1' },
  { label: 'Stale Estimates', value: '3', color: '#f59e0b', sub: 'need follow-up' },
  { label: 'Unpaid Invoices', value: '5', color: '#ef4444', sub: 'revenue gap' },
  { label: 'DVIs This Week', value: '28', color: '#10b981', sub: 'completed' },
];

const QUICK_PLANS = [
  { label: 'Solo', price: '$24', planId: 'solo' },
  { label: 'Starter', price: '$49', planId: 'starter' },
  { label: 'Professional', price: '$99', planId: 'professional', featured: true },
  { label: 'Business', price: '$179', planId: 'business' },
];

export function HeroSection() {
  const [wordIdx, setWordIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setWordIdx(p => (p + 1) % ROTATING_WORDS.length);
        setFading(false);
      }, 300);
    }, 2400);
    return () => clearInterval(t);
  }, []);

  async function handleCheckout(planId: string) {
    setLoadingPlan(planId);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, billingInterval: 'monthly' }),
      });
      if (res.status === 401) { window.location.href = `/signup?plan=${planId}`; return; }
      if (res.status === 403) { window.location.href = `/signup?plan=${planId}`; return; }
      if (!res.ok) { window.location.href = `/signup?plan=${planId}`; return; }
      const { url } = await res.json();
      if (url) window.location.href = url;
      else window.location.href = `/signup?plan=${planId}`;
    } catch {
      window.location.href = `/signup?plan=${planId}`;
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <section
      id="top"
      style={{
        position: 'relative',
        paddingBlock: 'clamp(80px, 12vw, 160px)',
        background: '#080808',
        overflow: 'hidden',
      }}
    >
      {/* Background grid */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(204,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(204,0,0,0.04) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
      }} />

      {/* Red centre glow */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
        width: '900px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(204,0,0,0.14) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Corner accent lines */}
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: '200px', height: '200px', pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '80px', background: 'linear-gradient(to bottom, #cc0000, transparent)' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, height: '1px', width: '80px', background: 'linear-gradient(to right, #cc0000, transparent)' }} />
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, right: 0, width: '200px', height: '200px', pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: '1px', height: '80px', background: 'linear-gradient(to bottom, #cc0000, transparent)' }} />
        <div style={{ position: 'absolute', top: 0, right: 0, height: '1px', width: '80px', background: 'linear-gradient(to left, #cc0000, transparent)' }} />
      </div>

      <div style={{ maxWidth: '1200px', marginInline: 'auto', paddingInline: 'clamp(16px, 5vw, 48px)', position: 'relative', textAlign: 'center' }}>

        {/* Live badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '28px', padding: '6px 16px', borderRadius: '9999px', background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.3)' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#cc0000', boxShadow: '0 0 10px #cc0000' }} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#ff6666', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Live in Production · Built in a Real Shop
          </span>
        </div>

        {/* H1 */}
        <h1 style={{
          fontSize: 'clamp(40px, 7vw, 82px)',
          fontWeight: 900,
          lineHeight: 1.0,
          letterSpacing: '-0.035em',
          color: '#fff',
          margin: '0 auto 12px',
          maxWidth: '900px',
        }}>
          The operating system<br />
          <span style={{ position: 'relative', display: 'inline-block' }}>
            built for{' '}
            <span style={{
              color: '#cc0000',
              display: 'inline-block',
              minWidth: '340px',
              textAlign: 'left',
              transition: 'opacity 0.3s ease, transform 0.3s ease',
              opacity: fading ? 0 : 1,
              transform: fading ? 'translateY(8px)' : 'translateY(0)',
            }}>
              {ROTATING_WORDS[wordIdx]}
            </span>
          </span>
        </h1>

        {/* Sub */}
        <p style={{
          fontSize: 'clamp(16px, 2.2vw, 20px)',
          lineHeight: 1.65,
          color: 'rgba(255,255,255,0.5)',
          maxWidth: '680px',
          margin: '0 auto 40px',
        }}>
          Run customers, vehicles, digital inspections, estimates, technicians, invoices, and business intelligence from one connected platform — whether you work from a shop or the road.
        </p>

        {/* Primary CTAs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginBottom: '56px' }}>
          <Link
            href="/signup"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '15px 32px', borderRadius: '10px',
              background: '#cc0000', color: '#fff',
              fontWeight: 800, fontSize: '16px', textDecoration: 'none',
              boxShadow: '0 4px 24px rgba(204,0,0,0.45)',
              transition: 'all 0.2s',
              border: 'none',
            }}
          >
            Start Free Trial — 7 Days
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </Link>
          <a
            href="#workflow"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '15px 28px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)',
              fontWeight: 600, fontSize: '16px', textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.1)',
              transition: 'all 0.2s',
            }}
          >
            See How It Works
          </a>
        </div>

        {/* Trust line */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'center', marginBottom: '64px' }}>
          {['No credit card required', 'Full platform access', 'Cancel anytime', 'Built in a real repair shop'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="7" fill="rgba(34,197,94,0.15)" />
                <path d="M4 7l2 2 4-4" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>{t}</span>
            </div>
          ))}
        </div>

        {/* Live dashboard preview */}
        <div style={{
          width: '100%', maxWidth: '920px', marginInline: 'auto',
          borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.02)',
          boxShadow: '0 32px 80px -16px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
          overflow: 'hidden',
        }}>
          {/* Window bar */}
          <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['#ef4444','#f59e0b','#22c55e'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />)}
            </div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <div style={{ padding: '4px 16px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                app.redlined1.com — Command Center
              </div>
            </div>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'rgba(255,255,255,0.06)' }}>
            {STATS.map(s => (
              <div key={s.label} style={{ padding: '20px', background: '#0a0a0a' }}>
                <div style={{ fontSize: '28px', fontWeight: 900, color: s.color, letterSpacing: '-0.02em' }}>{s.value}</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '4px' }}>{s.label}</div>
                {s.sub && <div style={{ fontSize: '10px', color: s.color, opacity: 0.6, marginTop: '2px' }}>{s.sub}</div>}
              </div>
            ))}
          </div>

          {/* Mock job list */}
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { job: 'JOB-0091', vehicle: '2021 Toyota HiLux', status: 'In Progress', tech: 'J. Santos', color: '#6366f1' },
              { job: 'JOB-0090', vehicle: '2019 Ford Ranger', status: 'Estimate Sent', tech: 'M. Lee', color: '#f59e0b' },
              { job: 'JOB-0089', vehicle: '2018 Mitsubishi Triton', status: 'Awaiting Parts', tech: 'J. Santos', color: '#0ea5e9' },
            ].map(row => (
              <div key={row.job} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 14px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{ width: 3, height: 36, borderRadius: '9999px', background: row.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{row.job} · {row.vehicle}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>Tech: {row.tech}</div>
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px',
                  background: `${row.color}18`, color: row.color, border: `1px solid ${row.color}33`,
                  whiteSpace: 'nowrap',
                }}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>

          <div style={{ padding: '10px 20px 14px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>Sample data shown for illustration only</span>
          </div>
        </div>

        {/* Quick plan selector */}
        <div style={{ marginTop: '56px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>
            Pick a plan and get started
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
            <Link
              href="/signup"
              style={{
                padding: '12px 22px', borderRadius: '10px', textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)',
                fontWeight: 600, fontSize: '13px', transition: 'all 0.2s',
              }}
            >
              <div>Free Trial</div>
              <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '2px' }}>7 days free</div>
            </Link>
            {QUICK_PLANS.map(plan => (
              <button
                key={plan.planId}
                type="button"
                disabled={loadingPlan === plan.planId}
                onClick={() => handleCheckout(plan.planId)}
                style={{
                  padding: '12px 22px', borderRadius: '10px', cursor: 'pointer',
                  border: plan.featured ? '1.5px solid #cc0000' : '1px solid rgba(255,255,255,0.08)',
                  background: plan.featured ? 'rgba(204,0,0,0.15)' : 'rgba(255,255,255,0.04)',
                  color: plan.featured ? '#fff' : 'rgba(255,255,255,0.5)',
                  fontWeight: 700, fontSize: '13px',
                  boxShadow: plan.featured ? '0 0 20px rgba(204,0,0,0.2)' : 'none',
                  transition: 'all 0.2s',
                  opacity: loadingPlan === plan.planId ? 0.6 : 1,
                }}
              >
                <div>{loadingPlan === plan.planId ? '…' : plan.label}</div>
                <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '2px' }}>{plan.price}/mo</div>
              </button>
            ))}
            <a
              href="mailto:admin@redlined1.com?subject=Enterprise%20inquiry"
              style={{
                padding: '12px 22px', borderRadius: '10px', textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'transparent', color: 'rgba(255,255,255,0.3)',
                fontWeight: 600, fontSize: '13px',
              }}
            >
              <div>Enterprise</div>
              <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '2px' }}>Custom</div>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
