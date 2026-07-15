'use client';

import { useEffect, useState } from 'react';
import { colors, container, h2Style, badge, buttonPrimary, buttonSecondary } from './theme';
import Link from 'next/link';

/**
 * Four illustrative app screens that auto-scroll inside the phone frame.
 * All data is sample/illustrative — no real customer data, no real VINs.
 */
const SCREENS = [
  {
    label: 'Morning Brief',
    content: (
      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ background: colors.surfaceWhite, border: `1px solid ${colors.borderLight}`, borderRadius: '12px', padding: '14px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            <span style={{ fontSize: '13px', fontWeight: 700, color: colors.textMain }}>Morning Brief</span>
          </div>
          <p style={{ fontSize: '12px', color: colors.textMuted, lineHeight: 1.5, margin: 0 }}>
            You have 3 unsent estimates totaling <strong style={{ color: colors.textMain }}>$4,200</strong>. 2 vehicles are waiting for parts to arrive today.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: colors.primary, background: '#FEF2F2', padding: '6px 14px', borderRadius: '9999px', cursor: 'default' }}>
              Review
            </span>
          </div>
        </div>
        <div style={{ background: colors.surfaceBg, border: `1px solid ${colors.borderLight}`, borderRadius: '10px', padding: '10px' }}>
          <div style={{ width: '55%', height: '9px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginBottom: '6px' }} />
          <div style={{ width: '75%', height: '7px', background: '#F0F0F0', borderRadius: '4px' }} />
        </div>
        <div style={{ background: colors.surfaceBg, border: `1px solid ${colors.borderLight}`, borderRadius: '10px', padding: '10px' }}>
          <div style={{ width: '65%', height: '9px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginBottom: '6px' }} />
          <div style={{ width: '45%', height: '7px', background: '#F0F0F0', borderRadius: '4px' }} />
        </div>
      </div>
    ),
  },
  {
    label: 'Open Job Cards',
    content: (
      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Open Jobs</span>
        {[
          { title: 'Toyota Hilux', sub: 'Oil change + brake inspection', status: 'In Progress', statusColor: '#F59E0B' },
          { title: 'Honda Civic', sub: 'Engine diagnostic — DTC P0300', status: 'Waiting Parts', statusColor: colors.primary },
          { title: 'Ford Ranger', sub: 'AC recharge + cabin filter', status: 'Ready', statusColor: colors.success },
        ].map((job) => (
          <div key={job.title} style={{ background: colors.surfaceWhite, border: `1px solid ${colors.borderLight}`, borderRadius: '10px', padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: colors.textMain }}>{job.title}</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: job.statusColor, background: `${job.statusColor}18`, padding: '2px 7px', borderRadius: '9999px', whiteSpace: 'nowrap' }}>{job.status}</span>
            </div>
            <span style={{ fontSize: '11px', color: colors.textMuted, marginTop: '3px', display: 'block' }}>{job.sub}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    label: 'Build Estimate',
    content: (
      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Estimate — Honda Civic</span>
        {[
          { name: 'Diagnostic scan', qty: '1', price: '$85' },
          { name: 'Spark plugs ×4', qty: '4', price: '$120' },
          { name: 'Labor — tune-up', qty: '1.5h', price: '$135' },
        ].map((item) => (
          <div key={item.name} style={{ background: colors.surfaceWhite, border: `1px solid ${colors.borderLight}`, borderRadius: '10px', padding: '9px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: colors.textMain }}>{item.name}</div>
              <div style={{ fontSize: '10px', color: colors.textMuted }}>{item.qty}</div>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: colors.textMain }}>{item.price}</span>
          </div>
        ))}
        <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: colors.textMain }}>Total</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: colors.primary }}>$340</span>
        </div>
        <div style={{ background: colors.primary, borderRadius: '10px', padding: '11px', textAlign: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: colors.white }}>Send Estimate</span>
        </div>
      </div>
    ),
  },
  {
    label: 'Invoice & Pay',
    content: (
      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Invoice #1042</span>
        <div style={{ background: colors.surfaceWhite, border: `1px solid ${colors.borderLight}`, borderRadius: '10px', padding: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: colors.textMain, marginBottom: '4px' }}>Toyota Hilux</div>
          <div style={{ fontSize: '11px', color: colors.textMuted, marginBottom: '10px' }}>Oil change · Brake inspection · Labor</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: `1px solid ${colors.borderLight}` }}>
            <span style={{ fontSize: '11px', color: colors.textMuted }}>Total due</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: colors.textMain }}>$280</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, border: `1px solid ${colors.borderLight}`, borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: colors.textMain }}>Cash</span>
          </div>
          <div style={{ flex: 1, background: colors.primary, borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: colors.white }}>Mark Paid</span>
          </div>
        </div>
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>✓</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#065F46' }}>Payment recorded</span>
        </div>
      </div>
    ),
  },
];

