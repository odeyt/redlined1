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
