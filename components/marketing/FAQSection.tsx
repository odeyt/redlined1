'use client';

import { useId, useState } from 'react';
import { colors, container, h2Style } from './theme';

const FAQS = [
  {
    q: 'Is RedlineD1 ready for a real shop today?',
    a: "Yes - it's built and used inside an active two-location repair business. Some intelligence features are still expanding; see the Product Evolution section for what's available now versus rolling out.",
  },
  {
    q: 'Do I need a credit card to start my trial?',
    a: 'The 7-day trial is designed to be a no-risk evaluation. Billing activation is handled separately by our team before any charge occurs.',
  },
  {
    q: 'Can I import my existing data?',
    a: 'Parts and inventory data can be imported today via CSV/Excel. Full-shop migration support is expanding - see the Migration section.',
  },
  {
    q: 'Is there a native mobile app?',
    a: 'RedlineD1 is a mobile-ready, installable web app (PWA) today. Native iOS/Android apps are on the roadmap, not yet available.',
  },
  {
    q: "How does RedlineD1's AI work?",
    a: 'It surfaces evidence-based recommendations - what happened, why it matters, what to do - and never replaces technician judgment or hides its reasoning.',
  },
  {
    q: 'Can I run more than one shop location?',
    a: 'Yes, multi-location data mirroring is available today.',
  },
  {
    q: "What if I decide RedlineD1 isn't the right fit?",
    a: 'You can export your data and cancel at any time. Contact our team for help.',
  },
  {
    q: 'What is a Digital Vehicle Inspection in RedlineD1?',
    a: 'A Digital Vehicle Inspection (DVI) lets technicians record vehicle-condition findings item by item — rating each as Pass, Attention, Fail, or N/A — and attach photos and notes to any item. The completed inspection is linked to the customer and vehicle record, and can be shared with the customer as a professional report.',
  },
  {
    q: 'Can technicians complete inspections from a phone?',
    a: 'Yes. RedlineD1 is a responsive, installable web application that works on phones, tablets, and computers. Technicians can complete the full inspection checklist, attach photos, and send the report from any device.',
  },
  {
    q: 'Can inspection findings be connected to an estimate?',
    a: 'Yes. Once an inspection is marked complete, there is a direct button to create an estimate — the customer and vehicle details carry over. An AI-assisted estimate draft from inspection findings is also available.',
  },
  {
    q: 'Can customers approve or decline repairs online?',
    a: 'Yes. Generating a share link creates a secure customer-facing inspection report. Customers can review findings, photos, and technician notes, then approve or decline each recommended repair individually. Their name serves as a timestamped digital approval recorded in the inspection record.',
  },
  {
    q: 'Are inspection photos and records saved permanently?',
    a: 'Yes. Every inspection is linked to the customer and vehicle record. Photos are stored in the shop\'s secure account. Completed inspections remain part of the vehicle\'s service history for future reference.',
  },
  {
    q: 'Is DVI useful for mobile mechanics?',
    a: 'Yes. Mobile mechanics can perform structured vehicle inspections at the customer\'s location, record findings and capture photos from their phone, share the report via link, and maintain a professional inspection history — all without a physical shop.',
  },
  {
    q: 'Do I need a physical shop address to use RedlineD1?',
    a: 'No. RedlineD1 works entirely from a phone, tablet, or laptop. There is no requirement for a fixed shop location — mobile mechanics can create jobs, send estimates, and invoice customers from any location.',
  },
  {
    q: 'Can I create and send estimates from my phone at a job site?',
    a: "Yes. Estimates are built and sent directly from the app — you can add parts, labor, and notes on the spot and send the estimate to the customer before you leave the driveway. The customer receives a digital copy immediately.",
  },
  {
    q: 'How does scheduling work for mobile mechanics?',
    a: "You can create and manage job cards with customer addresses directly in the app. Route-ready scheduling — showing the day's jobs with locations and priority — is available now. Turn-by-turn navigation integrations are on the roadmap.",
  },
  {
    q: 'Can I take customer payment on-site?',
    a: "Yes. You can record cash payments and mark invoices paid on the spot from your phone. Digital payment collection (card-on-file, links) is on the roadmap and not yet shipped.",
  },
  {
    q: 'What if I work alone — is there a plan for a solo mechanic?',
    a: "Yes. The Solo plan ($24/month) is designed for individual mechanics. It includes all core job management, estimating, invoicing, and customer history features with no seat minimums.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
      <h3 style={{ margin: 0 }}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            minHeight: '56px',
            padding: '16px 4px',
            background: 'transparent',
            border: 'none',
            textAlign: 'left',
            fontSize: '15px',
            fontWeight: 500,
            color: colors.textMain,
            cursor: 'pointer',
          }}
        >
          {q}
          <span aria-hidden="true" className="rd1-faq-chevron" style={{ color: colors.textMuted, flexShrink: 0 }}>&#9662;</span>
        </button>
      </h3>
      {open && (
        <div id={panelId} role="region" style={{ padding: '0 4px 20px' }}>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: colors.textMuted, margin: 0 }}>{a}</p>
        </div>
      )}
    </div>
  );
}

/** FAQSection - accessible disclosure pattern (button + aria-expanded/aria-controls). */
export function FAQSection() {
  return (
    <section id="faq" style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: colors.surfaceBg }}>
      <div style={{ ...container, maxWidth: '760px' }}>
        <h2 style={{ ...h2Style, marginBottom: '24px' }}>Frequently asked questions</h2>
        <div>
          {FAQS.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </div>
    </section>
  );
}
