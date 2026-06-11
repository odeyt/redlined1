'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const SLIDES = [
  {
    headline: 'The #1 Auto Repair CRM for Modern Shops',
    sub: 'From booking to payment — manage your entire shop in one place. Built for mobile mechanics, independent shops, and multi-bay operations.',
    cta: 'Start Free 7-Day Trial',
    bg: 'linear-gradient(135deg, #0a0a0a 0%, #1a0000 60%, #2a0000 100%)',
    badge: '4,000+ Shops Worldwide',
  },
  {
    headline: 'Digital Inspections That Close More Jobs',
    sub: 'Send photo-based vehicle inspection reports to customers in seconds. Build trust, increase approvals, and boost average repair order value.',
    cta: 'See How It Works',
    bg: 'linear-gradient(135deg, #0a0a0a 0%, #00001a 60%, #0a0a1a 100%)',
    badge: 'Increase ARO by 40%',
  },
  {
    headline: 'Invoicing & Estimates — Done in Minutes',
    sub: 'Professional invoices, instant estimates, and online payment collection. Get paid faster with integrated payment processing.',
    cta: 'Start Free 7-Day Trial',
    bg: 'linear-gradient(135deg, #0a0a0a 0%, #001a00 60%, #0a1a0a 100%)',
    badge: 'No Credit Card Required',
  },
  {
    headline: 'Manage Your Whole Team From One Dashboard',
    sub: 'Assign jobs, track technician productivity, and monitor every repair order in real time. Run a tighter, more profitable shop.',
    cta: 'Start Free 7-Day Trial',
    bg: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a00 60%, #2a1000 100%)',
    badge: '24/7 Access — Any Device',
  },
];

const FEATURES = [
  { icon: '🧾', title: 'Invoices & Estimates', desc: 'Create professional invoices and estimates in seconds. Send via email or SMS and collect payment online.' },
  { icon: '🔍', title: 'Digital Inspections', desc: 'Photo-based vehicle inspection reports build customer trust and increase job approvals.' },
  { icon: '📅', title: 'Scheduling & Jobs', desc: 'Drag-and-drop job scheduling, repair orders, and real-time job status tracking.' },
  { icon: '👤', title: 'Customer Management', desc: 'Full CRM with customer history, vehicles, notes, and communication tracking.' },
  { icon: '🚗', title: 'Vehicle History', desc: 'Complete service history per vehicle. Never lose track of past repairs or upcoming maintenance.' },
  { icon: '🧰', title: 'Parts & Inventory', desc: 'Track parts inventory, set reorder points, and attach parts directly to job cards.' },
  { icon: '👷', title: 'Technician Management', desc: 'Assign techs to jobs, track hours, and measure individual productivity.' },
  { icon: '💳', title: 'Payments', desc: 'Accept payments online, track outstanding balances, and reconcile accounts easily.' },
  { icon: '📊', title: 'Reports & Analytics', desc: 'Revenue reports, job profitability, tech performance — all the numbers you need to grow.' },
];

const TECHS = [
  { initials: 'MJ', name: 'Marcus J.', role: 'Master Tech', color: '#cc0000' },
  { initials: 'TS', name: 'Tina S.', role: 'Service Advisor', color: '#e05000' },
  { initials: 'RK', name: 'Rico K.', role: 'Lead Mechanic', color: '#9900cc' },
  { initials: 'AL', name: 'Andre L.', role: 'Diagnostics', color: '#0066cc' },
  { initials: 'PW', name: 'Priya W.', role: 'Shop Manager', color: '#00997a' },
];

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    desc: 'Core tools to get started',
    features: ['Up to 10 customers', 'Basic invoices', 'Vehicle history', 'Email support'],
    cta: 'Get Started',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$49',
    period: 'per month',
    desc: 'Everything a growing shop needs',
    features: ['Unlimited customers', 'Digital inspections', 'Parts inventory', 'Technician management', 'Advanced reports', 'Priority support'],
    cta: 'Start Free Trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'For multi-location operations',
    features: ['Multi-location', 'Custom integrations', 'Dedicated onboarding', 'SLA support', 'Team training'],
    cta: 'Contact Us',
    highlight: false,
  },
];

