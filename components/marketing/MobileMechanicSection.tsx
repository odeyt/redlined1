'use client';

import { useEffect, useState } from 'react';
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
        <div style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)', borderRadius: '12px', padding: '14px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: 14 }}>☀️</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>Morning Brief</span>
          </div>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, margin: 0 }}>
            You have <strong style={{ color: '#ff6666' }}>3 unsent estimates</strong> totaling <strong style={{ color: '#fff' }}>$4,200</strong>. 2 vehicles waiting for parts today.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#cc0000', background: 'rgba(204,0,0,0.15)', padding: '5px 12px', borderRadius: '9999px', border: '1px solid rgba(204,0,0,0.3)' }}>Review →</span>
          </div>
        </div>
        {[{ w: '55%' }, { w: '70%' }].map((b, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '10px' }}>
            <div style={{ width: b.w, height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', marginBottom: '6px' }} />
            <div style={{ width: '40%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
          </div>
        ))}
      </div>
    ),
  },
  {
    label: 'Open Job Cards',
    content: (
      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Open Jobs</span>
        {[
          { title: 'Toyota Hilux', sub: 'Oil change + brake inspection', status: 'In Progress', c: '#f59e0b' },
          { title: 'Honda Civic', sub: 'Engine diagnostic — DTC P0300', status: 'Waiting Parts', c: '#cc0000' },
          { title: 'Ford Ranger', sub: 'AC recharge + cabin filter', status: 'Ready', c: '#22c55e' },
        ].map(job => (
          <div key={job.title} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>{job.title}</span>
              <span style={{ fontSize: '9px', fontWeight: 700, color: job.c, background: `${job.c}18`, padding: '2px 7px', borderRadius: '9999px', whiteSpace: 'nowrap' }}>{job.status}</span>
            </div>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '3px', display: 'block' }}>{job.sub}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    label: 'Build Estimate',
    content: (
      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Estimate — Honda Civic</span>
        {[
          { name: 'Diagnostic scan', qty: '1', price: '$85' },
          { name: 'Spark plugs ×4', qty: '4', price: '$120' },
          { name: 'Labor — tune-up', qty: '1.5h', price: '$135' },
        ].map(item => (
          <div key={item.name} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '9px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>{item.name}</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{item.qty}</div>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{item.price}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>Total</span>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#cc0000' }}>$340</span>
        </div>
        <div style={{ background: 'linear-gradient(135deg,#e52020,#aa0000)', borderRadius: '10px', padding: '11px', textAlign: 'center', boxShadow: '0 4px 12px rgba(204,0,0,0.4)' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>Send Estimate</span>
        </div>
      </div>
    ),
  },
  {
    label: 'Invoice & Pay',
    content: (
      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Invoice #1042</span>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Toyota Hilux</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginBottom: '10px' }}>Oil change · Brake inspection · Labor</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>Total due</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>$280</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>Cash</span>
          </div>
          <div style={{ flex: 1, background: 'linear-gradient(135deg,#e52020,#aa0000)', borderRadius: '10px', padding: '10px', textAlign: 'center', boxShadow: '0 3px 10px rgba(204,0,0,0.35)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#fff' }}>Mark Paid</span>
          </div>
        </div>
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>✅</span>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#22c55e' }}>Payment recorded</span>
        </div>
      </div>
    ),
  },
];

const AVAIL_STYLE: Record<string, { bg: string; fg: string }> = {
  'Available now': { bg: 'rgba(34,197,94,0.12)',  fg: '#22c55e' },
  'Beta':          { bg: 'rgba(245,158,11,0.12)', fg: '#f59e0b' },
  'Coming soon':   { bg: 'rgba(255,255,255,0.06)', fg: 'rgba(255,255,255,0.3)' },
};

const FEATURES = [
  { icon: '📋', title: 'Digital Job Cards',            avail: 'Available now', desc: 'Create, track, and close jobs from your phone — no clipboard, no office required.' },
  { icon: '💰', title: 'On-Site Estimates',            avail: 'Available now', desc: "Build and send professional estimates at the customer's driveway or parking lot." },
  { icon: '🧾', title: 'Mobile Invoicing',             avail: 'Available now', desc: 'Invoice and record payment on the spot the moment the job is complete.' },
  { icon: '🔩', title: 'Parts Lookup',                 avail: 'Available now', desc: 'Search parts, check pricing, and add them directly to an open job in seconds.' },
  { icon: '📂', title: 'Customer & Vehicle History',   avail: 'Available now', desc: 'Full service history for every customer and vehicle, always at your fingertips.' },
  { icon: '🗺️', title: 'Route-Ready Scheduling',      avail: 'Available now', desc: "See your day's jobs with addresses and priority so you move efficiently between sites." },
  { icon: '✍️', title: 'Digital Signatures',          avail: 'Beta',          desc: 'Capture customer approval on-screen before work begins — no paper required.' },
  { icon: '📷', title: 'Photo Documentation',          avail: 'Available now', desc: 'Attach before-and-after photos to jobs for liability protection and customer trust.' },
  { icon: '📶', title: 'Offline-Ready',                avail: 'Beta',          desc: "Keep working without cell service. Jobs sync automatically when you're back online." },
  { icon: '🔔', title: 'Instant Customer Notifications', avail: 'Coming soon', desc: 'Customers receive automatic updates when a job status changes — no calls needed.' },
];

const COMPARISON_ROWS = [
  { category: 'Overhead',               traditional: 'Rent, utilities, equipment leases',    mobile: 'Tools, parts, subscription' },
  { category: 'Scheduling',             traditional: 'Walk-ins + phone bookings',             mobile: 'Digital job cards from any location' },
  { category: 'Estimates',              traditional: 'In-shop quotes on paper or whiteboard', mobile: 'Built and sent from the job site' },
  { category: 'Invoicing',              traditional: 'End-of-day in-office processing',       mobile: 'Collected on-site when job closes' },
  { category: 'Customer records',       traditional: 'Binders or desktop software',           mobile: 'Cloud history, accessible anywhere' },
  { category: 'Parts ordering',         traditional: 'Counter visits or phone calls',         mobile: 'In-app lookup, add to job immediately' },
  { category: 'Liability documentation',traditional: 'Paper sign-offs (often skipped)',       mobile: 'Digital signatures + photo records' },
  { category: 'Business visibility',    traditional: 'End-of-month reports',                  mobile: 'Live job and revenue dashboard' },
];

/**
 * MobileMechanicSection — phone mockup + mobile mechanic positioning.
 * All screen data is sample/illustrative — no real customer data, no real VINs.
 * Feature availability: Available now = shipped; Beta = active but limited; Coming soon = not yet shipped.
 */
export function MobileMechanicSection() {
  const [active, setActive] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setAnimating(true);
      setTimeout(() => { setActive(p => (p + 1) % SCREENS.length); setAnimating(false); }, 300);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <style>{`
        @keyframes mm-feature-glow { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 20px rgba(204,0,0,0.08)} }
        .mm-feature-card { transition: all 0.25s ease; }
        .mm-feature-card:hover { transform: translateY(-2px); border-color: rgba(204,0,0,0.25) !important; }
        .mm-dot-btn { transition: all 0.3s ease; }
      `}</style>

      {/* ── Intro: phone mockup + positioning copy ── */}
      <section id="mobile-mechanic" style={{ paddingBlock: 'clamp(56px,8vw,128px)', background: '#07070a', position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(204,0,0,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(204,0,0,0.02) 1px,transparent 1px)', backgroundSize: '52px 52px' }} />
        <div aria-hidden="true" style={{ position: 'absolute', top: '10%', right: '5%', width: 500, height: 500, background: 'radial-gradient(ellipse,rgba(204,0,0,0.06) 0%,transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1200, marginInline: 'auto', paddingInline: 'clamp(16px,5vw,48px)', position: 'relative', display: 'flex', gap: 64, alignItems: 'center', flexWrap: 'wrap' }}>

          {/* Left text */}
          <div style={{ flex: '1 1 360px', maxWidth: 520 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '6px 14px', borderRadius: 9999, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Mobile-Ready Today</span>
            </div>
            <h2 style={{ fontSize: 'clamp(26px,4vw,44px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', margin: '0 0 16px', lineHeight: 1.1 }}>
              Built for the shop floor,<br />
              <span style={{ color: '#cc0000' }}>driveway, and road.</span>
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', lineHeight: 1.8, margin: '0 0 12px' }}>
              RedlineD1 is a responsive, installable web app — add it to your home screen and run a full job from your phone, no office required.
            </p>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', lineHeight: 1.8, margin: 0 }}>
              Whether you work alone out of a van, take roadside calls between shop jobs, or run a fleet of mobile technicians — RedlineD1 gives you the same tools as a fixed shop, minus the overhead.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 28 }}>
              <Link href="/signup" style={{ padding: '13px 28px', borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: 'none', background: 'linear-gradient(135deg,#e52020,#aa0000)', color: '#fff', boxShadow: '0 4px 20px rgba(204,0,0,0.4)', display: 'inline-block' }}>
                Start Free
              </Link>
              <a href="#mm-features" style={{ padding: '13px 24px', borderRadius: 12, fontWeight: 600, fontSize: 14, textDecoration: 'none', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.12)', display: 'inline-block' }}>
                See All Features
              </a>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
              {['Solo mechanics','New technicians','Part-time mechanics','Roadside specialists','Fleet technicians'].map(tag => (
                <span key={tag} style={{ padding: '5px 12px', borderRadius: 9999, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {tag}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 28 }}>
              {SCREENS.map((s, i) => (
                <button key={s.label} onClick={() => setActive(i)} className="mm-dot-btn" aria-label={`Show ${s.label}`}
                  style={{ height: 4, borderRadius: 9999, border: 'none', padding: 0, cursor: 'pointer', transition: 'all 0.3s', flex: i === active ? 3 : 1, background: i === active ? '#cc0000' : 'rgba(255,255,255,0.12)' }} />
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{SCREENS[active].label}</p>
          </div>

          {/* Phone mockup */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: '0 0 auto' }}>
            <div aria-hidden="true" style={{
              position: 'relative', width: 248,
              background: 'linear-gradient(160deg,#1a1a1a 0%,#111 40%,#0a0a0a 100%)',
              borderRadius: 52, padding: 12,
              boxShadow: ['0 0 0 1px #2a2a2a','0 0 0 2.5px #111','0 0 0 3.5px #333','0 40px 100px -12px rgba(0,0,0,0.9)','0 0 60px rgba(204,0,0,0.08)','inset 0 1px 0 rgba(255,255,255,0.08)'].join(', '),
            }}>
              {/* Buttons */}
              <div style={{ position: 'absolute', left: -3, top: 90,  width: 3, height: 28, background: '#2a2a2a', borderRadius: '2px 0 0 2px' }} />
              <div style={{ position: 'absolute', left: -3, top: 128, width: 3, height: 44, background: '#2a2a2a', borderRadius: '2px 0 0 2px' }} />
              <div style={{ position: 'absolute', left: -3, top: 182, width: 3, height: 44, background: '#2a2a2a', borderRadius: '2px 0 0 2px' }} />
              <div style={{ position: 'absolute', right: -3, top: 140, width: 3, height: 64, background: '#2a2a2a', borderRadius: '0 2px 2px 0' }} />

              <div style={{ borderRadius: 42, overflow: 'hidden', background: '#0a0a0a', position: 'relative', minHeight: 480 }}>
                {/* Status bar */}
                <div style={{ background: '#0d0d14', paddingTop: 14, paddingInline: 20, paddingBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                  <span>9:41</span>
                  <div style={{ width: 72, height: 22, background: '#000', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#111', border: '1.5px solid #1a1a1a' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="13" height="10" viewBox="0 0 13 10" fill="rgba(255,255,255,0.7)"><rect x="0" y="5" width="2" height="5" rx="0.5"/><rect x="3.5" y="3" width="2" height="7" rx="0.5"/><rect x="7" y="1" width="2" height="9" rx="0.5"/><rect x="10.5" y="0" width="2" height="10" rx="0.5"/></svg>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <div style={{ width: 19, height: 10, border: '1px solid rgba(255,255,255,0.4)', borderRadius: 2, padding: 1.5, display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: '72%', height: '100%', background: 'rgba(255,255,255,0.7)', borderRadius: 1 }} />
                      </div>
                    </div>
                  </div>
                </div>
                {/* App header */}
                <div style={{ background: 'linear-gradient(135deg,#cc0000,#990000)', padding: '10px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 12px rgba(204,0,0,0.3)' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>RedlineD1</span>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>D1</span>
                </div>
                {/* Animated content */}
                <div style={{ opacity: animating ? 0 : 1, transform: animating ? 'translateY(8px)' : 'translateY(0)', transition: 'opacity 0.3s ease, transform 0.3s ease', background: '#0a0a0a' }}>
                  {SCREENS[active].content}
                </div>
                {/* Home indicator */}
                <div style={{ padding: '10px 0 14px', display: 'flex', justifyContent: 'center', background: '#0a0a0a' }}>
                  <div style={{ width: 100, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 9999 }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature grid ── */}
      <section id="mm-features" style={{ paddingBlock: 'clamp(56px,8vw,96px)', background: '#0d0d14', position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)', backgroundSize: '52px 52px' }} />

        <div style={{ maxWidth: 1200, marginInline: 'auto', paddingInline: 'clamp(16px,5vw,48px)', position: 'relative' }}>
          <div style={{ maxWidth: 640, marginBottom: 48 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '6px 14px', borderRadius: 9999, background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.25)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#cc0000', boxShadow: '0 0 8px #cc0000' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#ff6666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Mobile Mechanic Tools</span>
            </div>
            <h2 style={{ fontSize: 'clamp(24px,4vw,40px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', margin: '0 0 14px', lineHeight: 1.1 }}>
              Everything you need to run a<br /><span style={{ color: '#cc0000' }}>mobile mechanic business.</span>
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', lineHeight: 1.8, margin: 0 }}>
              No shop? No problem. RedlineD1 is built to go wherever you go.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
            {FEATURES.map(f => {
              const av = AVAIL_STYLE[f.avail];
              return (
                <div key={f.title} className="mm-feature-card" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20, lineHeight: 1 }}>{f.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{f.title}</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: av.bg, color: av.fg, flexShrink: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{f.avail}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
                </div>
              );
            })}
          </div>

          <p style={{ marginTop: 20, fontSize: 11, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
            Available now = shipped and in use. Beta = live but expanding. Coming soon = on the roadmap, not yet shipped.
          </p>
        </div>
      </section>

      {/* ── Comparison table ── */}
      <section style={{ paddingBlock: 'clamp(56px,8vw,96px)', background: '#07070a', position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(34,197,94,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(34,197,94,0.02) 1px,transparent 1px)', backgroundSize: '52px 52px' }} />

        <div style={{ maxWidth: 1200, marginInline: 'auto', paddingInline: 'clamp(16px,5vw,48px)', position: 'relative' }}>
          <div style={{ maxWidth: 640, marginBottom: 40 }}>
            <h2 style={{ fontSize: 'clamp(24px,4vw,40px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', margin: '0 0 14px', lineHeight: 1.1 }}>
              Traditional shop overhead vs.<br />
              <span style={{ color: '#22c55e' }}>mobile mechanic with RedlineD1.</span>
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', lineHeight: 1.8, margin: 0 }}>
              Running a mobile operation is structurally leaner. RedlineD1 keeps the back-office workflows that usually require a fixed location entirely in your pocket.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <th scope="col" style={{ textAlign: 'left', padding: '16px 20px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.07)', width: '30%' }}>Area</th>
                  <th scope="col" style={{ textAlign: 'left', padding: '16px 20px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>Traditional Shop</th>
                  <th scope="col" style={{ textAlign: 'left', padding: '16px 20px', fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>Mobile + RedlineD1</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr key={row.category} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <th scope="row" style={{ textAlign: 'left', padding: '13px 20px', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.75)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.category}</th>
                    <td style={{ padding: '13px 20px', fontSize: 12, color: 'rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.traditional}</td>
                    <td style={{ padding: '13px 20px', fontSize: 12, color: '#22c55e', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.mobile}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 14, fontSize: 11, color: 'rgba(255,255,255,0.18)', fontStyle: 'italic' }}>
            Comparison describes general patterns, not any specific competitor. RedlineD1 ratings reflect currently shipped capability.
          </p>
        </div>
      </section>

      {/* ── Mobile mechanic CTA ── */}
      <section style={{ paddingBlock: 'clamp(56px,6vw,80px)', background: '#0d0d14', position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 700, height: 400, background: 'radial-gradient(ellipse,rgba(204,0,0,0.08) 0%,transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1200, marginInline: 'auto', paddingInline: 'clamp(16px,5vw,48px)', position: 'relative', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>No office required</span>
          </div>
          <h2 style={{ fontSize: 'clamp(24px,4vw,42px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', margin: 0, maxWidth: 600, lineHeight: 1.1 }}>
            Run your mobile mechanic business<br />from the road — starting today.
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', maxWidth: 480, margin: 0, lineHeight: 1.8 }}>
            Free to start — no credit card required. Works on any phone, tablet, or laptop.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <Link href="/signup" style={{ padding: '14px 32px', borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: 'none', background: 'linear-gradient(135deg,#e52020,#aa0000)', color: '#fff', boxShadow: '0 4px 24px rgba(204,0,0,0.4)', display: 'inline-block' }}>
              Start Free
            </Link>
            <a href="#faq" style={{ padding: '14px 24px', borderRadius: 12, fontWeight: 600, fontSize: 15, textDecoration: 'none', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)', display: 'inline-block' }}>
              Common Questions
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
