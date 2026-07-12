'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LOGO_SRC } from '@/lib/logo';
import { ChatWidget } from '@/components/ChatWidget';

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
  { img: '/invoices-estimates.png', title: 'Invoices & Estimates', desc: 'Professional invoices and estimates in seconds. Send via email or SMS and collect payment online.' },
  { img: 'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=80&h=80&fit=crop&q=85', title: 'Digital Inspections', desc: 'Photo-based vehicle inspection reports build customer trust and increase job approvals.' },
  { img: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=80&h=80&fit=crop&q=85', title: 'Appointments & Maintenance Schedules', desc: 'Book appointments, check in customers, and track recurring service intervals for fleet and repeat clients.' },
  { img: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=80&h=80&fit=crop&q=85', title: 'Customer Management', desc: 'Full CRM with customer history, vehicles, notes, and communication in one place.' },
  { img: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=80&h=80&fit=crop&q=85', title: 'Vehicle History', desc: 'Complete service history per vehicle. Never lose track of past repairs or upcoming maintenance.' },
  { img: 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=80&h=80&fit=crop&q=85', title: 'Parts & Inventory', desc: 'Track parts inventory, set reorder points, and attach parts directly to job cards.' },
  { img: 'https://images.unsplash.com/photo-1621905252472-943afaa20e20?w=80&h=80&fit=crop&q=85', title: 'Technician Management', desc: 'Assign techs to jobs, track hours, and measure individual productivity at a glance.' },
  { img: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=80&h=80&fit=crop&q=85', title: 'Payments', desc: 'Accept payments online, track outstanding balances, and reconcile accounts with ease.' },
  { img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=80&h=80&fit=crop&q=85', title: 'Reports & Analytics', desc: 'Revenue, job profitability, and tech performance — every number you need to grow your shop.' },
];

const AI_FEATURES = [
  {
    img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=80&h=80&fit=crop&q=85',
    title: 'Knowledge Graph',
    desc: 'Every repair you close automatically maps to a live knowledge graph — nodes, edges, lessons, and observations — that grows smarter with every job.',
    stat: 'Auto-maps on case creation',
  },
  {
    img: 'https://images.unsplash.com/photo-1580757468214-c73f7062a5cb?w=80&h=80&fit=crop&q=85',
    title: 'Evidence Engine',
    desc: '12 weighted evidence types (DTCs, oscilloscope traces, pressure tests, verified outcomes) scored in real time. Every recommendation is traceable to evidence.',
    stat: '12 evidence categories',
  },
  {
    img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=80&h=80&fit=crop&q=85',
    title: 'Confidence Scoring',
    desc: 'Explainable 0–98% confidence scores with a full breakdown per factor — so your techs know exactly why the system is certain or uncertain.',
    stat: 'Explainable, never a black box',
  },
  {
    img: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=80&h=80&fit=crop&q=85',
    title: 'Similar Repair Matching',
    desc: 'Instantly surfaces the most similar verified repairs from your shop\'s history — same make, model, engine, symptoms, and fault codes.',
    stat: 'Ranked by similarity score',
  },
  {
    img: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=80&h=80&fit=crop&q=85',
    title: 'Comeback Risk Detection',
    desc: 'Flags High / Medium / Low comeback risk before the customer leaves. Based on verified history across similar cases — not guesswork.',
    stat: 'Comeback penalty built in',
  },
  {
    img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&q=85',
    title: 'Technician Lessons',
    desc: 'Structured lessons (What fooled us? What fixed it? Check first next time?) captured per case and surfaced on the next similar job.',
    stat: 'Institutional knowledge preserved',
  },
];

const COMPETITOR_WINS = [
  { feature: 'Repair Knowledge Graph', us: true,  them: false },
  { feature: 'Evidence-Backed Recommendations', us: true,  them: false },
  { feature: 'Explainable Confidence Scores', us: true,  them: false },
  { feature: 'Similar Repair Matching', us: true,  them: false },
  { feature: 'Comeback Risk Prediction', us: true,  them: false },
  { feature: 'Technician Lesson Capture', us: true,  them: false },
  { feature: 'Verified Repair Workflow', us: true,  them: true  },
  { feature: 'DTC Lookup', us: true,  them: true  },
  { feature: 'Invoicing & Estimates', us: true,  them: true  },
];

const MOBILE_FEATURES = [
  { img: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=80&h=80&fit=crop&q=85', title: 'Phone-First Workflow', desc: 'Create job cards, capture photos, and send invoices entirely from your smartphone — no laptop, no office, no problem.' },
  { img: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=80&h=80&fit=crop&q=85', title: 'On-Site Invoicing', desc: 'Generate and send a professional invoice the moment you finish the job. Get paid on the spot via card or digital wallet.' },
  { img: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=80&h=80&fit=crop&q=85', title: 'Job Location Tracking', desc: 'Log service addresses per job card. Know exactly where each vehicle was serviced and track your territory coverage.' },
  { img: 'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=80&h=80&fit=crop&q=85', title: 'Photo Inspections On the Go', desc: 'Snap inspection photos on-site, attach them to the job, and send the customer a branded report before you leave their driveway.' },
  { img: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=80&h=80&fit=crop&q=85', title: 'SMS & Email from the Field', desc: 'Send estimates, invoices, and follow-ups via SMS or email directly from the app — no copy-pasting, no separate tools.' },
  { img: 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=80&h=80&fit=crop&q=85', title: 'Mobile Parts Lookup', desc: 'Search your parts inventory and add items to a job card while you\'re under the hood. Reorder low-stock parts on the spot.' },
];

const TECHS = [
  { name: 'Marcus J.', role: 'Master Technician', img: '/marcus-j.png',  color: '#cc0000' },
  { name: 'Tina S.',   role: 'Service Advisor',   img: '/tina-s.png',    color: '#e05500' },
  { name: 'Rico K.',   role: 'Lead Mechanic',      img: '/rico-k.png',    color: '#9900cc' },
  { name: 'Andre L.',  role: 'Diagnostics Spec.',  img: '/andre-l.png',   color: '#0066cc' },
  { name: 'Priya W.',  role: 'Shop Manager',       img: '/priya-w.png',   color: '#00997a' },
  { name: 'Damien R.', role: 'Transmission Tech',  img: '/damien-r.png',  color: '#bb6600' },
];

const MOBILE_TECH = {
  name: 'Carlos M.',
  role: 'Mobile Mechanic Specialist',
  vanImg: '/carlos-m-mobile-mechanic.png',
  personImg: '/carlos-m-mobile-mechanic.png',
};

const PRO_FEATURES   = ['Invoicing & Estimates', 'Digital Inspections', 'Parts Inventory', 'Appointments & Maintenance Schedules', 'SMS & Email Reminders', 'Time Tracking', 'Payment Collection', 'Reporting & Analytics'];
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

const MEGA_FEATURES = [
  { icon: '👤', title: 'Customer Management', desc: 'Full CRM — history, vehicles, notes & communication', module: 'customers' },
  { icon: '🚗', title: 'Vehicle Management',  desc: 'Complete vehicle records and full service history',    module: 'vehicles' },
  { icon: '📋', title: 'Job Cards',           desc: 'Create & manage repair job cards with live status',     module: 'job-cards' },
  { icon: '📄', title: 'Estimates',           desc: 'Professional quotes sent via email or SMS instantly',   module: 'estimates' },
  { icon: '🧾', title: 'Invoicing',           desc: 'Generate invoices and collect online payment fast',     module: 'invoices' },
  { icon: '🔍', title: 'Digital Inspections', desc: 'Photo-based reports customers view and approve online', module: 'inspections' },
  { icon: '🧰', title: 'Parts & Inventory',   desc: 'Track parts, set reorder alerts, link to jobs',        module: 'parts' },
  { icon: '🔧', title: 'Repair Orders',       desc: 'Full RO management from intake to final delivery',      module: 'repair-orders' },
  { icon: '📅', title: 'Maintenance Schedules', desc: 'Recurring service intervals, fleet due-soon alerts',    module: 'scheduling' },
  { icon: '💳', title: 'Payments',            desc: 'Accept, record & reconcile payments with ease',         module: 'payments' },
  { icon: '👷', title: 'Tech Workflow',        desc: 'Assign techs, log hours, and track productivity',       module: 'technicians' },
  { icon: '📊', title: 'Reports & Analytics', desc: 'Revenue, job profitability, and performance insights',  module: 'reports' },
  { icon: '🤖', title: 'AI Copilot',          desc: '3,000 AI credits for estimates, diagnostics & more',    module: 'ai' },
  { icon: '🔡', title: 'VIN Decode',          desc: 'Instantly populate vehicle details from any VIN',       module: 'vin' },
  { icon: '⚠️', title: 'DTC / Diagnostics',   desc: 'Look up fault codes and run OBD scan diagnostics',     module: 'dtc' },
  { icon: '📱', title: 'Mobile Mechanic',      desc: 'Invoice, inspect, and get paid straight from the field', module: 'mobile' },
];

const INTEGRATIONS = [
  {
    category: 'Payments & Finance',
    color: '#22c55e',
    icon: '💳',
    items: [
      { logo: '🟦', name: 'Stripe',      desc: 'Accept cards, Apple Pay & ACH online',   module: 'payments',  status: 'active' },
      { logo: '⬛', name: 'Square',      desc: 'In-person & mobile card payments',        module: 'payments',  status: 'active' },
      { logo: '🅿️', name: 'PayPal',      desc: 'Invoice pay via PayPal & Venmo',          module: 'payments',  status: 'coming' },
      { logo: '📒', name: 'QuickBooks',  desc: 'Sync invoices & expenses automatically',  module: 'reports',   status: 'coming' },
    ],
  },
  {
    category: 'Parts & Suppliers',
    color: '#f59e0b',
    icon: '🧰',
    items: [
      { logo: '🔴', name: 'AutoZone Pro', desc: 'Order parts & check inventory live',     module: 'parts',     status: 'active' },
      { logo: '🟢', name: "O'Reilly Auto", desc: 'Real-time pricing & part lookup',       module: 'parts',     status: 'active' },
      { logo: '🔵', name: 'NAPA Auto',    desc: 'Commercial account ordering & pricing',  module: 'parts',     status: 'coming' },
      { logo: '⚙️', name: 'RockAuto',    desc: 'Catalog search & part number lookup',     module: 'parts',     status: 'coming' },
    ],
  },
  {
    category: 'Communication',
    color: '#818cf8',
    icon: '💬',
    items: [
      { logo: '📱', name: 'Twilio SMS',   desc: 'Send job updates & reminders via SMS',   module: 'communication', status: 'active' },
      { logo: '📧', name: 'SendGrid',     desc: 'Branded email for invoices & estimates', module: 'communication', status: 'active' },
      { logo: '🟩', name: 'WhatsApp',     desc: 'Customer updates over WhatsApp',         module: 'communication', status: 'coming' },
      { logo: '📣', name: 'Google Reviews', desc: 'Auto-request reviews after service',   module: 'communication', status: 'coming' },
    ],
  },
  {
    category: 'Vehicle & Diagnostics',
    color: '#cc0000',
    icon: '🚗',
    items: [
      { logo: '🦊', name: 'CARFAX',       desc: 'Pull vehicle history reports instantly', module: 'vehicles',  status: 'active' },
      { logo: '🔡', name: 'VIN Solutions', desc: 'Decode any VIN & auto-fill details',    module: 'vin',       status: 'active' },
      { logo: '🔧', name: 'AllData',       desc: 'OEM repair data & labor times',          module: 'dtc',       status: 'coming' },
      { logo: '📡', name: 'OBD Connect',   desc: 'Live OBD-II scanner integration',        module: 'diagnostics', status: 'coming' },
    ],
  },
];

/* ── COMPONENT ────────────────────────────────────────────────── */

export default function LandingPage() {
  const [slide, setSlide]           = useState(0);
  const [fade, setFade]             = useState(true);
  const [billing, setBilling]       = useState<'monthly' | 'yearly'>('monthly');
  const [featuresOpen, setFeaturesOpen]         = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen]       = useState(false);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const featuresRef      = useRef<HTMLDivElement>(null);
  const integrationsRef  = useRef<HTMLDivElement>(null);
  const resourcesRef     = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (featuresRef.current && !featuresRef.current.contains(e.target as Node)) setFeaturesOpen(false);
      if (integrationsRef.current && !integrationsRef.current.contains(e.target as Node)) setIntegrationsOpen(false);
      if (resourcesRef.current && !resourcesRef.current.contains(e.target as Node)) setResourcesOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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
        <div style={{ display: 'flex', gap: 36, fontSize: 14, color: '#999', alignItems: 'center', position: 'relative' }}>
          {/* Features dropdown trigger */}
          <div ref={featuresRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { setFeaturesOpen(o => !o); setIntegrationsOpen(false); setResourcesOpen(false); }}
              style={{ background: 'none', border: 'none', color: featuresOpen ? '#fff' : '#999', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 5, padding: 0, fontFamily: 'inherit' }}
            >
              Features
              <span style={{ fontSize: 10, transition: 'transform 0.2s', display: 'inline-block', transform: featuresOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
            </button>

            {/* Mega-menu */}
            {featuresOpen && (
              <div style={{
                position: 'fixed', top: 74, left: 0, right: 0,
                background: 'rgba(8,6,10,0.97)', backdropFilter: 'blur(20px)',
                borderBottom: '1px solid rgba(204,0,0,0.25)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
                padding: '36px 6%', zIndex: 200,
                animation: 'megaDrop 0.22s ease',
              }}>
                <style>{`@keyframes megaDrop { from { opacity:0; transform:translateY(-10px) } to { opacity:1; transform:translateY(0) } }`}</style>
                <div style={{ maxWidth: 1280, margin: '0 auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#cc0000', letterSpacing: 2, textTransform: 'uppercase' }}>Platform Features</div>
                      <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>Everything your shop needs — all in one place</div>
                    </div>
                    <Link href="/signup" onClick={() => setFeaturesOpen(false)} style={{ background: '#cc0000', color: '#fff', padding: '9px 20px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>Start Free Trial →</Link>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                    {MEGA_FEATURES.map((f, i) => (
                      <Link
                        key={i}
                        href={`/signup?feature=${f.module}`}
                        onClick={() => setFeaturesOpen(false)}
                        style={{ textDecoration: 'none', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 12, border: '1px solid transparent', transition: 'all 0.18s', background: 'transparent' }}
                        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(204,0,0,0.08)'; el.style.borderColor = 'rgba(204,0,0,0.3)'; el.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.borderColor = 'transparent'; el.style.transform = 'translateY(0)'; }}
                      >
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{f.icon}</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 3 }}>{f.title}</div>
                          <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>{f.desc}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Integrations dropdown */}
          <div ref={integrationsRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { setIntegrationsOpen(o => !o); setFeaturesOpen(false); setResourcesOpen(false); }}
              style={{ background: 'none', border: 'none', color: integrationsOpen ? '#fff' : '#999', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 5, padding: 0, fontFamily: 'inherit' }}
            >
              Integrations
              <span style={{ fontSize: 10, transition: 'transform 0.2s', display: 'inline-block', transform: integrationsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
            </button>

            {integrationsOpen && (
              <div style={{
                position: 'fixed', top: 74, left: 0, right: 0,
                background: 'rgba(8,6,10,0.97)', backdropFilter: 'blur(20px)',
                borderBottom: '1px solid rgba(204,0,0,0.25)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
                padding: '36px 6%', zIndex: 200,
                animation: 'megaDrop 0.22s ease',
              }}>
                <div style={{ maxWidth: 1280, margin: '0 auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#cc0000', letterSpacing: 2, textTransform: 'uppercase' }}>Integrations</div>
                      <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>Connect the tools your shop already uses</div>
                    </div>
                    <Link href="/signup" onClick={() => setIntegrationsOpen(false)} style={{ background: '#cc0000', color: '#fff', padding: '9px 20px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>Start Free Trial →</Link>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24 }}>
                    {INTEGRATIONS.map((cat, ci) => (
                      <div key={ci}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${cat.color}33` }}>
                          <span style={{ fontSize: 15 }}>{cat.icon}</span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: cat.color, letterSpacing: 1, textTransform: 'uppercase' }}>{cat.category}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {cat.items.map((item, ii) => (
                            <Link
                              key={ii}
                              href={`/signup?integration=${item.name.toLowerCase().replace(/\s+/g,'-')}`}
                              onClick={() => setIntegrationsOpen(false)}
                              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid transparent', transition: 'all 0.18s' }}
                              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = `rgba(204,0,0,0.08)`; el.style.borderColor = `rgba(204,0,0,0.25)`; el.style.transform = 'translateX(4px)'; }}
                              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.borderColor = 'transparent'; el.style.transform = 'translateX(0)'; }}
                            >
                              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{item.logo}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{item.name}</span>
                                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: item.status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.07)', color: item.status === 'active' ? '#22c55e' : '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    {item.status === 'active' ? 'Live' : 'Soon'}
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: '#666', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.desc}</div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <a href="#pricing" style={{ color: '#999', textDecoration: 'none' }}>Pricing</a>

          {/* Resources dropdown */}
          <div ref={resourcesRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { setResourcesOpen(o => !o); setFeaturesOpen(false); setIntegrationsOpen(false); }}
              style={{ background: 'none', border: 'none', color: resourcesOpen ? '#fff' : '#999', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 5, padding: 0, fontFamily: 'inherit' }}
            >
              Resources
              <span style={{ fontSize: 10, transition: 'transform 0.2s', display: 'inline-block', transform: resourcesOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
            </button>

            {resourcesOpen && (
              <div style={{
                position: 'fixed', top: 74, left: 0, right: 0,
                background: 'rgba(8,6,10,0.97)', backdropFilter: 'blur(20px)',
                borderBottom: '1px solid rgba(204,0,0,0.25)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
                padding: '36px 6%', zIndex: 200,
                animation: 'megaDrop 0.22s ease',
              }}>
                <div style={{ maxWidth: 1280, margin: '0 auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#cc0000', letterSpacing: 2, textTransform: 'uppercase' }}>Resources</div>
                      <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>Everything you need to get up and running</div>
                    </div>
                    <Link href="/signup" onClick={() => setResourcesOpen(false)} style={{ background: '#cc0000', color: '#fff', padding: '9px 20px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>Get Started →</Link>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 40 }}>
                    {/* Left: Platforms */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#cc0000', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(204,0,0,0.2)' }}>Platforms</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {[
                          { icon: '🌐', label: 'Web (any Browser)', href: '/signup' },
                          { icon: '🤖', label: 'Android (Google Play)', href: '/signup?platform=android' },
                          { icon: '🍎', label: 'iOS (Apple Store)', href: '/signup?platform=ios' },
                          { icon: '🖥️', label: 'Windows Desktop', href: '/signup?platform=windows' },
                        ].map((p, i) => (
                          <Link key={i} href={p.href} onClick={() => setResourcesOpen(false)}
                            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid transparent', transition: 'all 0.18s' }}
                            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(204,0,0,0.08)'; el.style.borderColor = 'rgba(204,0,0,0.25)'; el.style.transform = 'translateX(4px)'; }}
                            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.borderColor = 'transparent'; el.style.transform = 'translateX(0)'; }}
                          >
                            <span style={{ fontSize: 18 }}>{p.icon}</span>
                            <span style={{ fontSize: 13, color: '#ccc', fontWeight: 600 }}>{p.label}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                    {/* Right: Help & Learning */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                      {[
                        { icon: '🚀', title: 'Get Started', desc: 'A complete guide to setting up and running your auto repair business', href: '/help' },
                        { icon: '⚙️', title: 'Profile Setup', desc: 'Settings and configurations tailored for auto repair services', href: '/signup' },
                        { icon: '🎮', title: 'Live Demo', desc: 'Test the features and see if Redlined1 is the right fit for you', href: '/signup?demo=1' },
                        { icon: '🖥️', title: 'Client Portal', desc: "Let clients easily stay informed when they visit your shop", href: '/signup?feature=client-portal' },
                        { icon: '📖', title: 'Blog', desc: 'Updates, articles, and guides for shop owners', href: '/help' },
                        { icon: '🎬', title: 'Video Tutorials', desc: 'Step-by-step video walkthroughs of every feature', href: '/help' },
                        { icon: '👥', title: 'Multiple Users', desc: 'How to add technicians and staff to your account', href: '/signup?feature=users' },
                        { icon: '🏆', title: 'Case Studies', desc: 'See how real shops grow with Redlined1', href: '/help' },
                        { icon: '📄', title: 'Online Documents', desc: 'Manage estimates, invoices, and reports digitally', href: '/signup?feature=documents' },
                      ].map((r, i) => (
                        <Link key={i} href={r.href} onClick={() => setResourcesOpen(false)}
                          style={{ textDecoration: 'none', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 12, border: '1px solid transparent', transition: 'all 0.18s' }}
                          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(204,0,0,0.08)'; el.style.borderColor = 'rgba(204,0,0,0.3)'; el.style.transform = 'translateY(-2px)'; }}
                          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.borderColor = 'transparent'; el.style.transform = 'translateY(0)'; }}
                        >
                          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{r.icon}</div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 3 }}>{r.title}</div>
                            <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>{r.desc}</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
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
          <div style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.4s ease', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Badges row — above the grid */}
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { icon: '⚙️', label: 'All-in-one', sub: 'Shop Management' },
                { icon: '🧾', label: 'Unlimited', sub: 'Invoices & Estimates' },
                { icon: '💬', label: '24/7', sub: 'Customer Support' },
              ].map((b, i) => (
                <div key={i} style={{ flex: 1, background: 'linear-gradient(135deg, rgba(180,0,0,0.85), rgba(100,0,0,0.9))', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 12, padding: '9px 10px', display: 'flex', alignItems: 'center', gap: 8, backdropFilter: 'blur(10px)', boxShadow: '0 4px 20px rgba(204,0,0,0.3)' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{b.icon}</div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 12, color: '#fff', lineHeight: 1.2 }}>{b.label}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,200,200,0.8)', marginTop: 1 }}>{b.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {TECHS.map((t, i) => (
                <Link key={i} href="/signup" style={{ textDecoration: 'none', background: '#0d0d10', border: `1px solid ${t.color}55`, borderRadius: 14, overflow: 'hidden', position: 'relative', display: 'block', transition: 'transform 0.2s, box-shadow 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 24px ${t.color}33`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                >
                  <div style={{ aspectRatio: '3/4', overflow: 'hidden' }}>
                    <img src={t.img} alt={t.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block', filter: 'brightness(0.88) contrast(1.05)' }} />
                  </div>
                  {/* Gradient overlay */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: `linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)`, padding: '20px 10px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: 0.3 }}>{t.name}</div>
                    <div style={{ fontSize: 9, color: t.color, marginTop: 2, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t.role}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 5 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
                      <span style={{ fontSize: 9, color: '#22c55e' }}>Active</span>
                    </div>
                  </div>
                  {/* Color accent border top */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: t.color }} />
                </Link>
              ))}
            </div>

            {/* Mobile Mechanic featured card */}
            <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(204,0,0,0.5)', background: '#0d0d10' }}>
              <div style={{ height: 120, overflow: 'hidden', position: 'relative' }}>
                <img src={MOBILE_TECH.vanImg} alt="Mobile service van" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.6)' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.7) 0%, transparent 60%)' }} />
                {/* Red accent top bar */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#cc0000' }} />
                {/* Mobile badge */}
                <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(204,0,0,0.9)', borderRadius: 6, padding: '3px 10px', fontSize: 9, fontWeight: 800, letterSpacing: 1, color: '#fff', textTransform: 'uppercase' }}>📱 Mobile Mechanic</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid #cc0000', overflow: 'hidden', flexShrink: 0, boxShadow: '0 0 14px rgba(204,0,0,0.4)' }}>
                  <img src={MOBILE_TECH.personImg} alt={MOBILE_TECH.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{MOBILE_TECH.name}</div>
                  <div style={{ fontSize: 10, color: '#cc0000', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{MOBILE_TECH.role}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
                  <span style={{ fontSize: 9, color: '#22c55e' }}>Active</span>
                </div>
              </div>
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
                style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden', transition: 'border-color 0.2s,transform 0.2s', cursor: 'default' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(204,0,0,0.45)'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                <div style={{ width: '100%', height: 160, overflow: 'hidden', position: 'relative' }}>
                  <img src={f.img} alt={f.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, background: 'linear-gradient(to bottom, transparent, rgba(10,8,12,0.85))' }} />
                </div>
                <div style={{ padding: '22px 26px 28px' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{f.title}</h3>
                  <p style={{ color: '#777', fontSize: 14, lineHeight: 1.65 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── REPAIR INTELLIGENCE / AI ──────────────────────────── */}
      <section id="repair-intelligence" style={{ padding: '120px 6%', background: '#07070a', position: 'relative', overflow: 'hidden' }}>
        {/* Subtle grid bg */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(204,0,0,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(204,0,0,0.03) 1px,transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />
        {/* Glow orb */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 900, height: 900, borderRadius: '50%', background: 'radial-gradient(circle,rgba(204,0,0,0.07) 0%,transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 1 }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 80 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.35)', color: '#ff6060', padding: '6px 18px', borderRadius: 30, fontSize: 12, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 22 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#cc0000', display: 'inline-block', boxShadow: '0 0 8px #cc0000' }} />
              Repair Intelligence — Only on Redlined1
            </span>
            <h2 style={{ fontSize: 'clamp(28px,3.8vw,52px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-1px', marginBottom: 22 }}>
              The Only Shop Software<br />
              <span style={{ color: '#cc0000' }}>That Gets Smarter Every Repair</span>
            </h2>
            <p style={{ color: '#888', fontSize: 17, lineHeight: 1.75, maxWidth: 620, margin: '0 auto' }}>
              While other platforms just store your data, Redlined1 builds a living knowledge graph from every job closed — surfacing verified evidence, ranked recommendations, and comeback risk before the customer drives away.
            </p>
          </div>

          {/* 6 AI feature cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 20, marginBottom: 80 }}>
            {AI_FEATURES.map((f, i) => (
              <div key={i}
                style={{ background: 'rgba(204,0,0,0.05)', border: '1px solid rgba(204,0,0,0.18)', borderRadius: 18, padding: '32px 28px', transition: 'all 0.22s', cursor: 'default', position: 'relative', overflow: 'hidden' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(204,0,0,0.55)'; e.currentTarget.style.background = 'rgba(204,0,0,0.09)'; e.currentTarget.style.transform = 'translateY(-4px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(204,0,0,0.18)'; e.currentTarget.style.background = 'rgba(204,0,0,0.05)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: 'radial-gradient(circle at top right,rgba(204,0,0,0.12),transparent 70%)', pointerEvents: 'none' }} />
                <img src={f.img} alt={f.title} style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover', marginBottom: 18, border: '1px solid rgba(204,0,0,0.25)', boxShadow: '0 6px 24px rgba(0,0,0,0.5)' }} />
                <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 10, color: '#fff' }}>{f.title}</h3>
                <p style={{ color: '#888', fontSize: 14, lineHeight: 1.7, marginBottom: 18 }}>{f.desc}</p>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(204,0,0,0.15)', border: '1px solid rgba(204,0,0,0.3)', borderRadius: 20, padding: '4px 12px' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#cc0000', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#ff8080', fontWeight: 700 }}>{f.stat}</span>
                </div>
              </div>
            ))}
          </div>

          {/* How it works — pipeline strip */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '44px 48px', marginBottom: 80 }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>How Repair Intelligence Works</h3>
              <p style={{ color: '#666', fontSize: 14 }}>Every closed repair case feeds the engine automatically — no setup, no tagging, no extra steps.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
              {[
                { icon: '🔧', label: 'Repair Case Closed', sub: 'DTCs, symptoms, parts, tests' },
                { icon: '→', label: '', sub: '', arrow: true },
                { icon: '🗺️', label: 'Knowledge Graph', sub: 'Auto-mapped in background' },
                { icon: '→', label: '', sub: '', arrow: true },
                { icon: '⚖️', label: 'Evidence Engine', sub: '12 weighted evidence types' },
                { icon: '→', label: '', sub: '', arrow: true },
                { icon: '📈', label: 'Confidence Score', sub: 'Explainable 0–98%' },
                { icon: '→', label: '', sub: '', arrow: true },
                { icon: '🎯', label: 'Ranked Recommendations', sub: 'Evidence-backed actions' },
              ].map((step, i) =>
                step.arrow ? (
                  <div key={i} style={{ color: '#cc0000', fontSize: 22, fontWeight: 700, flexShrink: 0, padding: '0 8px' }}>→</div>
                ) : (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 130, flexShrink: 0 }}>
                    <div style={{ width: 54, height: 54, borderRadius: 14, background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{step.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: 12, textAlign: 'center', color: '#ddd' }}>{step.label}</div>
                    <div style={{ fontSize: 11, color: '#555', textAlign: 'center', lineHeight: 1.4 }}>{step.sub}</div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Competitor comparison + CTA side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'start' }}>

            {/* Comparison table */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Capability</div>
                <div style={{ fontSize: 12, color: '#cc0000', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>Redlined1</div>
                <div style={{ fontSize: 12, color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>Others</div>
              </div>
              {COMPETITOR_WINS.map((row, i) => (
                <div key={i} style={{ padding: '14px 28px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 8, alignItems: 'center', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <span style={{ fontSize: 13, color: '#bbb' }}>{row.feature}</span>
                  <span style={{ textAlign: 'center', fontSize: 16 }}>{row.us ? '✅' : '❌'}</span>
                  <span style={{ textAlign: 'center', fontSize: 16 }}>{row.them ? '✅' : '❌'}</span>
                </div>
              ))}
            </div>

            {/* Right: stats + CTA */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Pull-quote */}
              <div style={{ background: 'linear-gradient(135deg,rgba(204,0,0,0.12),rgba(204,0,0,0.04))', border: '1px solid rgba(204,0,0,0.3)', borderRadius: 18, padding: '32px 30px' }}>
                <div style={{ fontSize: 42, lineHeight: 1, color: '#cc0000', fontWeight: 900, marginBottom: 10 }}>&ldquo;</div>
                <p style={{ fontSize: 16, lineHeight: 1.75, color: '#ddd', marginBottom: 20 }}>
                  Every repair your shop closes makes the next repair faster, cheaper, and more accurate. No other auto repair software does this.
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#cc0000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🔧</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>Repair Intelligence Engine</div>
                    <div style={{ fontSize: 12, color: '#666' }}>Built exclusively for Redlined1</div>
                  </div>
                </div>
              </div>

              {/* 3 stat pills */}
              {[
                { n: '<10ms', label: 'Evidence pipeline — pure computation, no lag' },
                { n: '12×',   label: 'Evidence categories scored per repair case' },
                { n: '0–98%', label: 'Explainable confidence range, never a black box' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 22px', display: 'flex', gap: 18, alignItems: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#cc0000', minWidth: 70, flexShrink: 0 }}>{s.n}</div>
                  <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>{s.label}</div>
                </div>
              ))}

              {/* CTA */}
              <Link href="/signup" style={{ display: 'block', textAlign: 'center', background: '#cc0000', color: '#fff', padding: '16px 28px', borderRadius: 12, textDecoration: 'none', fontWeight: 800, fontSize: 16 }}>
                See Repair Intelligence in Action →
              </Link>
            </div>
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
                <img src={f.img} alt={f.title} style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover', marginBottom: 16, border: '1px solid rgba(204,0,0,0.25)', boxShadow: '0 6px 24px rgba(0,0,0,0.5)' }} />
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

      {/* ── CTA BANNER ────────────────────────────────────────── */}
      <section style={{ padding: '90px 6%', background: 'linear-gradient(135deg,#1a0000 0%,#cc0000 50%,#1a0000 100%)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(24px,4vw,44px)', fontWeight: 900, marginBottom: 16 }}>Ready to Redline Your Shop?</h2>
        <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 16, marginBottom: 34 }}>Run your shop smarter with Redlined1. No credit card required.</p>
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
    <ChatWidget />
    </div>
  );
}
