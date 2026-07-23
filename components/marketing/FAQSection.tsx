'use client';

import { useId, useState } from 'react';
import Link from 'next/link';

const CATEGORIES = ['All', 'General', 'Billing & Plans', 'Digital Inspections', 'Mobile Mechanics'];

const FAQS = [
  {
    cat: 'General',
    q: 'Is RedlineD1 ready for a real shop today?',
    a: "Yes — it's built and used inside an active two-location repair business. Core job management, estimates, invoices, digital inspections, and customer history are all live. Some intelligence features are still expanding; see the Product Evolution section for what's available now versus rolling out.",
  },
  {
    cat: 'General',
    q: 'Can I import my existing data?',
    a: 'Parts and inventory data can be imported today via CSV or Excel. Full-shop migration support is expanding. See the Migration section for tier options including Assisted and White-Glove onboarding.',
  },
  {
    cat: 'General',
    q: 'Is there a native mobile app?',
    a: 'RedlineD1 is a mobile-ready, installable web app (PWA) that works on iOS and Android today. Native App Store apps are on the roadmap, not yet available.',
  },
  {
    cat: 'General',
    q: "How does RedlineD1's AI work?",
    a: "It surfaces evidence-based recommendations — what happened, why it matters, what to do — based on your shop's own recorded data. It never replaces technician judgment or hides its reasoning.",
  },
  {
    cat: 'General',
    q: 'Can I run more than one shop location?',
    a: 'Yes. Multi-location data is available today. Business and Enterprise plans include a unified multi-location dashboard with cross-location job visibility.',
  },
  {
    cat: 'General',
    q: "What if I decide RedlineD1 isn't the right fit?",
    a: 'You can export your data and cancel at any time. No lock-in, no cancellation fees. Contact our team and we will assist with the offboarding.',
  },
  {
    cat: 'Billing & Plans',
    q: 'Do I need a credit card to get started?',
    a: 'No. The Free Forever plan requires no credit card — start managing jobs right now, upgrade whenever you need more.',
    cta: { label: 'Start Free', href: '/signup', type: 'link' },
  },
  {
    cat: 'Billing & Plans',
    q: 'Which plan is right for a solo mechanic or mobile mechanic?',
    a: 'The Solo plan at $24/month is purpose-built for independent and mobile mechanics. It includes all core job management, estimates, invoices, digital inspections, and customer history with no seat minimums.',
    cta: { label: 'Get Solo — $24/mo', planId: 'solo', type: 'checkout' },
  },
  {
    cat: 'Billing & Plans',
    q: 'What plan do I need for a small shop with a team?',
    a: 'The Starter plan at $49/month supports up to 3 technician seats and adds team assignments, multi-bay scheduling, and inventory tracking. For AI intelligence and advanced analytics, Professional at $99/month is the most popular choice.',
    cta: { label: 'Get Starter — $49/mo', planId: 'starter', type: 'checkout' },
  },
  {
    cat: 'Billing & Plans',
    q: 'Can I switch plans later?',
    a: 'Yes. You can upgrade or downgrade your plan at any time from inside the app. Upgrades take effect immediately; downgrades apply at the next billing cycle.',
  },
  {
    cat: 'Billing & Plans',
    q: 'Is there a discount for annual billing?',
    a: 'Yes. Annual billing saves approximately 17% versus paying month to month. The saving is shown on the Pricing section for each plan.',
    cta: { label: 'See Pricing', href: '#pricing', type: 'link' },
  },
  {
    cat: 'Billing & Plans',
    q: 'What payment methods are accepted?',
    a: 'Payments are processed securely through Creem. Major credit and debit cards are accepted. All transactions are encrypted and PCI-compliant.',
  },
  {
    cat: 'Digital Inspections',
    q: 'What is a Digital Vehicle Inspection in RedlineD1?',
    a: 'A Digital Vehicle Inspection (DVI) lets technicians record vehicle-condition findings item by item — rating each as Pass, Attention, Fail, or N/A — and attach photos and notes. The completed inspection links to the customer and vehicle record and can be shared as a professional report.',
  },
  {
    cat: 'Digital Inspections',
    q: 'Can technicians complete inspections from a phone?',
    a: 'Yes. RedlineD1 is a responsive, installable web app that works on phones, tablets, and computers. Technicians can complete the full checklist, attach photos, and send the report from any device.',
  },
  {
    cat: 'Digital Inspections',
    q: 'Can inspection findings be connected to an estimate?',
    a: 'Yes. Once an inspection is marked complete, one click creates an estimate — the customer and vehicle details carry over automatically. An AI-assisted estimate draft from inspection findings is also available.',
  },
  {
    cat: 'Digital Inspections',
    q: 'Can customers approve or decline repairs online?',
    a: 'Yes. A secure share link gives the customer a professional inspection report. They can review findings, photos, and technician notes, then approve or decline each recommended repair individually. Their name becomes a timestamped digital approval recorded in the inspection record.',
  },
  {
    cat: 'Digital Inspections',
    q: 'Are inspection photos and records saved permanently?',
    a: "Yes. Every inspection is linked to the customer and vehicle record. Photos are stored securely in the shop's account. Completed inspections remain part of the vehicle's service history for every future visit.",
  },
  {
    cat: 'Mobile Mechanics',
    q: 'Is DVI useful for mobile mechanics?',
    a: "Yes. Mobile mechanics can perform structured vehicle inspections at the customer's location, record findings and capture photos from their phone, share the report via link, and maintain a professional inspection history — all without a physical shop.",
  },
  {
    cat: 'Mobile Mechanics',
    q: 'Do I need a physical shop address to use RedlineD1?',
    a: 'No. RedlineD1 works entirely from a phone, tablet, or laptop. There is no requirement for a fixed location — mobile mechanics can create jobs, send estimates, and invoice customers from anywhere.',
  },
  {
    cat: 'Mobile Mechanics',
    q: 'Can I create and send estimates from my phone at a job site?',
    a: "Yes. Build estimates on the spot — add parts, labor, and notes — and send to the customer before you leave the driveway. The customer receives a professional digital copy immediately.",
  },
  {
    cat: 'Mobile Mechanics',
    q: 'How does scheduling work for mobile mechanics?',
    a: "You create and manage job cards with customer addresses directly in the app. Route-ready scheduling showing the day's jobs with locations and priority is available now. Turn-by-turn navigation integrations are on the roadmap.",
  },
  {
    cat: 'Mobile Mechanics',
    q: 'Can I take customer payment on-site?',
    a: "Yes. You can record cash payments and mark invoices paid on the spot from your phone. Digital payment collection (card-on-file, pay links) is on the roadmap.",
  },
];