type AvailabilityLabel = 'Available now' | 'Beta' | 'Coming soon';

const AVAIL_STYLE: Record<AvailabilityLabel, { bg: string; fg: string }> = {
  'Available now': { bg: '#ECFDF5', fg: '#065F46' },
  'Beta':          { bg: '#FEF3E2', fg: '#92400E' },
  'Coming soon':   { bg: '#F5F5F5', fg: '#525252' },
};

const FEATURES: { icon: string; title: string; desc: string; avail: AvailabilityLabel }[] = [
  {
    icon: '📋',
    title: 'Digital Job Cards',
    desc: 'Create, track, and close jobs from your phone — no clipboard, no office required.',
    avail: 'Available now',
  },
  {
    icon: '💰',
    title: 'On-Site Estimates',
    desc: 'Build and send professional estimates at the customer\'s driveway or parking lot.',
    avail: 'Available now',
  },
  {
    icon: '🧾',
    title: 'Mobile Invoicing',
    desc: 'Invoice and record payment on the spot the moment the job is complete.',
    avail: 'Available now',
  },
  {
    icon: '🔩',
    title: 'Parts Lookup',
    desc: 'Search parts, check pricing, and add them directly to an open job in seconds.',
    avail: 'Available now',
  },
  {
    icon: '📂',
    title: 'Customer & Vehicle History',
    desc: 'Full service history for every customer and vehicle, always at your fingertips.',
    avail: 'Available now',
  },
  {
    icon: '🗺️',
    title: 'Route-Ready Scheduling',
    desc: 'See your day\'s jobs with addresses and priority so you move efficiently between sites.',
    avail: 'Available now',
  },
  {
    icon: '✍️',
    title: 'Digital Signatures',
    desc: 'Capture customer approval on-screen before work begins — no paper required.',
    avail: 'Beta',
  },
  {
    icon: '📷',
    title: 'Photo Documentation',
    desc: 'Attach before-and-after photos to jobs for liability protection and customer trust.',
    avail: 'Available now',
  },
  {
    icon: '📶',
    title: 'Offline-Ready',
    desc: 'Keep working without cell service. Jobs sync automatically when you\'re back online.',
    avail: 'Beta',
  },
  {
    icon: '🔔',
    title: 'Instant Customer Notifications',
    desc: 'Customers receive automatic updates when a job status changes — no calls needed.',
    avail: 'Coming soon',
  },
];

const COMPARISON_ROWS: { category: string; traditional: string; mobile: string }[] = [
  { category: 'Overhead', traditional: 'Rent, utilities, equipment leases', mobile: 'Tools, parts, subscription' },
  { category: 'Scheduling', traditional: 'Walk-ins + phone bookings', mobile: 'Digital job cards from any location' },
  { category: 'Estimates', traditional: 'In-shop quotes on paper or whiteboard', mobile: 'Built and sent from the job site' },
  { category: 'Invoicing', traditional: 'End-of-day in-office processing', mobile: 'Collected on-site when job closes' },
  { category: 'Customer records', traditional: 'Binders or desktop software', mobile: 'Cloud history, accessible anywhere' },
  { category: 'Parts ordering', traditional: 'Counter visits or phone calls', mobile: 'In-app lookup, add to job immediately' },
  { category: 'Liability documentation', traditional: 'Paper sign-offs (often skipped)', mobile: 'Digital signatures + photo records' },
  { category: 'Business visibility', traditional: 'End-of-month reports', mobile: 'Live job and revenue dashboard' },
];

