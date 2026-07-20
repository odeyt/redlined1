import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { softwareApplicationSchema, webPageSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { FAQSection } from '@/components/seo/FAQSection';
import { PageCTA } from '@/components/seo/PageCTA';

const SLUG = '/digital-vehicle-inspection-software';
const TITLE = 'Digital Vehicle Inspection Software That Sells Jobs';
const DESCRIPTION =
  'RedlineD1\'s digital vehicle inspection tool lets technicians capture photos, document findings, and send customers a professional inspection report they can approve from their phone.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'feature',
  keywords: [
    'digital vehicle inspection software',
    'DVI software',
    'vehicle inspection app',
    'auto repair inspection software',
    'digital multi-point inspection',
    'photo vehicle inspection',
    'DVI for auto shops',
  ],
  breadcrumbs: [
    { name: 'Home', href: '/' },
    { name: 'Digital Vehicle Inspection Software', href: SLUG },
  ],
});

const FAQS = [
  {
    question: 'What is digital vehicle inspection software?',
    answer:
      'Digital vehicle inspection (DVI) software replaces paper inspection checklists with a structured digital workflow. Technicians document findings by category — tires, brakes, fluids, lights, etc. — capture photos as evidence, and send a formatted report to the customer. The customer reviews findings and can approve recommended repairs from their phone.',
  },
  {
    question: 'Does the customer need to download an app to view their inspection?',
    answer:
      'No. RedlineD1 sends inspection results via a web link. Customers view the report in their browser — no app install required. The report is formatted clearly with photos, condition ratings, and recommended services.',
  },
  {
    question: 'Can I attach DVI results to a repair order or estimate?',
    answer:
      'Yes. Findings from a digital inspection can flow directly into an estimate. If the customer approves, the estimate becomes the repair order. The inspection record stays attached to the vehicle history.',
  },
  {
    question: 'How many DVIs can I run per month?',
    answer:
      'The Free plan includes 2 DVIs per month. Paid plans start at $24/month and include significantly higher limits. Professional and above plans have no monthly DVI cap.',
  },
  {
    question: 'Can technicians use their own phones for the inspection photos?',
    answer:
      'RedlineD1 works in any mobile browser. Technicians can take photos using the device camera and attach them directly to the inspection within the app — no external photo app or email transfer required.',
  },
];

const SCHEMA = [
  softwareApplicationSchema({
    name: 'RedlineD1 — Digital Vehicle Inspection Software',
    description: DESCRIPTION,
  }),
  webPageSchema({ name: TITLE, description: DESCRIPTION, url: absoluteUrl(SLUG) }),
];

export default function DVISoftwarePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }} />

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'DVI Software', href: SLUG }]} />
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.15, marginBottom: 20, maxWidth: 760 }}>
          Digital Vehicle Inspection Software That Sells Jobs
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.65, maxWidth: 680, marginBottom: 32, color: 'var(--muted, #555)' }}>
          Customers trust what they can see. Replace verbal explanations with photo inspection reports
          they read on their phone — and approve before the wrench turns.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="/signup" style={{ display: 'inline-block', background: 'var(--accent, #dc2626)', color: '#fff', fontWeight: 700, fontSize: 15, padding: '13px 26px', borderRadius: 999, textDecoration: 'none' }}>
            Start Free
          </a>
          <a href="/pricing" style={{ display: 'inline-block', background: 'transparent', color: 'var(--accent, #dc2626)', fontWeight: 600, fontSize: 15, padding: '13px 26px', borderRadius: 999, border: '2px solid var(--accent, #dc2626)', textDecoration: 'none' }}>
            View Pricing
          </a>
        </div>
      </section>

      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 32, textAlign: 'center' }}>
            Why shops still lose jobs they should have won
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { icon: '📝', title: 'Paper checklists prove nothing', body: 'A marked checkbox doesn\'t tell a customer why they need a brake job. A photo of 2mm pads does.' },
              { icon: '📷', title: 'Photos stay on personal phones', body: 'Inspection evidence lives in a technician\'s camera roll, disconnected from the job record and never shared.' },
              { icon: '🤷', title: '"You just want to sell me something"', body: 'Without visible evidence, deferred work feels like upselling. Customers decline and never come back.' },
              { icon: '🔗', title: 'Inspection and estimate are separate', body: 'Writing a separate estimate for every inspection finding doubles the paperwork and creates gaps.' },
            ].map(({ icon, title, body }) => (
              <div key={title} style={{ background: '#fff', borderRadius: 12, padding: 24, border: '1px solid var(--line, #e5e7eb)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
                <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--muted, #666)', margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 40 }}>How it works in RedlineD1</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 720 }}>
          {[
            { step: '1', title: 'Tech opens the DVI from the job card', body: 'Every vehicle that comes in gets an inspection workflow tied to the customer record. The tech works through each category on their device.' },
            { step: '2', title: 'Photos captured at each finding', body: 'For any item flagged as attention or urgent, the tech takes a photo directly from the inspection screen. Photos are stored and linked to that inspection, not the camera roll.' },
            { step: '3', title: 'Inspection report sent to the customer', body: 'The service advisor sends the report as a web link via text or email. The customer sees condition ratings by category, photos for flagged items, and recommended repairs.' },
            { step: '4', title: 'Customer approves — repair order created', body: 'If the customer approves recommended work, it flows into an estimate. Once approved, the estimate converts to a repair order. No re-entry.' },
          ].map(({ step, title, body }) => (
            <div key={step} style={{ display: 'flex', gap: 20 }}>
              <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', background: 'var(--accent, #dc2626)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>{step}</div>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--muted, #666)', margin: 0 }}>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Related tools and resources</h2>
          <p style={{ fontSize: 14, color: 'var(--muted, #666)', marginBottom: 28 }}>Build a complete inspection workflow with these resources.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { href: '/resources/digital-vehicle-inspection-checklist', label: 'Free DVI Checklist', desc: 'A printable multi-point inspection checklist to use as a starting point or handoff guide.' },
              { href: '/auto-repair-invoicing-software', label: 'Auto Repair Invoicing Software', desc: 'Close the loop from inspection approval to invoice in one connected workflow.' },
              { href: '/mobile-mechanic-software', label: 'Mobile Mechanic Software', desc: 'Run DVIs in the field from a phone or tablet.' },
            ].map(({ href, label, desc }) => (
              <a key={href} href={href} style={{ display: 'block', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--line, #e5e7eb)', textDecoration: 'none', color: 'inherit', background: '#fff' }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--accent, #dc2626)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--muted, #666)' }}>{desc}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <FAQSection faqs={FAQS} />
      <PageCTA
        heading="See why photo inspections close more jobs"
        subtext="Free plan includes 2 DVIs per month. No credit card required."
        primaryLabel="Start Free"
        secondaryLabel="View Pricing"
      />
    </>
  );
}