const PLAN_CTАС = [
  { label: 'Solo', price: '$24/mo', planId: 'solo', color: '#6366f1' },
  { label: 'Starter', price: '$49/mo', planId: 'starter', color: '#0ea5e9' },
  { label: 'Professional', price: '$99/mo', planId: 'professional', color: '#cc0000', featured: true },
  { label: 'Business', price: '$179/mo', planId: 'business', color: '#8b5cf6' },
];

function FAQItem({ q, a, cta, color }: { q: string; a: string; cta?: { label: string; href?: string; planId?: string; type: string }; color: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  function handleCheckout(planId: string) {
    window.location.href = `/signup?plan=${planId}&billing=monthly`;
  }

  return (
    <div style={{
      borderRadius: '12px',
      border: open ? `1px solid ${color}33` : '1px solid rgba(255,255,255,0.06)',
      background: open ? `${color}08` : 'rgba(255,255,255,0.02)',
      transition: 'all 0.2s ease',
      overflow: 'hidden',
    }}>
      <h3 style={{ margin: 0 }}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: '16px',
            padding: '20px 22px', background: 'transparent', border: 'none',
            textAlign: 'left', fontSize: '15px', fontWeight: 600,
            color: open ? '#fff' : 'rgba(255,255,255,0.75)',
            cursor: 'pointer', transition: 'color 0.2s',
          }}
        >
          {q}
          <span aria-hidden="true" style={{
            color: open ? color : 'rgba(255,255,255,0.25)',
            flexShrink: 0, fontSize: '18px', lineHeight: 1,
            transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease, color 0.2s',
            display: 'inline-block',
          }}>+</span>
        </button>
      </h3>
      {open && (
        <div id={panelId} role="region" style={{ padding: '0 22px 22px' }}>
          <p style={{ fontSize: '14px', lineHeight: 1.75, color: 'rgba(255,255,255,0.5)', margin: '0 0 14px' }}>{a}</p>
          {cta && (
            cta.type === 'link' ? (
              <a
                href={cta.href}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  fontSize: '13px', fontWeight: 700, color: color,
                  textDecoration: 'none', padding: '8px 16px', borderRadius: '8px',
                  background: `${color}15`, border: `1px solid ${color}33`,
                  transition: 'all 0.2s',
                }}
              >
                {cta.label} →
              </a>
            ) : (
              <button
                type="button"
                onClick={() => handleCheckout(cta.planId!)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  fontSize: '13px', fontWeight: 700, color: color,
                  padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                  background: `${color}15`, border: `1px solid ${color}33`,
                  transition: 'all 0.2s',
                }}
              >
                {cta.label} →
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

const CAT_COLORS: Record<string, string> = {
  General: '#6366f1',
  'Billing & Plans': '#cc0000',
  'Digital Inspections': '#10b981',
  'Mobile Mechanics': '#f59e0b',
};

export function FAQSection() {
  const [activeCat, setActiveCat] = useState('All');

  const filtered = activeCat === 'All' ? FAQS : FAQS.filter(f => f.cat === activeCat);
  const catColor = activeCat === 'All' ? '#cc0000' : (CAT_COLORS[activeCat] ?? '#cc0000');

  function handlePlanCheckout(planId: string) {
    window.location.href = `/signup?plan=${planId}&billing=monthly`;
  }

  return (
    <section id="faq" style={{ paddingBlock: 'clamp(56px, 8vw, 120px)', background: '#0a0a0a', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        .faq-plan-pill { transition: transform 0.15s ease, filter 0.15s ease, border-color 0.15s ease; }
        .faq-plan-pill:hover { transform: translateY(-2px); filter: brightness(1.2); border-color: rgba(255,255,255,0.3); }
        .faq-plan-pill:active { transform: translateY(0) scale(0.96); filter: brightness(0.95); }
      `}</style>

      {/* Background */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div style={{ maxWidth: '860px', marginInline: 'auto', paddingInline: 'clamp(16px, 5vw, 48px)', position: 'relative' }}>

        {/* Header */}
        <div style={{ marginBottom: '48px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '20px', padding: '6px 14px', borderRadius: '9999px', background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.25)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#cc0000', boxShadow: '0 0 8px #cc0000' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#cc0000', textTransform: 'uppercase', letterSpacing: '0.1em' }}>FAQ</span>
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', margin: '0 0 12px' }}>
            Questions answered.
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.4)', maxWidth: '480px', lineHeight: 1.65 }}>
            Everything you need to know before you start. Can't find your answer?{' '}
            <a href="mailto:admin@redlined1.com" style={{ color: '#cc0000', textDecoration: 'none', fontWeight: 600 }}>Email us.</a>
          </p>
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '28px' }}>
          {CATEGORIES.map(cat => {
            const isActive = cat === activeCat;
            const c = cat === 'All' ? '#cc0000' : (CAT_COLORS[cat] ?? '#cc0000');
            return (
              <button
                key={cat}
                onClick={() => setActiveCat(cat)}
                style={{
                  padding: '8px 18px', borderRadius: '9999px', cursor: 'pointer',
                  fontSize: '13px', fontWeight: isActive ? 700 : 500,
                  border: `1.5px solid ${isActive ? c : 'rgba(255,255,255,0.08)'}`,
                  background: isActive ? `${c}18` : 'transparent',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.35)',
                  boxShadow: isActive ? `0 0 12px ${c}22` : 'none',
                  transition: 'all 0.2s',
                }}
              >
                {cat}
                <span style={{ marginLeft: '6px', fontSize: '11px', opacity: 0.6 }}>
                  {cat === 'All' ? FAQS.length : FAQS.filter(f => f.cat === cat).length}
                </span>
              </button>
            );
          })}
        </div>

        {/* FAQ list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '64px' }}>
          {filtered.map((item) => (
            <FAQItem
              key={item.q}
              q={item.q}
              a={item.a}
              cta={item.cta as any}
              color={CAT_COLORS[item.cat] ?? '#cc0000'}
            />
          ))}
        </div>

        {/* Plan CTA strip */}
        <div style={{
          padding: '36px 32px', borderRadius: '20px',
          background: 'linear-gradient(135deg, rgba(204,0,0,0.1), rgba(0,0,0,0.5))',
          border: '1px solid rgba(204,0,0,0.2)',
          boxShadow: '0 0 40px rgba(204,0,0,0.08)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>
              Ready to get started?
            </div>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
              Free Forever included. No credit card required.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            {PLAN_CTАС.map(plan => (
              <button
                key={plan.planId}
                type="button"
                className="faq-plan-pill"
                onClick={() => handlePlanCheckout(plan.planId)}
                style={{
                  padding: '14px 12px', borderRadius: '12px', cursor: 'pointer',
                  border: plan.featured ? `1.5px solid ${plan.color}` : '1px solid rgba(255,255,255,0.08)',
                  background: plan.featured ? plan.color : 'rgba(255,255,255,0.04)',
                  color: '#fff', fontWeight: 700, fontSize: '14px',
                  boxShadow: plan.featured ? `0 4px 20px ${plan.color}44` : 'none',
                }}
              >
                <div>{plan.label}</div>
                <div style={{ fontSize: '11px', fontWeight: 500, color: plan.featured ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)', marginTop: '3px' }}>{plan.price}</div>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/signup"
              style={{
                padding: '10px 24px', borderRadius: '9999px',
                background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.1)', textDecoration: 'none',
                fontSize: '13px', fontWeight: 600,
              }}
            >
              Start with Free Forever
            </Link>
            <Link
              href="/contact-sales?context=enterprise"
              style={{
                padding: '10px 24px', borderRadius: '9999px',
                background: 'transparent', color: 'rgba(255,255,255,0.4)',
                border: '1px solid rgba(255,255,255,0.06)', textDecoration: 'none',
                fontSize: '13px', fontWeight: 600,
              }}
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
