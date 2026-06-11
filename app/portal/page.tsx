'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LOGO_SRC } from '@/lib/logo';

/* ── DATA ─────────────────────────────────────────────────────── */

const SLIDES = [
  {
    headline: 'The #1 Auto Repair CRM for Modern Shops',
    sub: 'From booking to payment — manage your entire shop in one place. Built for mobile mechanics, independent shops, and multi-bay operations.',
    cta: 'Start Free 7-Day Trial',
    badge: '4,000+ Shops Worldwide',
    tag: null,
  },
  {
    headline: 'Built for Mobile Mechanics — Work From Anywhere',
    sub: 'Run your entire mobile mechanic business from your phone. Send invoices on-site, capture inspection photos, collect payment at the driveway — no office needed.',
    cta: 'Start Free — No Office Required',
    badge: '📱 Mobile-First Platform',
    tag: 'MOBILE MECHANIC',
  },
  {
    headline: 'Digital Inspections That Close More Jobs',
    sub: 'Send photo-based inspection reports to customers in seconds. Build trust, increase job approvals, and grow your average repair order.',
    cta: 'See How It Works',
    badge: 'Increase ARO by 40%',
    tag: null,
  },
  {
    headline: 'Professional Invoices — Done in Minutes',
    sub: 'Create estimates and invoices instantly, collect payment online, and keep every transaction organised in one dashboard.',
    cta: 'Start Free 7-Day Trial',
    badge: 'No Credit Card Required',
    tag: null,
  },
  {
    headline: 'Run Your Whole Team From One Screen',
    sub: 'Assign jobs, track technician productivity, and follow every repair order in real time. Run a tighter, more profitable shop.',
    cta: 'Start Free 7-Day Trial',
    badge: '24/7 Access — Any Device',
    tag: null,
  },
];

const FEATURES = [
  { icon: '🧾', title: 'Invoices & Estimates', desc: 'Professional invoices and estimates in seconds. Send via email or SMS and collect payment online.' },
  { icon: '🔍', title: 'Digital Inspections', desc: 'Photo-based vehicle inspection reports build customer trust and increase job approvals.' },
  { icon: '📅', title: 'Scheduling & Jobs', desc: 'Drag-and-drop job scheduling, repair orders, and real-time job status tracking.' },
  { icon: '👤', title: 'Customer Management', desc: 'Full CRM with customer history, vehicles, notes, and communication in one place.' },
  { icon: '🚗', title: 'Vehicle History', desc: 'Complete service history per vehicle. Never lose track of past repairs or upcoming maintenance.' },
  { icon: '🧰', title: 'Parts & Inventory', desc: 'Track parts inventory, set reorder points, and attach parts directly to job cards.' },
  { icon: '👷', title: 'Technician Management', desc: 'Assign techs to jobs, track hours, and measure individual productivity at a glance.' },
  { icon: '💳', title: 'Payments', desc: 'Accept payments online, track outstanding balances, and reconcile accounts with ease.' },
  { icon: '📊', title: 'Reports & Analytics', desc: 'Revenue, job profitability, and tech performance — every number you need to grow your shop.' },
];

const MOBILE_FEATURES = [
  { icon: '📱', title: 'Phone-First Workflow', desc: 'Create job cards, capture photos, and send invoices entirely from your smartphone — no laptop, no office, no problem.' },
  { icon: '📍', title: 'On-Site Invoicing', desc: 'Generate and send a professional invoice the moment you finish the job. Get paid on the spot via card or digital wallet.' },
  { icon: '🗺️', title: 'Job Location Tracking', desc: 'Log service addresses per job card. Know exactly where each vehicle was serviced and track your territory coverage.' },
  { icon: '📷', title: 'Photo Inspections On the Go', desc: 'Snap inspection photos on-site, attach them to the job, and send the customer a branded report before you leave their driveway.' },
  { icon: '💬', title: 'SMS & Email from the Field', desc: 'Send estimates, invoices, and follow-ups via SMS or email directly from the app — no copy-pasting, no separate tools.' },
  { icon: '🔧', title: 'Mobile Parts Lookup', desc: 'Search your parts inventory and add items to a job card while you\'re under the hood. Reorder low-stock parts on the spot.' },
];

