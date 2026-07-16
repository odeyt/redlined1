'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const ROTATING_WORDS = ['Repair Shops', 'Mobile Mechanics', 'Fleet Managers', 'Shop Owners'];

const STATS = [
  { label: 'Open Jobs',       value: '12',  color: '#818cf8', sub: 'active' },
  { label: 'Stale Estimates', value: '3',   color: '#f59e0b', sub: 'need follow-up' },
  { label: 'Unpaid Invoices', value: '5',   color: '#ef4444', sub: '฿48,200 gap' },
  { label: 'DVIs This Week',  value: '28',  color: '#22d3a0', sub: 'completed' },
];

const QUICK_PLANS = [
  { label: 'Solo',         price: '$24', planId: 'solo' },
  { label: 'Starter',      price: '$49', planId: 'starter' },
  { label: 'Professional', price: '$99', planId: 'professional', featured: true },
  { label: 'Business',     price: '$179', planId: 'business' },
];

const JOBS = [
  { job: 'JOB-0091', vehicle: '2021 Toyota HiLux',       status: 'In Progress',    tech: 'J. Santos', color: '#818cf8', revenue: '฿4,800' },
  { job: 'JOB-0090', vehicle: '2019 Ford Ranger',        status: 'Estimate Sent',  tech: 'M. Lee',    color: '#f59e0b', revenue: '฿2,100' },
  { job: 'JOB-0089', vehicle: '2018 Mitsubishi Triton',  status: 'Awaiting Parts', tech: 'J. Santos', color: '#38bdf8', revenue: '฿6,400' },
  { job: 'JOB-0088', vehicle: '2020 Isuzu D-Max',        status: 'Ready',          tech: 'K. Wiroj',  color: '#22d3a0', revenue: '฿3,250' },
];