/**
 * MobileMechanicSection — phone mockup + mobile mechanic positioning.
 * Includes 10-feature capability grid and Traditional vs Mobile comparison.
 * All screen data is sample/illustrative — no real customer data, no real VINs.
 * Feature availability labels reflect current shipped state:
 *   Available now = shipped; Beta = active but limited; Coming soon = not yet shipped.
 */
export function MobileMechanicSection() {
  const [active, setActive] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setAnimating(true);
      setTimeout(() => {
        setActive((prev) => (prev + 1) % SCREENS.length);
        setAnimating(false);
      }, 300);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {/* ── Intro: phone mockup + positioning copy ── */}
      <section id="mobile-mechanic" style={{ paddingBlock: 'clamp(56px, 8vw, 128px)' }}>
        <div style={container} className="rd1-two-col">
          <div>
            <span style={{ ...badge, background: colors.successBg, color: colors.successText, marginBottom: '16px' }}>Mobile-ready today</span>
            <h2 style={h2Style}>Built for the shop floor, driveway, and road.</h2>
            <p style={{ color: colors.textMuted, marginTop: '12px', lineHeight: 1.6 }}>
              RedlineD1 is a responsive, installable web app — add it to your home screen and run a full job from your
              phone, no office required.
            </p>
            <p style={{ color: colors.textMuted, marginTop: '10px', lineHeight: 1.6 }}>
              Whether you work alone out of a van, take roadside calls between shop jobs, or run a fleet of mobile
              technicians — RedlineD1 gives you the same tools as a fixed shop, minus the overhead.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '28px' }}>
              <Link href="/signup" data-analytics="mm_trial_cta" style={buttonPrimary}>
                Start Free Trial
              </Link>
              <a href="#mm-features" data-analytics="mm_features_scroll" style={buttonSecondary}>
                See All Features
              </a>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '24px', flexWrap: 'wrap' }}>
              {['Solo mechanics', 'New technicians', 'Part-time mechanics', 'Roadside specialists', 'Fleet technicians'].map((tag) => (
                <span key={tag} style={{ ...badge, background: colors.surfaceBg, color: colors.textMuted, border: `1px solid ${colors.borderLight}` }}>
                  {tag}
                </span>
              ))}
            </div>

            {/* Dot indicators */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '32px' }}>
              {SCREENS.map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => setActive(i)}
                  aria-label={`Show ${s.label} screen`}
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
            <p style={{ fontSize: '12px', color: colors.textMuted, marginTop: '8px' }}>
              {SCREENS[active].label}
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {/* iPhone shell — outer titanium frame */}
            <div
              aria-hidden="true"
              style={{
                position: 'relative',
                width: '248px',
                background: 'linear-gradient(160deg, #2a2a2a 0%, #1a1a1a 40%, #111 100%)',
                borderRadius: '52px',
                padding: '12px',
                boxShadow: [
                  '0 0 0 1px #3a3a3a',
                  '0 0 0 2.5px #1a1a1a',
                  '0 0 0 3.5px #444',
                  '0 32px 80px -12px rgba(0,0,0,0.55)',
                  '0 8px 24px rgba(0,0,0,0.35)',
                  'inset 0 1px 0 rgba(255,255,255,0.12)',
                ].join(', '),
              }}
            >
              <div style={{ position: 'absolute', left: '-3px', top: '90px', width: '3px', height: '28px', background: '#3a3a3a', borderRadius: '2px 0 0 2px' }} />
              <div style={{ position: 'absolute', left: '-3px', top: '128px', width: '3px', height: '44px', background: '#3a3a3a', borderRadius: '2px 0 0 2px' }} />
              <div style={{ position: 'absolute', left: '-3px', top: '182px', width: '3px', height: '44px', background: '#3a3a3a', borderRadius: '2px 0 0 2px' }} />
              <div style={{ position: 'absolute', right: '-3px', top: '140px', width: '3px', height: '64px', background: '#3a3a3a', borderRadius: '0 2px 2px 0' }} />

              <div style={{
                borderRadius: '42px',
                overflow: 'hidden',
                background: colors.surfaceWhite,
                position: 'relative',
                minHeight: '480px',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
              }}>
                {/* Status bar */}
                <div style={{
                  background: colors.primary,
                  paddingTop: '14px',
                  paddingInline: '20px',
                  paddingBottom: '0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: colors.white,
                }}>
                  <span>9:41</span>
                  <div style={{
                    width: '72px',
                    height: '22px',
                    background: '#000',
                    borderRadius: '20px',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingRight: '5px',
                    gap: '3px',
                  }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '9999px', background: '#1a1a1a', border: '1.5px solid #2a2a2a', boxShadow: 'inset 0 0 0 1.5px #0d0d0d' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <svg width="13" height="10" viewBox="0 0 13 10" fill="white"><rect x="0" y="5" width="2" height="5" rx="0.5"/><rect x="3.5" y="3" width="2" height="7" rx="0.5"/><rect x="7" y="1" width="2" height="9" rx="0.5"/><rect x="10.5" y="0" width="2" height="10" rx="0.5"/></svg>
                    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="white" strokeWidth="1.2"><path d="M1 3.5C3.5 1 10.5 1 13 3.5"/><path d="M3 5.5C4.5 4 9.5 4 11 5.5"/><path d="M5 7.5C6 6.5 8 6.5 9 7.5"/><circle cx="7" cy="9" r="0.8" fill="white" stroke="none"/></svg>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                      <div style={{ width: '19px', height: '10px', border: '1px solid rgba(255,255,255,0.6)', borderRadius: '2px', padding: '1.5px', display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: '72%', height: '100%', background: 'white', borderRadius: '1px' }} />
                      </div>
                      <div style={{ width: '2px', height: '5px', background: 'rgba(255,255,255,0.5)', borderRadius: '0 1px 1px 0' }} />
                    </div>
                  </div>
                </div>

                {/* App header bar */}
                <div style={{ background: colors.primary, padding: '10px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: colors.white, letterSpacing: '0.04em' }}>RedlineD1</span>
                  <span style={{ width: '28px', height: '28px', borderRadius: '9999px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: colors.white }}>D1</span>
                  </span>
                </div>

                {/* Animated content area */}
                <div
                  style={{
                    opacity: animating ? 0 : 1,
                    transform: animating ? 'translateY(10px)' : 'translateY(0)',
                    transition: 'opacity 0.3s ease, transform 0.3s ease',
                  }}
                >
                  {SCREENS[active].content}
                </div>

                {/* Home indicator */}
                <div style={{ padding: '10px 0 14px', display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: '100px', height: '4px', background: '#1a1a1a', borderRadius: '9999px', opacity: 0.18 }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature grid: Everything You Need ── */}
      <section id="mm-features" style={{ paddingBlock: 'clamp(56px, 8vw, 96px)', background: colors.surfaceWhite }}>
        <div style={container}>
          <div style={{ maxWidth: '640px', marginBottom: '48px' }}>
            <span style={{ ...badge, background: colors.successBg, color: colors.successText, marginBottom: '12px' }}>Mobile mechanic tools</span>
            <h2 style={h2Style}>Everything you need to run a mobile mechanic business.</h2>
            <p style={{ color: colors.textMuted, marginTop: '12px', lineHeight: 1.6 }}>
              No shop? No problem. RedlineD1 is built to go wherever you go — every tool you need, accessible from your phone.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {FEATURES.map((f) => {
              const av = AVAIL_STYLE[f.avail];
              return (
                <div
                  key={f.title}
                  style={{
                    background: colors.surfaceBg,
                    border: `1px solid ${colors.borderLight}`,
                    borderRadius: '12px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '22px', lineHeight: 1 }} aria-hidden="true">{f.icon}</span>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: colors.textMain }}>{f.title}</span>
                    </div>
                    <span style={{ ...badge, background: av.bg, color: av.fg, flexShrink: 0 }}>{f.avail}</span>
                  </div>
                  <p style={{ fontSize: '13px', color: colors.textMuted, lineHeight: 1.55, margin: 0 }}>{f.desc}</p>
                </div>
              );
            })}
          </div>

          <p style={{ marginTop: '24px', fontSize: '12px', color: colors.textMuted }}>
            <strong>Available now</strong> = shipped and in use. <strong>Beta</strong> = live but expanding. <strong>Coming soon</strong> = on the roadmap, not yet shipped.
          </p>
        </div>
      </section>

      {/* ── Cost comparison: Traditional shop vs Mobile mechanic ── */}
      <section style={{ paddingBlock: 'clamp(56px, 8vw, 96px)', background: colors.surfaceBg }}>
        <div style={container}>
          <div style={{ maxWidth: '640px', marginBottom: '40px' }}>
            <h2 style={h2Style}>Traditional shop overhead vs. mobile mechanic with RedlineD1.</h2>
            <p style={{ color: colors.textMuted, marginTop: '12px', lineHeight: 1.6 }}>
              Running a mobile operation is structurally leaner. RedlineD1 keeps the back-office workflows that usually require a fixed location entirely in your pocket.
            </p>
          </div>

          <div className="rd1-scroll-x">
            <table style={{ width: '100%', minWidth: '560px', borderCollapse: 'collapse', background: colors.surfaceWhite, border: `1px solid ${colors.borderLight}`, borderRadius: '12px', overflow: 'hidden' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left', padding: '14px 16px', fontSize: '13px', color: colors.textMuted, borderBottom: `1px solid ${colors.borderLight}` }}>Area</th>
                  <th scope="col" style={{ textAlign: 'left', padding: '14px 16px', fontSize: '13px', color: colors.textMuted, borderBottom: `1px solid ${colors.borderLight}` }}>Traditional Shop</th>
                  <th scope="col" style={{ textAlign: 'left', padding: '14px 16px', fontSize: '13px', color: colors.primary, borderBottom: `1px solid ${colors.borderLight}` }}>Mobile + RedlineD1</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.category}>
                    <th scope="row" style={{ textAlign: 'left', padding: '12px 16px', fontSize: '14px', fontWeight: 500, color: colors.textMain, borderBottom: `1px solid ${colors.borderLight}` }}>
                      {row.category}
                    </th>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: colors.textMuted, borderBottom: `1px solid ${colors.borderLight}` }}>
                      {row.traditional}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: colors.successText, borderBottom: `1px solid ${colors.borderLight}` }}>
                      {row.mobile}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: '14px', fontSize: '13px', color: colors.textMuted, fontStyle: 'italic' }}>
            Comparison describes general patterns, not any specific competitor. RedlineD1 ratings reflect currently shipped capability.
          </p>
        </div>
      </section>

      {/* ── Mobile mechanic CTA ── */}
      <section style={{ paddingBlock: 'clamp(48px, 6vw, 80px)', background: colors.surfaceDark }}>
        <div style={{ ...container, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <span style={{ ...badge, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>No office required</span>
          <h2 style={{ ...h2Style, color: colors.textOnDark, maxWidth: '640px' }}>
            Run your mobile mechanic business from the road — starting today.
          </h2>
          <p style={{ fontSize: '16px', lineHeight: 1.6, color: 'rgba(255,255,255,0.65)', maxWidth: '520px', margin: 0 }}>
            7-day free trial. No credit card required. Works on any phone, tablet, or laptop.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
            <Link href="/signup" data-analytics="mm_cta_block_trial" style={buttonPrimary}>
              Start Your Free Trial
            </Link>
            <a href="#faq" data-analytics="mm_cta_block_faq" style={{ ...buttonSecondary, background: 'transparent', color: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.25)' }}>
              Common Questions
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