const TECHS = [
  { name: 'Marcus J.', role: 'Master Technician', img: 'https://randomuser.me/api/portraits/men/32.jpg', color: '#cc0000' },
  { name: 'Tina S.',   role: 'Service Advisor',   img: 'https://randomuser.me/api/portraits/women/44.jpg', color: '#e05500' },
  { name: 'Rico K.',   role: 'Lead Mechanic',      img: 'https://randomuser.me/api/portraits/men/85.jpg',  color: '#9900cc' },
  { name: 'Andre L.',  role: 'Diagnostics Spec.',  img: 'https://randomuser.me/api/portraits/men/67.jpg',  color: '#0066cc' },
  { name: 'Priya W.',  role: 'Shop Manager',       img: 'https://randomuser.me/api/portraits/women/23.jpg',color: '#00997a' },
  { name: 'Damien R.', role: 'Transmission Tech',  img: 'https://randomuser.me/api/portraits/men/54.jpg',  color: '#bb6600' },
];

const TESTIMONIALS = [
  { name: 'James T.', shop: 'T-Bone Auto Works',   text: 'Redlined1 cut our invoice time in half. Our customers love getting professional reports straight to their phones.', img: 'https://randomuser.me/api/portraits/men/41.jpg' },
  { name: 'Sandra M.', shop: 'Metro Quick Lube',   text: 'We went from paper job cards to fully digital in a week. No training needed — the whole team just picked it up.', img: 'https://randomuser.me/api/portraits/women/68.jpg' },
  { name: 'Derek O.',  shop: 'D&O Performance',    text: "The inspection tool alone pays for itself. Customers approve more work when they can see the photos themselves.", img: 'https://randomuser.me/api/portraits/men/76.jpg' },
];

const PRO_FEATURES   = ['Invoicing & Estimates', 'Digital Inspections', 'Parts Inventory', 'Appointments & Scheduling', 'SMS & Email Reminders', 'Time Tracking', 'Payment Collection', 'Reporting & Analytics'];
const PLUS_FEATURES  = ['Everything in Pro', '3,000 AI Credits / mo', 'Image Attachments', 'Priority Support', 'Multi-user Access', 'Advanced Permissions', 'Dedicated Onboarding', 'SLA Response Times'];

const INFO_ITEMS = [
  {
    icon: '🔄',
    title: 'Renewals & Cancellations',
    desc: 'No contracts, no surprises — that\'s our commitment to you. If you decide Redlined1 isn\'t the right fit, you can cancel any time directly from your account settings. Want to switch from monthly to yearly and save money? You can do that in seconds from the app.',
  },
  {
    icon: '💬',
    title: 'Dedicated Customer Support',
    desc: 'Once you sign up for any paid plan, you get full access to every feature with zero restrictions. Unlike other shop software that gates tools behind higher tiers, Redlined1 gives you everything included — and our support team is always a message away.',
  },
  {
    icon: '🛒',
    title: 'Ways to Upgrade',
    desc: 'The easiest way to upgrade is directly inside the app — go to Settings → Subscription and choose the plan that fits your shop. We accept all major credit cards. Reach out to our team if you need help selecting the right plan for your operation.',
  },
  {
    icon: '🆓',
    title: 'Free Trial Terms',
    desc: 'Redlined1 runs on a freemium model. Sign up for free, get 7 days of full Pro access, and explore every feature before you commit. After the trial, your shop continues on the free plan with core tools — or upgrade any time to unlock the full suite.',
  },
];

/* ── COMPONENT ────────────────────────────────────────────────── */