const TESTIMONIALS = [
  { name: 'James T.', shop: 'T-Bone Auto Works', text: 'Redlined1 cut our invoice time in half. Our customers love getting professional reports on their phones.' },
  { name: 'Sandra M.', shop: 'Metro Quick Lube', text: 'We went from paper job cards to fully digital in a week. The team picked it up fast — no training needed.' },
  { name: 'Derek O.', shop: 'D&O Performance', text: 'The inspection tool alone pays for itself. Customers approve more work when they can see the photos.' },
];

export default function LandingPage() {
  const [slide, setSlide] = useState(0);
  const [fade, setFade] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function goToSlide(i: number) {
    setFade(false);
    setTimeout(() => {
      setSlide(i);
      setFade(true);
    }, 300);
  }

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setSlide(s => (s + 1) % SLIDES.length);
        setFade(true);
      }, 300);
    }, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const current = SLIDES[slide];

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: '#0a0a0a', color: '#fff', minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 5%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, background: '#cc0000', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, letterSpacing: '-0.5px' }}>R1</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.5px' }}>REDLINED<span style={{ color: '#cc0000' }}>1</span></span>
        </div>
        <div style={{ display: 'flex', gap: 32, fontSize: 14, color: '#aaa' }}>
          <a href="#features" style={{ color: '#aaa', textDecoration: 'none' }}>Features</a>
          <a href="#pricing" style={{ color: '#aaa', textDecoration: 'none' }}>Pricing</a>
          <a href="#testimonials" style={{ color: '#aaa', textDecoration: 'none' }}>Reviews</a>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/login" style={{ color: '#ccc', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Login</Link>
          <Link href="/signup" style={{ background: '#cc0000', color: '#fff', padding: '8px 20px', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>Get Started</Link>
        </div>
      </nav>

      {/* HERO SLIDESHOW */}
      <section style={{ minHeight: '88vh', background: current.bg, transition: 'background 0.8s ease', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden', padding: '80px 5%' }}>
        {/* Background grid pattern */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
          {/* Left: text */}
          <div style={{ opacity: fade ? 1 : 0, transform: fade ? 'translateY(0)' : 'translateY(16px)', transition: 'opacity 0.4s ease, transform 0.4s ease' }}>
            <span style={{ display: 'inline-block', background: 'rgba(204,0,0,0.18)', border: '1px solid rgba(204,0,0,0.35)', color: '#ff6b6b', padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 20, letterSpacing: 0.5 }}>
              {current.badge}
            </span>
            <h1 style={{ fontSize: 'clamp(32px, 4vw, 54px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 20, letterSpacing: '-1px' }}>
              {current.headline}
            </h1>
            <p style={{ fontSize: 18, color: '#bbb', lineHeight: 1.65, marginBottom: 36, maxWidth: 520 }}>
              {current.sub}
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Link href="/signup" style={{ background: '#cc0000', color: '#fff', padding: '14px 28px', borderRadius: 10, textDecoration: 'none', fontSize: 15, fontWeight: 700, display: 'inline-block' }}>
                {current.cta} →
              </Link>
              <a href="#features" style={{ border: '1px solid rgba(255,255,255,0.2)', color: '#ccc', padding: '14px 28px', borderRadius: 10, textDecoration: 'none', fontSize: 15, fontWeight: 500, display: 'inline-block' }}>
                See Features
              </a>
            </div>
            {/* Slide dots */}
            <div style={{ display: 'flex', gap: 8, marginTop: 36 }}>
              {SLIDES.map((_, i) => (
                <button key={i} onClick={() => goToSlide(i)} style={{ width: i === slide ? 28 : 8, height: 8, borderRadius: 4, border: 'none', cursor: 'pointer', background: i === slide ? '#cc0000' : 'rgba(255,255,255,0.2)', transition: 'all 0.3s ease', padding: 0 }} />
              ))}
            </div>
          </div>

          {/* Right: tech avatars + stat cards */}
          <div style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.4s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            {/* Avatar cluster */}
            <div style={{ position: 'relative', width: 320, height: 260 }}>
              {TECHS.map((t, i) => {
                const positions = [
                  { top: 0, left: '50%', transform: 'translateX(-50%)' },
                  { top: 80, left: 0 },
                  { top: 80, right: 0 },
                  { top: 160, left: 40 },
                  { top: 160, right: 40 },
                ];
                return (
                  <div key={i} style={{ position: 'absolute', ...positions[i], textAlign: 'center' }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, border: '3px solid rgba(255,255,255,0.15)', boxShadow: `0 0 20px ${t.color}55`, margin: '0 auto 6px' }}>
                      {t.initials}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{t.name}</div>
                    <div style={{ fontSize: 10, color: '#888' }}>{t.role}</div>
                  </div>
                );
              })}
            </div>

            {/* Stat cards */}
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { label: 'Shops Using Redlined1', value: '4,000+' },
                { label: 'Invoices Created', value: '1.2M+' },
                { label: 'Countries', value: '50+' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '14px 16px', textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#cc0000' }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding: '100px 5%', background: '#0d0d0d' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <span style={{ color: '#cc0000', fontWeight: 700, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' }}>Everything You Need</span>
            <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 900, marginTop: 12, letterSpacing: '-0.5px' }}>Auto Repair Software Features</h2>
            <p style={{ color: '#888', fontSize: 16, marginTop: 14, maxWidth: 560, margin: '14px auto 0' }}>Everything you need to manage your shop, in one easy-to-use platform.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '28px 24px', transition: 'border-color 0.2s', cursor: 'default' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(204,0,0,0.4)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
                <div style={{ fontSize: 32, marginBottom: 14 }}>{f.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY REDLINED1 */}
      <section style={{ padding: '100px 5%', background: '#0a0a0a' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
          <div>
            <span style={{ color: '#cc0000', fontWeight: 700, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' }}>Why Redlined1</span>
            <h2 style={{ fontSize: 'clamp(26px, 3vw, 40px)', fontWeight: 900, marginTop: 12, lineHeight: 1.2 }}>Built by Shop Owners, For Shop Owners</h2>
            <p style={{ color: '#888', fontSize: 15, lineHeight: 1.7, marginTop: 16 }}>
              We built Redlined1 with the support and feedback of thousands of mechanics and shop owners. No complex setups, no training required — your whole team can be up and running today.
            </p>
            <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                'All members of your repair shop can use the software',
                'No specific technical skills required',
                'Works on any device — phone, tablet, desktop',
                '24/7 access to your shop data from anywhere',
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(204,0,0,0.2)', border: '1px solid rgba(204,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#cc0000', flexShrink: 0, marginTop: 1 }}>✓</div>
                  <span style={{ color: '#ccc', fontSize: 15 }}>{item}</span>
                </div>
              ))}
            </div>
            <Link href="/signup" style={{ display: 'inline-block', marginTop: 36, background: '#cc0000', color: '#fff', padding: '13px 28px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>
              Start Free Trial →
            </Link>
          </div>

          {/* Tech team display */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {TECHS.map((t, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '20px', display: 'flex', alignItems: 'center', gap: 14, gridColumn: i === 4 ? '1 / -1' : undefined }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, flexShrink: 0, boxShadow: `0 0 16px ${t.color}44` }}>
                  {t.initials}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                  <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{t.role}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                    <span style={{ fontSize: 11, color: '#22c55e' }}>Active</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="testimonials" style={{ padding: '100px 5%', background: '#0d0d0d' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <span style={{ color: '#cc0000', fontWeight: 700, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' }}>Reviews</span>
            <h2 style={{ fontSize: 'clamp(26px, 3vw, 40px)', fontWeight: 900, marginTop: 12 }}>Trusted by Shop Owners Everywhere</h2>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 12 }}>
              {'★★★★★'.split('').map((s, i) => <span key={i} style={{ color: '#f59e0b', fontSize: 20 }}>{s}</span>)}
              <span style={{ color: '#888', fontSize: 14, marginLeft: 8, alignSelf: 'center' }}>4.8 out of 5 — 2,500+ reviews</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '28px 24px' }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                  {'★★★★★'.split('').map((s, j) => <span key={j} style={{ color: '#f59e0b', fontSize: 14 }}>{s}</span>)}
                </div>
                <p style={{ color: '#ccc', fontSize: 15, lineHeight: 1.65, marginBottom: 20 }}>"{t.text}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#cc0000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
                    {t.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                    <div style={{ color: '#888', fontSize: 12 }}>{t.shop}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding: '100px 5%', background: '#0a0a0a' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <span style={{ color: '#cc0000', fontWeight: 700, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' }}>Pricing</span>
            <h2 style={{ fontSize: 'clamp(26px, 3vw, 40px)', fontWeight: 900, marginTop: 12 }}>Simple, Transparent Pricing</h2>
            <p style={{ color: '#888', fontSize: 15, marginTop: 12 }}>Start free. Upgrade when you're ready. No contracts, cancel anytime.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {PLANS.map((p, i) => (
              <div key={i} style={{ background: p.highlight ? 'rgba(204,0,0,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${p.highlight ? 'rgba(204,0,0,0.5)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 16, padding: '32px 24px', position: 'relative' }}>
                {p.highlight && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#cc0000', color: '#fff', padding: '4px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>Most Popular</div>}
                <div style={{ fontSize: 13, color: '#888', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{p.name}</div>
                <div style={{ fontSize: 40, fontWeight: 900, color: p.highlight ? '#ff6b6b' : '#fff' }}>{p.price}</div>
                {p.period && <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>{p.period}</div>}
                <div style={{ color: '#888', fontSize: 13, marginTop: 12, marginBottom: 24 }}>{p.desc}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                  {p.features.map((f, j) => (
                    <div key={j} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: '#ccc' }}>
                      <span style={{ color: '#cc0000', flexShrink: 0 }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                <Link href="/signup" style={{ display: 'block', textAlign: 'center', padding: '12px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 14, background: p.highlight ? '#cc0000' : 'rgba(255,255,255,0.08)', color: '#fff', border: p.highlight ? 'none' : '1px solid rgba(255,255,255,0.12)' }}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA BANNER */}
      <section style={{ padding: '80px 5%', background: 'linear-gradient(135deg, #1a0000 0%, #cc0000 50%, #1a0000 100%)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(26px, 4vw, 44px)', fontWeight: 900, marginBottom: 16 }}>Ready to Redline Your Shop?</h2>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, marginBottom: 32 }}>Join thousands of shops running smarter with Redlined1. No credit card required.</p>
        <Link href="/signup" style={{ background: '#fff', color: '#cc0000', padding: '15px 36px', borderRadius: 10, textDecoration: 'none', fontWeight: 800, fontSize: 16, display: 'inline-block' }}>
          Start Your Free 7-Day Trial →
        </Link>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#050505', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '40px 5%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, background: '#cc0000', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 11 }}>R1</div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>REDLINED<span style={{ color: '#cc0000' }}>1</span></span>
        </div>
        <div style={{ color: '#555', fontSize: 13 }}>© 2026 Redlined1. All rights reserved.</div>
        <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
          <a href="#" style={{ color: '#666', textDecoration: 'none' }}>Privacy</a>
          <a href="#" style={{ color: '#666', textDecoration: 'none' }}>Terms</a>
          <Link href="/login" style={{ color: '#666', textDecoration: 'none' }}>Login</Link>
        </div>
      </footer>
    </div>
  );
}
