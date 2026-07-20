'use client';

import { useState } from 'react';
import { faqSchema } from '@/lib/seo/schema';

export interface FAQItem {
  question: string;
  answer: string;
}

interface Props {
  faqs: FAQItem[];
  heading?: string;
}

export function FAQSection({ faqs, heading = 'Frequently Asked Questions' }: Props) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section style={{ maxWidth: 820, margin: '0 auto', padding: '60px 24px' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faqs)) }}
      />
      <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 32, textAlign: 'center' }}>{heading}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {faqs.map((faq, i) => (
          <div
            key={i}
            style={{
              borderRadius: 10,
              border: '1px solid var(--line, #e5e7eb)',
              background: open === i ? 'var(--surface-soft, #f9fafb)' : 'var(--surface, #fff)',
              overflow: 'hidden',
              transition: 'background .15s',
            }}
          >
            <button
              aria-expanded={open === i}
              onClick={() => setOpen(open === i ? null : i)}
              style={{
                width: '100%', textAlign: 'left', background: 'none', border: 'none',
                padding: '18px 20px', cursor: 'pointer', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center', gap: 16,
                fontWeight: 600, fontSize: 15, lineHeight: 1.4,
              }}
            >
              <span>{faq.question}</span>
              <span style={{ flexShrink: 0, fontSize: 20, fontWeight: 400, color: 'var(--muted, #888)' }}>
                {open === i ? '−' : '+'}
              </span>
            </button>
            {open === i && (
              <div style={{ padding: '0 20px 18px', fontSize: 14, lineHeight: 1.7, color: 'var(--muted, #555)' }}>
                {faq.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
