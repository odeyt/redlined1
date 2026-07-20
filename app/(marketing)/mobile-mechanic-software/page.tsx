import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { softwareApplicationSchema, webPageSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { FAQSection } from '@/components/seo/FAQSection';
import { PageCTA } from '@/components/seo/PageCTA';

const SLUG = '/mobile-mechanic-software';
const TITLE = 'Mobile Mechanic Software Built for Field Work';
const DESCRIPTION =
  'RedlineD1 gives mobile mechanics a complete job management system they can use anywhere — digital job cards, invoicing, VIN lookup, customer history, and payment collection from any device.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'feature',
  keywords: [
    'mobile mechanic software',
    'mobile auto repair software',
    'field mechanic app',
    'mobile mechanic invoicing',
    'mobile mechanic job card',
    'on-site auto repair software',
  ],
  breadcrumbs: [
    { name: 'Home', href: '/' },
    { name: 'Mobile Mechanic Software', href: SLUG },
  ],
});

const FAQS = [
  {
    question: 'Can I use RedlineD1 on my phone or tablet in the field?',
    answer:
      'Yes. RedlineD1 is a web-based platform optimized for mobile browsers. You can access customer records, create job cards, run digital inspections, and generate invoices from any smartphone or tablet without installing a separate app.',
  },
  {
    question: 'How does RedlineD1 help me invoice customers on-site?',
    answer:
      'Once you close a repair order, you can generate and send an invoice directly from RedlineD1. Customers receive a payment link and can pay digitally. You get a complete record of the transaction tied to the vehicle and customer history.',
  },
  {
    question: 'Can I look up parts and labor times in the field?',
    answer:
      'RedlineD1 includes VIN decoding and labor guide integration so you can identify a vehicle and pull time estimates without switching apps. Parts can be added to a job card or estimate on the spot.',
  },
  {
    question: 'Does RedlineD1 work for a solo mobile mechanic or only for shops?',
    answer:
      'RedlineD1 is built to scale from a single mobile mechanic up to a multi-location shop. The Solo plan is designed for exactly this use case — one operator, one login, full workflow.',
  },
  {
    question: 'Can I track customer and vehicle history across visits?',
    answer:
      'Every repair, estimate, and inspection you create is automatically tied to the customer and vehicle record. The next time you show up, you can see the complete service history before you open the hood.',
  },
];

const SCHEMA = [
  softwareApplicationSchema({
    name: 'RedlineD1 — Mobile Mechanic Software',
    description: DESCRIPTION,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
  }),
  webPageSchema({
    name: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl(SLUG),
  }),
];

export default function MobileMechanicSoftwarePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }}
      />

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Mobile Mechanic Software', href: SLUG }]} />
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.15, marginBottom: 20, maxWidth: 760 }}>
          Mobile Mechanic Software Built for Field Work
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.65, maxWidth: 680, marginBottom: 32, color: 'var(--muted, #555)' }}>
          Paper job cards get lost. Handwritten invoices slow you down. RedlineD1 gives you a complete
          job management system you can run from your phone — from the first customer call to the final
          payment, anywhere you work.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="/signup" style={{ display: 'inline-block', background: 'var(--accent, #dc2626)', color: '#fff', fontWeight: 700, fontSize: 15, padding: '13px 26px', borderRadius: 999, textDecoration: 'none' }}>
            Start Free — No Credit Card
          </a>
          <a href="/pricing" style={{ display: 'inline-block', background: 'transparent', color: 'var(--accent, #dc2626)', fontWeight: 600, fontSize: 15, padding: '13px 26px', borderRadius: 999, border: '2px solid var(--accent, #dc2626)', textDecoration: 'none' }}>
            See Plans
          </a>
        </div>
      </section>

      {/* Pain points */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 32, textAlign: 'center' }}>
            The problems every mobile mechanic knows
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {[
              { icon: '📋', title: 'Paper job cards disappear', body: 'Or they get wet, illegible, or lost in the van. Then you\'re calling the customer to reconstruct what you did.' },
              { icon: '📱', title: 'Photos live on your personal phone', body: 'Inspection photos mixed with personal photos, no connection to the job record, no easy way to share with the customer.' },
              { icon: '💸', title: 'Invoicing waits until you\'re home', body: 'Hours after the job, you\'re typing up invoices on a laptop. Customers forget what they agreed to.' },
              { icon: '🔍', title: 'No instant parts or labor lookup', body: 'Calling the parts store mid-job or guessing on labor time because the labor guide is back at the shop.' },
            ].map(({ icon, title, body }) => (
              <div key={title} style={{ background: 'var(--surface, #fff)', borderRadius: 12, padding: 24, border: '1px solid var(--line, #e5e7eb)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
                <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--muted, #666)', margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>What RedlineD1 gives you in the field</h2>
        <p style={{ fontSize: 16, color: 'var(--muted, #666)', marginBottom: 40, lineHeight: 1.6 }}>
          Every feature runs in a mobile browser. No app install required.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28 }}>
          {[
            {
              title: 'Digital job cards',
              body: 'Create a job card at the vehicle, capture the complaint, link it to the customer and VIN, and track status from inspection through close. Everything saved automatically.',
            },
            {
              title: 'Mobile-optimized estimates',
              body: 'Build estimates on the spot using labor guide times and your parts pricing. Email or text to the customer for approval before you touch the vehicle.',
            },
            {
              title: 'Photo digital inspections',
              body: 'Take photos directly from your phone camera and attach them to a DVI report. Customers receive a clear, professional inspection result — not a verbal description.',
            },
            {
              title: 'On-site invoicing and payment',
              body: 'Convert a completed repair order into an invoice and send a payment link before you leave the driveway. Less chasing, faster cash.',
            },
            {
              title: 'VIN decode and vehicle history',
              body: 'Scan or enter a VIN to decode the vehicle and pull complete service history from your database. Know what was done on the last visit before you start.',
            },
            {
              title: 'Parts inventory on the go',
              body: 'Check your stock levels, reserve parts for the job, and log what you used. Keep your parts records accurate without a clipboard.',
            },
          ].map(({ title, body }) => (
            <div key={title} style={{ paddingLeft: 20, borderLeft: '3px solid var(--accent, #dc2626)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--muted, #666)', margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24 }}>Who RedlineD1 is built for</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, color: 'var(--accent, #dc2626)' }}>Good fit</h3>
              <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, color: 'var(--muted, #555)', margin: 0 }}>
                <li>Solo mobile mechanics</li>
                <li>Mobile mechanic operations with 2–5 technicians</li>
                <li>Fleet service contractors</li>
                <li>Shops that run both in-bay and mobile service</li>
                <li>Mechanics who currently use paper or spreadsheets</li>
              </ul>
            </div>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>May not be the right fit</h3>
              <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, color: 'var(--muted, #555)', margin: 0 }}>
                <li>Quick-lube chains requiring proprietary POS integration</li>
                <li>Franchises with mandated software from franchisor</li>
                <li>Dealers requiring manufacturer-specific DMS integration</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Related links */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Related resources</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { href: '/solo-mechanic-shop-software', label: 'Solo Mechanic Shop Software', desc: 'Full workflow for one-person operations — not just mobile jobs.' },
            { href: '/digital-vehicle-inspection-software', label: 'Digital Vehicle Inspection Software', desc: 'How photo-based DVIs increase customer approvals.' },
            { href: '/auto-repair-invoicing-software', label: 'Auto Repair Invoicing Software', desc: 'Estimate to invoice in one connected workflow.' },
            { href: '/tools/labor-rate-calculator', label: 'Labor Rate Calculator', desc: 'Calculate your break-even and target labor rate.' },
            { href: '/resources/digital-vehicle-inspection-checklist', label: 'Free DVI Checklist', desc: 'A complete inspection checklist you can use in the field today.' },
          ].map(({ href, label, desc }) => (
            <a key={href} href={href} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 10, border: '1px solid var(--line, #e5e7eb)', textDecoration: 'none', color: 'inherit' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--accent, #dc2626)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--muted, #666)' }}>{desc}</div>
              </div>
            </a>
          ))}
        </div>
      </section>

      <FAQSection faqs={FAQS} />
      <PageCTA
        heading="Run your mobile mechanic business from your phone"
        subtext="Free Forever plan available. No credit card needed. Upgrade when you grow."
        primaryLabel="Start Free"
        secondaryLabel="See Pricing"
        secondaryHref="/pricing"
      />
    </>
  );
}
