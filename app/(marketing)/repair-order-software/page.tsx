import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { softwareApplicationSchema, webPageSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { FAQSection } from '@/components/seo/FAQSection';
import { PageCTA } from '@/components/seo/PageCTA';

const SLUG = '/repair-order-software';
const TITLE = 'Repair Order Software for Independent Auto Repair Shops';
const DESCRIPTION =
  'RedlineD1 gives independent auto repair shops digital repair orders with technician assignment, status tracking, parts integration, and a complete job history tied to every vehicle.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'feature',
  keywords: [
    'repair order software',
    'auto repair order software',
    'digital repair orders',
    'repair order management',
    'RO software for auto shops',
    'shop management repair orders',
    'auto shop workflow software',
  ],
});

const FAQS = [
  {
    question: 'What is a digital repair order?',
    answer:
      'A digital repair order (RO) is an electronic job record that tracks every aspect of a vehicle service — customer complaint, technician assignment, labor performed, parts used, and the final billing amount. RedlineD1 stores these digitally, tied to the customer and vehicle, so you can search and report on any past job.',
  },
  {
    question: 'Can I assign multiple technicians to one repair order?',
    answer:
      'Yes. Repair orders in RedlineD1 support technician assignment at the labor-line level, so different techs can own different parts of the same job. This is useful for shops where diagnostics and repair are handled by different technicians.',
  },
  {
    question: 'How does RedlineD1 handle "found work" discovered during repair?',
    answer:
      'Technicians can add labor lines and parts to an open repair order as they work. If additional work requires customer approval, you can generate an updated estimate, get approval, and add the approved work to the existing RO.',
  },
  {
    question: 'Can I run repair orders and estimates on the same system?',
    answer:
      'Yes. Estimates and repair orders are linked in RedlineD1. An estimate converts to a repair order on customer approval. The repair order converts to an invoice on completion. All three are stored in the vehicle history.',
  },
  {
    question: 'Does the system track parts inventory against repair orders?',
    answer:
      'Yes. When you add a part to a repair order, it can be deducted from your parts inventory automatically. This keeps stock counts accurate without a separate inventory step.',
  },
];

const SCHEMA = [
  softwareApplicationSchema({
    name: 'RedlineD1 — Repair Order Software',
    description: DESCRIPTION,
  }),
  webPageSchema({ name: TITLE, description: DESCRIPTION, url: absoluteUrl(SLUG) }),
];

export default function RepairOrderSoftwarePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }} />

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Repair Order Software', href: SLUG }]} />
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.15, marginBottom: 20, maxWidth: 760 }}>
          Repair Order Software That Keeps Every Job on Track
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.65, maxWidth: 680, marginBottom: 32, color: 'var(--muted, #555)' }}>
          Paper repair orders get lost, written on twice, or filled out wrong. Digital ROs in
          RedlineD1 stay connected to the customer, the vehicle, and the invoice — so nothing
          falls through the cracks between intake and pickup.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="/signup" style={{ display: 'inline-block', background: 'var(--accent, #dc2626)', color: '#fff', fontWeight: 700, fontSize: 15, padding: '13px 26px', borderRadius: 999, textDecoration: 'none' }}>
            Start Free
          </a>
          <a href="/pricing" style={{ display: 'inline-block', background: 'transparent', color: 'var(--accent, #dc2626)', fontWeight: 600, fontSize: 15, padding: '13px 26px', borderRadius: 999, border: '2px solid var(--accent, #dc2626)', textDecoration: 'none' }}>
            See Plans
          </a>
        </div>
      </section>

      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 32, textAlign: 'center' }}>How paper ROs hurt your shop</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { icon: '📄', title: 'Missing job history', body: 'Paper ROs get filed, lost, or thrown away. When a customer calls about a job from 14 months ago, you have no record.' },
              { icon: '🔀', title: 'Tech miscommunication', body: 'Handwritten instructions on a paper RO get misread. Labor is performed wrong, charged wrong, or skipped.' },
              { icon: '⏱️', title: 'No status visibility', body: 'You can\'t see at a glance which ROs are in progress, waiting for parts, or ready for pickup — unless you walk the floor.' },
              { icon: '🧾', title: 'Duplicate data entry', body: 'Writing the same customer info and labor lines on the RO and then again on the invoice doubles the work and the error rate.' },
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
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 40 }}>What digital ROs give you</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
          {[
            { title: 'Job status at a glance', body: 'Every open repair order shows its current status — open, in progress, waiting for parts, ready for pickup, or closed. No floor walk required.' },
            { title: 'Technician assignment', body: 'Assign labor lines to specific technicians. Each tech can see their assigned jobs from their own view without seeing the whole shop.' },
            { title: 'Parts integration', body: 'Add parts from your inventory or from a quote. Cost and retail price flow through automatically. Stock is updated when the RO closes.' },
            { title: 'Found work workflow', body: 'When a tech discovers additional work, it gets added to the RO with the same estimate-and-approve flow. No more verbal back-and-forth.' },
            { title: 'Estimate-to-RO-to-invoice', body: 'An approved estimate becomes a repair order. A completed repair order becomes an invoice. Each step carries the data forward without re-entry.' },
            { title: 'Searchable job history', body: 'Every completed RO is stored permanently and searchable by customer, vehicle, date range, or RO number. Answer any customer question in seconds.' },
          ].map(({ title, body }) => (
            <div key={title} style={{ paddingLeft: 20, borderLeft: '3px solid var(--accent, #dc2626)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--muted, #666)', margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '48px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Related pages</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { href: '/auto-repair-invoicing-software', label: 'Auto Repair Invoicing Software', desc: 'Close the billing loop from RO to paid invoice.' },
              { href: '/digital-vehicle-inspection-software', label: 'Digital Vehicle Inspection Software', desc: 'DVI that flows into your RO workflow.' },
              { href: '/ai-auto-repair-shop-software', label: 'AI Shop Intelligence', desc: 'Revenue intelligence built on your RO data.' },
              { href: '/resources/repair-order-template', label: 'Free Repair Order Template', desc: 'A repair order template you can use or adapt today.' },
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
        heading="Every job. Every technician. Every detail."
        subtext="Digital repair orders, free to start. No credit card required."
      />
    </>
  );
}