export function HeroSection() {
  const [wordIdx, setWordIdx] = useState(0);
  const [fading, setFading]   = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => { setWordIdx(p => (p + 1) % ROTATING_WORDS.length); setFading(false); }, 300);
    }, 2600);
    return () => clearInterval(t);
  }, []);

  // Animate the "live" counter dot
  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 1200);
    return () => clearInterval(t);
  }, []);

  function handleCheckout(planId: string) {
    window.location.href = `/signup?plan=${planId}&billing=monthly`;
  }

  return (
    <section id="top" style={{ position: 'relative', paddingBlock: 'clamp(72px,10vw,140px)', background: '#07070a', overflow: 'hidden' }}>

      <style>{`
        @keyframes hero-glow-pulse {
          0%, 100% { box-shadow: 0 0 24px rgba(204,0,0,0.55), 0 4px 32px rgba(204,0,0,0.4); }
          50%       { box-shadow: 0 0 48px rgba(204,0,0,0.85), 0 8px 48px rgba(204,0,0,0.6); }
        }
        @keyframes hero-shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        @keyframes hero-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
        @keyframes hero-scan {
          0%   { top: 0%; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes hero-dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(204,0,0,0.7); }
          50%       { opacity: 0.7; transform: scale(1.3); box-shadow: 0 0 0 6px rgba(204,0,0,0); }
        }
        @keyframes hero-badge-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(204,0,0,0.4); }
          50%       { box-shadow: 0 0 0 4px rgba(204,0,0,0.08); }
        }
        .hero-trial-btn:hover { animation: none !important; box-shadow: 0 0 60px rgba(204,0,0,0.95), 0 8px 40px rgba(204,0,0,0.7) !important; transform: translateY(-2px) scale(1.02); }
        .hero-trial-btn:active { transform: translateY(0) scale(0.99); }
        .hero-plan-btn:hover { border-color: rgba(204,0,0,0.6) !important; background: rgba(204,0,0,0.12) !important; color: #fff !important; transform: translateY(-1px); }
        .hero-secondary-btn:hover { background: rgba(255,255,255,0.1) !important; border-color: rgba(255,255,255,0.2) !important; transform: translateY(-1px); }
        .hero-job-row:hover { background: rgba(255,255,255,0.05) !important; }
      `}</style>

      {/* ── Background elements ──────────────────────────── */}
      {/* Red grid */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(204,0,0,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(204,0,0,0.035) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />

      {/* Center glow */}
      <div aria-hidden="true" style={{ position: 'absolute', top: '-5%', left: '50%', transform: 'translateX(-50%)', width: 1100, height: 700, background: 'radial-gradient(ellipse, rgba(204,0,0,0.12) 0%, transparent 60%)', pointerEvents: 'none' }} />

      {/* Left accent */}
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 1, height: '40%', background: 'linear-gradient(to bottom, #cc0000, transparent)', opacity: 0.5 }} />
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, right: 0, width: 1, height: '40%', background: 'linear-gradient(to bottom, #cc0000, transparent)', opacity: 0.5 }} />

      {/* Corner brackets */}
      {/* Top-left bracket */}
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 200, height: 200, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 60, background: 'linear-gradient(to bottom, rgba(204,0,0,0.9), transparent)' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, height: 1, width: 60, background: 'linear-gradient(to right, rgba(204,0,0,0.9), transparent)' }} />
      </div>
      {/* Top-right bracket */}
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, right: 0, width: 200, height: 200, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 1, height: 60, background: 'linear-gradient(to bottom, rgba(204,0,0,0.9), transparent)' }} />
        <div style={{ position: 'absolute', top: 0, right: 0, height: 1, width: 60, background: 'linear-gradient(to left, rgba(204,0,0,0.9), transparent)' }} />
      </div>

      <div style={{ maxWidth: 1280, marginInline: 'auto', paddingInline: 'clamp(16px,5vw,48px)', position: 'relative', textAlign: 'center' }}>

        {/* ── Eyebrow badge ──────────────────────────────── */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 28, padding: '7px 18px', borderRadius: 9999, background: 'rgba(204,0,0,0.08)', border: '1px solid rgba(204,0,0,0.28)', animation: 'hero-badge-glow 3s ease-in-out infinite' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#cc0000', animation: 'hero-dot-pulse 2s ease-in-out infinite' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#ff6060', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Live in Production · Built in a Real Shop
          </span>
        </div>

        {/* ── H1 ─────────────────────────────────────────── */}
        <h1 style={{ fontSize: 'clamp(42px,7.5vw,92px)', fontWeight: 900, lineHeight: 0.95, letterSpacing: '-0.04em', color: '#fff', margin: '0 auto 20px', maxWidth: 980 }}>
          The operating system<br />
          <span style={{ display: 'inline-block', marginTop: 4 }}>
            built for{' '}
            <span style={{
              color: '#cc0000',
              display: 'inline-block',
              minWidth: 'clamp(200px,30vw,380px)',
              textAlign: 'left',
              textShadow: '0 0 60px rgba(204,0,0,0.5)',
              transition: 'opacity 0.3s ease, transform 0.3s ease',
              opacity: fading ? 0 : 1,
              transform: fading ? 'translateY(10px)' : 'translateY(0)',
            }}>
              {ROTATING_WORDS[wordIdx]}
            </span>
          </span>
        </h1>

        {/* ── Subtitle ────────────────────────────────────── */}
        <p style={{ fontSize: 'clamp(16px,2vw,19px)', lineHeight: 1.65, color: 'rgba(255,255,255,0.45)', maxWidth: 640, margin: '0 auto 44px' }}>
          Customers, vehicles, digital inspections, estimates, technicians, invoices, and business intelligence — one connected platform, built for how real shops work.
        </p>

        {/* ── Primary CTAs ────────────────────────────────── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 32 }}>
          <Link
            href="/signup"
            className="hero-trial-btn"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '16px 36px', borderRadius: 12,
              background: 'linear-gradient(135deg, #e52020 0%, #aa0000 100%)',
              color: '#fff', fontWeight: 800, fontSize: 17, textDecoration: 'none',
              border: '1px solid rgba(255,100,100,0.25)',
              animation: 'hero-glow-pulse 2.5s ease-in-out infinite',
              transition: 'transform 0.2s, box-shadow 0.2s',
              position: 'relative', overflow: 'hidden',
            }}
          >
            {/* Shimmer overlay */}
            <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)', backgroundSize: '400px 100%', animation: 'hero-shimmer 3s linear infinite', pointerEvents: 'none' }} />
            Start Free Trial — 7 Days
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
              <path d="M3 9h12M10 4l5 5-5 5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <a
            href="#workflow"
            className="hero-secondary-btn"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '16px 28px', borderRadius: 12,
              background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.75)',
              fontWeight: 600, fontSize: 16, textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.1)',
              transition: 'all 0.2s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
              <path d="M6 5.5l5 2.5-5 2.5V5.5z" fill="rgba(255,255,255,0.6)"/>
            </svg>
            See How It Works
          </a>
        </div>

        {/* ── Trust signals ───────────────────────────────── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center', marginBottom: 56 }}>
          {['No credit card required', 'Full platform access', 'Cancel anytime', 'Built in a real repair shop'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="7" fill="rgba(34,211,160,0.15)"/>
                <path d="M4 7l2 2 4-4" stroke="#22d3a0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.32)', fontWeight: 500 }}>{t}</span>
            </div>
          ))}
        </div>

        {/* ── Dashboard mockup ────────────────────────────── */}
        <div style={{
          width: '100%', maxWidth: 1000, marginInline: 'auto',
          borderRadius: 24, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.07)',
          background: '#0d0d14',
          boxShadow: '0 40px 100px -20px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04), 0 0 80px rgba(204,0,0,0.06)',
          animation: 'hero-float 6s ease-in-out infinite',
          position: 'relative',
        }}>
          {/* Scan line */}
          <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(204,0,0,0.3), transparent)', animation: 'hero-scan 4s linear infinite', pointerEvents: 'none', zIndex: 10 }} />

          {/* Window bar */}
          <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['#ef4444','#f59e0b','#22c55e'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />)}
            </div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <div style={{ padding: '4px 20px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 11, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.02em' }}>
                app.redlined1.com — Owner Command Center
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22d3a0', boxShadow: '0 0 8px #22d3a0', animation: 'hero-dot-pulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 10, color: 'rgba(34,211,160,0.7)', fontWeight: 600 }}>LIVE</span>
            </div>
          </div>

          {/* KPI stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1px', background: 'rgba(255,255,255,0.05)' }}>
            {STATS.map(s => (
              <div key={s.label} style={{ padding: '18px 20px', background: '#0d0d14', position: 'relative', overflow: 'hidden' }}>
                <div aria-hidden="true" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${s.color}88, transparent)` }} />
                <div style={{ fontSize: 30, fontWeight: 900, color: s.color, letterSpacing: '-0.03em', textShadow: `0 0 20px ${s.color}66` }}>{s.value}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{s.label}</div>
                <div style={{ fontSize: 10, color: s.color, opacity: 0.65, marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Job list */}
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active Jobs</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>Today</span>
            </div>
            {JOBS.map(row => (
              <div key={row.job} className="hero-job-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s', cursor: 'default' }}>
                <div style={{ width: 3, height: 36, borderRadius: 9999, background: row.color, flexShrink: 0, boxShadow: `0 0 8px ${row.color}66` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>{row.job} · {row.vehicle}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>Tech: {row.tech}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: row.color, background: `${row.color}14`, border: `1px solid ${row.color}30`, padding: '3px 10px', borderRadius: 7, whiteSpace: 'nowrap' }}>
                  {row.status}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', minWidth: 60, textAlign: 'right' }}>{row.revenue}</span>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div style={{ padding: '10px 20px 14px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', fontStyle: 'italic' }}>Sample data shown for illustration only</span>
            <div style={{ display: 'flex', gap: 12 }}>
              {['฿16,550 Today', '฿98,400 MTD'].map(v => (
                <span key={v} style={{ fontSize: 11, fontWeight: 700, color: 'rgba(34,211,160,0.55)' }}>{v}</span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Quick plan picker ───────────────────────────── */}
        <div style={{ marginTop: 56 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16 }}>
            Pick a plan and get started
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            <Link href="/signup" className="hero-plan-btn" style={{ padding: '12px 22px', borderRadius: 10, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 13, transition: 'all 0.2s', display: 'block' }}>
              <div>Free Trial</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>7 days free</div>
            </Link>
            {QUICK_PLANS.map(plan => (
              <button
                key={plan.planId}
                type="button"
                onClick={() => handleCheckout(plan.planId)}
                className={plan.featured ? 'hero-trial-btn' : 'hero-plan-btn'}
                style={{
                  padding: '12px 22px', borderRadius: 10, cursor: 'pointer',
                  border: plan.featured ? '1.5px solid rgba(204,0,0,0.6)' : '1px solid rgba(255,255,255,0.1)',
                  background: plan.featured ? 'linear-gradient(135deg, #e52020, #aa0000)' : 'rgba(255,255,255,0.04)',
                  color: plan.featured ? '#fff' : 'rgba(255,255,255,0.5)',
                  fontWeight: 700, fontSize: 13,
                  animation: plan.featured ? 'hero-glow-pulse 2.5s ease-in-out infinite' : 'none',
                  transition: 'all 0.2s',
                }}
              >
                <div>{loadingPlan === plan.planId ? '…' : plan.label}</div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{plan.price}/mo</div>
              </button>
            ))}
            <a href="mailto:admin@redlined1.com?subject=Enterprise%20inquiry" style={{ padding: '12px 22px', borderRadius: 10, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.06)', background: 'transparent', color: 'rgba(255,255,255,0.28)', fontWeight: 600, fontSize: 13, display: 'block' }}>
              <div>Enterprise</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Custom</div>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
