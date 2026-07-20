import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { webPageSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { PricingSection } from '@/components/marketing/PricingSection';
import { FAQSection } from '@/components/seo/FAQSection';

const SLUG = '/pricing';
const TITLE = 'Pricing — RedlineD1';
const DESCRIPTION =
  'RedlineD1 offers a Free Forever plan for shops just getting started, plus paid plans from $24/month for Solo mechanics up to Business and Enterprise for multi-location operations.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'pricing',
  keywords: ['auto repair shop software pricing', 'RedlineD1 plans', 'shop management software cost'],
});

const FAQS = [
  {
    question: 'Is there a free trial?',
    answer:
      'RedlineD1 offers a Free Forever plan — no credit card required and no time limit. It includes core shop management features with usage limits appropriate for shops just getting started. Paid plans are available when you need higher limits.',
  },
  {
    question: 'Can I upgrade or downgrade my plan?',
    answer:
      'Yes. You can upgrade at any time. If you downgrade, your shop moves to the lower plan at the next billing cycle. You keep access to your data on any plan.',
  },
  {
    question: 'What happens to my data if I cancel?',
    answer:
      'Your data remains in the system. Canceling a paid plan downgrades you to the Free Forever plan. You retain access to your customer records, vehicle history, and completed job records.',
  },
  {
    question: 'Do you offer annual billing?',
    answer:
      'Yes. Annual billing is available and offers a discount compared to monthly billing. You can see the annual pricing on each plan card.',
  },
  {
    question: 'Is the Business plan right for a multi-location shop?',
    answer:
      'The Business plan supports up to 10 locations. For larger operations or enterprise customers, contact us about the Enterprise plan which includes custom pricing, dedicated support, and expanded capacity.',
  },
];

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            webPageSchema({ name: TITLE, description: DESCRIPTION, url: absoluteUrl(SLUG) }),
          ),
        }}
      />

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '56px 24px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 800, lineHeight: 1.15, marginBottom: 16 }}>
          Simple pricing that scales with your shop
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.6, color: 'var(--muted, #555)', maxWidth: 560, margin: '0 auto 8px' }}>
          Start free. Upgrade when you need it. No contracts.
        </p>
      </section>

      <PricingSection />

      <FAQSection faqs={FAQS} heading="Pricing FAQ" />
    </>
  );
}