export default function LandingPage() {
  const [slide, setSlide]           = useState(0);
  const [fade, setFade]             = useState(true);
  const [billing, setBilling]       = useState<'monthly' | 'yearly'>('monthly');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function goToSlide(i: number) {
    setFade(false);
    setTimeout(() => { setSlide(i); setFade(true); }, 300);
  }

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setFade(false);
      setTimeout(() => { setSlide(s => (s + 1) % SLIDES.length); setFade(true); }, 300);
    }, 5500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const cur = SLIDES[slide];
  const proPrice   = billing === 'monthly' ? '$29.99' : '$24.99';
  const plusPrice  = billing === 'monthly' ? '$49.99' : '$41.99';

  return (
    <div style={{ fontFamily: "'Inter',-apple-system,sans-serif", background: '#07070a', color: '#fff', minHeight: '100vh' }}>

      {/* ── NAV ───────────────────────────────────────────────── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(7,7,10,0.93)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 6%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 74 }}>
        <a href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', cursor: 'pointer' }}>
          <img src={LOGO_SRC} alt="Redlined1" style={{ height: 62, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(204,0,0,0.45))' }} />
        </a>
        <div style={{ display: 'flex', gap: 36, fontSize: 14, color: '#999' }}>
          {['#features', '#pricing', '#testimonials'].map((h, i) => (
            <a key={i} href={h} style={{ color: '#999', textDecoration: 'none' }}>{['Features', 'Pricing', 'Reviews'][i]}</a>
          ))}
          <Link href="/help" style={{ color: '#999', textDecoration: 'none' }}>Help</Link>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Link href="/login"  style={{ color: '#bbb', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Login</Link>
          <Link href="/signup" style={{ background: '#cc0000', color: '#fff', padding: '9px 22px', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>Get Started</Link>
        </div>
      </nav>

      {/* ── HERO SLIDESHOW ────────────────────────────────────── */}
      <section style={{ minHeight: '90vh', background: 'linear-gradient(135deg,#07070a 0%,#1a0000 55%,#2a0000 100%)', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden', padding: '80px 6%' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '64px 64px', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1280, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>

          {/* Left */}
          <div style={{ opacity: fade ? 1 : 0, transform: fade ? 'translateY(0)' : 'translateY(18px)', transition: 'opacity 0.4s ease,transform 0.4s ease' }}>
            {/* Hero logo — only on first slide */}
            {slide === 0 && (
              <div style={{ marginBottom: 20 }}>
                <img src={LOGO_SRC} alt="Redlined1" style={{ height: 72, width: 'auto', objectFit: 'contain', mixBlendMode: 'normal' }} />
              </div>
            )}
            {cur.tag && (
              <span style={{ display: 'inline-block', background: '#cc0000', color: '#fff', padding: '4px 14px', borderRadius: 6, fontSize: 11, fontWeight: 800, marginBottom: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
                {cur.tag}
              </span>
            )}
            <span style={{ display: cur.tag ? 'none' : 'inline-block', background: 'rgba(204,0,0,0.16)', border: '1px solid rgba(204,0,0,0.32)', color: '#ff7070', padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 22, letterSpacing: 0.5 }}>{cur.badge}</span>
            {cur.tag && <div style={{ marginBottom: 14 }}><span style={{ background: 'rgba(204,0,0,0.16)', border: '1px solid rgba(204,0,0,0.32)', color: '#ff7070', padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>{cur.badge}</span></div>}
            <h1 style={{ fontSize: 'clamp(30px,3.8vw,54px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 22, letterSpacing: '-1px' }}>{cur.headline}</h1>
            <p style={{ fontSize: 17, color: '#bbb', lineHeight: 1.7, marginBottom: 38, maxWidth: 500 }}>{cur.sub}</p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Link href="/signup" style={{ background: '#cc0000', color: '#fff', padding: '14px 30px', borderRadius: 10, textDecoration: 'none', fontSize: 15, fontWeight: 700 }}>{cur.cta} →</Link>
              <a href="#features"  style={{ border: '1px solid rgba(255,255,255,0.18)', color: '#ccc', padding: '14px 30px', borderRadius: 10, textDecoration: 'none', fontSize: 15 }}>See Features</a>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 38 }}>
              {SLIDES.map((_, i) => (
                <button key={i} onClick={() => goToSlide(i)} style={{ width: i === slide ? 30 : 8, height: 8, borderRadius: 4, border: 'none', cursor: 'pointer', background: i === slide ? '#cc0000' : 'rgba(255,255,255,0.2)', transition: 'all 0.35s ease', padding: 0 }} />
              ))}
            </div>
          </div>

          {/* Right — tech photo grid */}
          <div style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.4s ease', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
              {TECHS.map((t, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}44`, borderRadius: 14, overflow: 'hidden', textAlign: 'center', padding: '16px 10px 14px' }}>
                  <div style={{ width: 70, height: 70, borderRadius: '50%', border: `2.5px solid ${t.color}`, overflow: 'hidden', margin: '0 auto 10px', boxShadow: `0 0 18px ${t.color}55` }}>
                    <img src={t.img} alt={t.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: '#777', marginTop: 3 }}>{t.role}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                    <span style={{ fontSize: 10, color: '#22c55e' }}>Active</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {[['4,000+','Shops Active'],['1.2M+','Invoices Sent'],['50+','Countries']].map(([v,l],i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#cc0000' }}>{v}</div>
                  <div style={{ fontSize: 10, color: '#777', marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────── */}
      <section id="features" style={{ padding: '110px 6%', background: '#0b0b0e' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{ color: '#cc0000', fontWeight: 700, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase' }}>Everything You Need</span>
            <h2 style={{ fontSize: 'clamp(26px,3.2vw,42px)', fontWeight: 900, marginTop: 14, letterSpacing: '-0.5px' }}>Auto Repair Software Features</h2>
            <p style={{ color: '#777', fontSize: 15, marginTop: 14, maxWidth: 520, margin: '14px auto 0' }}>One platform to run your entire shop — no patchwork of tools, no hidden fees.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 18 }}>
            {FEATURES.map((f, i) => (
              <div key={i}
                style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '32px 26px', transition: 'border-color 0.2s,transform 0.2s', cursor: 'default' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(204,0,0,0.45)'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                <div style={{ fontSize: 40, marginBottom: 18 }}>{f.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{f.title}</h3>
                <p style={{ color: '#777', fontSize: 14, lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MOBILE MECHANIC ───────────────────────────────────── */}
      <section style={{ padding: '110px 6%', background: 'linear-gradient(160deg,#0a0000 0%,#1a0000 40%,#0a0000 100%)', position: 'relative', overflow: 'hidden' }}>
        {/* Background accent */}
        <div style={{ position: 'absolute', top: -120, right: -120, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle,rgba(204,0,0,0.12) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{ display: 'inline-block', background: '#cc0000', color: '#fff', padding: '5px 16px', borderRadius: 6, fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 18 }}>Mobile Mechanic</span>
            <h2 style={{ fontSize: 'clamp(26px,3.2vw,44px)', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.5px' }}>Your Entire Business Runs<br /><span style={{ color: '#cc0000' }}>From Your Phone</span></h2>
            <p style={{ color: '#888', fontSize: 16, marginTop: 18, maxWidth: 580, margin: '18px auto 0', lineHeight: 1.7 }}>
              No office? No problem. Redlined1 is built for mobile mechanics who work in driveways, parking lots, and roadsides. Everything you need is in your pocket.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 18, marginBottom: 60 }}>
            {MOBILE_FEATURES.map((f, i) => (
              <div key={i}
                style={{ background: 'rgba(204,0,0,0.06)', border: '1px solid rgba(204,0,0,0.2)', borderRadius: 16, padding: '28px 24px', transition: 'border-color 0.2s,background 0.2s', cursor: 'default' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(204,0,0,0.55)'; e.currentTarget.style.background = 'rgba(204,0,0,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(204,0,0,0.2)'; e.currentTarget.style.background = 'rgba(204,0,0,0.06)'; }}>
                <div style={{ fontSize: 38, marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{f.title}</h3>
                <p style={{ color: '#888', fontSize: 14, lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Mobile highlight banner */}
          <div style={{ background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.3)', borderRadius: 18, padding: '36px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
            <div>
              <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Ready to go mobile?</h3>
              <p style={{ color: '#aaa', fontSize: 15, maxWidth: 500 }}>Join hundreds of independent mobile mechanics already using Redlined1 to run a professional, paperless business from the road.</p>
            </div>
            <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
              <Link href="/signup" style={{ background: '#cc0000', color: '#fff', padding: '13px 28px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>Start Free Trial →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: '110px 6%', background: '#07070a' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 50 }}>
            <span style={{ color: '#cc0000', fontWeight: 700, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase' }}>Pricing</span>
            <h2 style={{ fontSize: 'clamp(26px,3.2vw,42px)', fontWeight: 900, marginTop: 14 }}>Get the Right Plan for Your Shop</h2>
            <p style={{ color: '#777', fontSize: 15, marginTop: 12 }}>Simple and Transparent — No Hidden Fees &amp; No Contract Required</p>

            {/* Monthly / Yearly toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginTop: 30, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 50, width: 'fit-content', margin: '30px auto 0', padding: 4 }}>
              {(['monthly','yearly'] as const).map(b => (
                <button key={b} onClick={() => setBilling(b)} style={{ padding: '9px 28px', borderRadius: 50, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: billing === b ? '#cc0000' : 'transparent', color: billing === b ? '#fff' : '#888', transition: 'all 0.2s' }}>
                  {b === 'monthly' ? 'Monthly' : 'Yearly'}
                </button>
              ))}
            </div>
            {billing === 'yearly' && (
              <p style={{ color: '#22c55e', fontSize: 13, marginTop: 12, fontWeight: 600 }}>Save up to $119 with annual pricing</p>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
            {/* Free */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ background: 'rgba(255,255,255,0.08)', padding: '20px 28px', textAlign: 'center' }}>
                <h3 style={{ fontWeight: 800, fontSize: 20 }}>Free</h3>
              </div>
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <span style={{ fontSize: 42, fontWeight: 900, color: '#aaa' }}>$0</span>
                  <span style={{ color: '#555', fontSize: 14, marginLeft: 4 }}>/ forever</span>
                </div>
                {['Up to 10 customers','Basic invoices & estimates','Vehicle history','Job cards','Email support'].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 14, color: '#aaa' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>✓</div>
                    {f}
                  </div>
                ))}
                <Link href="/signup" style={{ display: 'block', textAlign: 'center', marginTop: 28, background: 'rgba(255,255,255,0.08)', color: '#ccc', padding: '14px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 15, border: '1px solid rgba(255,255,255,0.12)' }}>Get Started Free</Link>
                <p style={{ color: '#444', fontSize: 12, lineHeight: 1.6, marginTop: 16, textAlign: 'center' }}>Start for free with core features. Upgrade anytime to unlock the full suite — no credit card required to sign up.</p>
              </div>
            </div>

            {/* Pro */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(204,0,0,0.35)', borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ background: '#cc0000', padding: '20px 28px', textAlign: 'center' }}>
                <h3 style={{ fontWeight: 800, fontSize: 20 }}>Redlined1 Pro</h3>
              </div>
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <span style={{ fontSize: 42, fontWeight: 900, color: '#ff6b6b' }}>{proPrice}</span>
                  <span style={{ color: '#666', fontSize: 14, marginLeft: 4 }}>/ {billing === 'monthly' ? 'Monthly' : 'Yearly'}</span>
                </div>
                {PRO_FEATURES.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 14, color: '#ccc' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: '#cc0000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>✓</div>
                    {f}
                  </div>
                ))}
                <Link href="/signup" style={{ display: 'block', textAlign: 'center', marginTop: 28, background: '#cc0000', color: '#fff', padding: '14px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>Buy Now</Link>
                <p style={{ color: '#555', fontSize: 12, lineHeight: 1.6, marginTop: 16, textAlign: 'center' }}>Redlined1 Pro gives you unlimited access to all core tools. Share your account with your team and assign roles with custom permissions.</p>
              </div>
            </div>

            {/* Pro Plus */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '2px solid #cc0000', borderRadius: 18, overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 14, right: -28, background: '#cc0000', color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 36px', transform: 'rotate(45deg)', letterSpacing: 1 }}>BEST DEAL</div>
              <div style={{ background: 'linear-gradient(135deg,#cc0000,#880000)', padding: '20px 28px', textAlign: 'center' }}>
                <h3 style={{ fontWeight: 800, fontSize: 20 }}>Redlined1 Pro Plus</h3>
              </div>
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <span style={{ fontSize: 42, fontWeight: 900, color: '#ff6b6b' }}>{plusPrice}</span>
                  <span style={{ color: '#666', fontSize: 14, marginLeft: 4 }}>/ {billing === 'monthly' ? 'Monthly' : 'Yearly'}</span>
                </div>
                {PLUS_FEATURES.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 14, color: '#ccc' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: '#cc0000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>✓</div>
                    {f}
                  </div>
                ))}
                <Link href="/signup" style={{ display: 'block', textAlign: 'center', marginTop: 28, background: '#cc0000', color: '#fff', padding: '14px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>Buy Now</Link>
                <p style={{ color: '#555', fontSize: 12, lineHeight: 1.6, marginTop: 16, textAlign: 'center' }}>Pro Plus is built for high-volume shops and multi-bay operations. Includes AI credits, unlimited client engagement tools, image attachments, and dedicated priority support.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── INFO SECTION ──────────────────────────────────────── */}
      <section style={{ padding: '110px 6%', background: '#0b0b0e' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
          {/* Left: info items */}
          <div>
            <span style={{ color: '#cc0000', fontWeight: 700, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase' }}>Good to Know</span>
            <h2 style={{ fontSize: 'clamp(24px,2.8vw,38px)', fontWeight: 900, marginTop: 14, lineHeight: 1.2, marginBottom: 36 }}>Everything You Need Before You Buy</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {INFO_ITEMS.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{item.icon}</div>
                  <div>
                    <h4 style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{item.title}</h4>
                    <p style={{ color: '#777', fontSize: 13, lineHeight: 1.7 }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 40 }}>
              <Link href="/signup" style={{ background: '#cc0000', color: '#fff', padding: '13px 28px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>Get Started</Link>
              <a href="#pricing" style={{ border: '1px solid rgba(255,255,255,0.15)', color: '#ccc', padding: '13px 28px', borderRadius: 10, textDecoration: 'none', fontSize: 14 }}>Try a Free Demo →</a>
            </div>
          </div>

          {/* Right: large mechanic photo card */}
          <div style={{ position: 'relative' }}>
            <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(204,0,0,0.3)', aspectRatio: '4/5', background: '#111' }}>
              <img
                src="https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=700&q=80"
                alt="Professional mechanic"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={e => { (e.target as HTMLImageElement).src = 'https://randomuser.me/api/portraits/men/32.jpg'; }}
              />
            </div>
            {/* Floating badge */}
            <div style={{ position: 'absolute', bottom: 28, left: -24, background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)', border: '1px solid rgba(204,0,0,0.35)', borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 28 }}>⚡</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>Up & Running Today</div>
                <div style={{ color: '#777', fontSize: 12, marginTop: 2 }}>No setup fees. No training required.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ──────────────────────────────────────── */}
      <section id="testimonials" style={{ padding: '110px 6%', background: '#07070a' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <span style={{ color: '#cc0000', fontWeight: 700, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase' }}>Reviews</span>
            <h2 style={{ fontSize: 'clamp(24px,3vw,40px)', fontWeight: 900, marginTop: 14 }}>Trusted by Shop Owners Everywhere</h2>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 12 }}>
              {'★★★★★'.split('').map((s, i) => <span key={i} style={{ color: '#f59e0b', fontSize: 20 }}>{s}</span>)}
              <span style={{ color: '#666', fontSize: 13, marginLeft: 8, alignSelf: 'center' }}>4.8 out of 5 — 2,500+ reviews</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 20 }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '28px 24px' }}>
                <div style={{ display: 'flex', gap: 3, marginBottom: 16 }}>
                  {'★★★★★'.split('').map((s, j) => <span key={j} style={{ color: '#f59e0b', fontSize: 14 }}>{s}</span>)}
                </div>
                <p style={{ color: '#ccc', fontSize: 14, lineHeight: 1.7, marginBottom: 22 }}>"{t.text}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', border: '2px solid #cc0000', overflow: 'hidden', flexShrink: 0 }}>
                    <img src={t.img} alt={t.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                    <div style={{ color: '#666', fontSize: 12 }}>{t.shop}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ────────────────────────────────────────── */}
      <section style={{ padding: '90px 6%', background: 'linear-gradient(135deg,#1a0000 0%,#cc0000 50%,#1a0000 100%)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(24px,4vw,44px)', fontWeight: 900, marginBottom: 16 }}>Ready to Redline Your Shop?</h2>
        <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 16, marginBottom: 34 }}>Join thousands of shops running smarter with Redlined1. No credit card required.</p>
        <Link href="/signup" style={{ background: '#fff', color: '#cc0000', padding: '16px 40px', borderRadius: 10, textDecoration: 'none', fontWeight: 800, fontSize: 16, display: 'inline-block' }}>Start Your Free 7-Day Trial →</Link>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer style={{ background: '#040406', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '40px 6%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={LOGO_SRC} alt="Redlined1" style={{ height: 36, width: 'auto', objectFit: 'contain', mixBlendMode: 'normal' }} />
        </div>
        <div style={{ color: '#444', fontSize: 13 }}>© 2026 Redlined1. All rights reserved.</div>
        <div style={{ display: 'flex', gap: 22, fontSize: 13 }}>
          <a href="#" style={{ color: '#555', textDecoration: 'none' }}>Privacy</a>
          <a href="#" style={{ color: '#555', textDecoration: 'none' }}>Terms</a>
          <Link href="/help" style={{ color: '#555', textDecoration: 'none' }}>Help</Link>
          <Link href="/login" style={{ color: '#555', textDecoration: 'none' }}>Login</Link>
        </div>
      </footer>
    </div>
  );
}
