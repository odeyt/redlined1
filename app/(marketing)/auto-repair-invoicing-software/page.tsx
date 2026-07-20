import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { softwareApplicationSchema, webPageSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { FAQSection } from '@/components/seo/FAQSection';
import { PageCTA } from '@/components/seo/PageCTA';

const SLUG = '/auto-repair-invoicing-software';
const TITLE = 'Auto Repair Invoicing Software';
const DESCRIPTION =
  'RedlineD1 connects estimates, repair orders, and invoices in one workflow. Write estimates with labor guide data, convert to ROs on approval, and invoice with digital payment links — no re-keying.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'feature',
  keywords: [
    'auto repair invoicing software',
    'auto repair invoice app',
    'shop invoicing software',
    'repair order invoicing',
    'automotive billing software',
    'mechanic invoice software',
    'estimate to invoice auto repair',
  ],
});

const FAQS = [
  {
    question: 'Can I send digital invoices and accept payment online?',
    answer:
      'Yes. Once a repair order is closed, RedlineD1 generates an invoice that can be sent to the customer as a web link. Customers can pay online and you receive a payment record tied to the job.',
  },
  {
    question: 'Does RedlineD1 include labor guide times?',
    answer:
      'RedlineD1 includes labor guide integration so you can look up standard labor times when building estimates and repair orders. This helps you price accurately and consistently without manually calculating every job.',
  },
  {
    question: 'Can I convert an estimate to a repair order automatically?',
    answer:
      'Yes. When a customer approves an estimate, it converts to a repair order in one step. Labor lines, parts, and notes carry over — no duplicate entry.',
  },
  {
    question: 'Does it track parts costs and markup?',
    answer:
      'Parts can be added to estimates and repair orders with cost price, markup percentage, and retail price. Your margin is calculated automatically. Parts used are deducted from inventory if you track stock.',
  },
  {
    question: 'How do I handle multiple currencies?',
    answer:
      'RedlineD1 supports multiple currencies including USD and THB. Currency is set at the shop level. Invoices display in your shop\'s configured currency.',
  },
];

const SCHEMA = [
  softwareApplicationSchema({
    name: 'RedlineD1 — Auto Repair Invoicing Software',
    description: DESCRIPTION,
  }),
  webPageSchema({ name: TITLE, description: DESCRIPTION, url: absoluteUrl(SLUG) }),
];

export default function InvoicingSoftwarePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }} />

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Auto Repair Invoicing Software', href: SLUG }]} />
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.15, marginBottom: 20, maxWidth: 760 }}>
          Auto Repair Invoicing That Moves at the Speed of Your Shop
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.65, maxWidth: 680, marginBottom: 32, color: 'var(--muted, #555)' }}>
          Estimate → repair order → invoice → paid. One connected workflow without re-entering
          customer info, labor lines, or parts. RedlineD1 keeps the billing process moving so
          your shop does too.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="/signup" style={{ display: 'inline-block', background: 'var(--accent, #dc2626)', color: '#fff', fontWeight: 700, fontSize: 15, padding: '13px 26px', borderRadius: 999, textDecoration: 'none' }}>
            Start Free
          </a>
          <a href="/pricing" style={{ display: 'inline-block', background: 'transparent', color: 'var(--accent, #dc2626)', fontWeight: 600, fontSize: 15, padding: '13px 26px', borderRadius: 999, border: '2px solid var(--accent, #dc2626)', textDecoration: 'none' }}>
            View Plans
          </a>
        </div>
      </section>

      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 32, textAlign: 'center' }}>What breaks in shops that manage billing manually</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { icon: '✍️', title: 'Handwritten invoices get disputed', body: 'Illegible or incomplete handwritten invoices create customer disputes and make bookkeeping a nightmare.' },
              { icon: '🔁', title: 'Data entered two or three times', body: 'Customer info goes on the estimate, then again on the RO, then again on the invoice. Every entry is a chance for error.' },
              { icon: '📞', title: 'Chasing payments by phone', body: 'Without a digital payment link, you\'re following up by phone, waiting for customers to remember, or driving back.' },
              { icon: '📁', title: 'No searchable history', body: 'Paper files can\'t answer "what did I charge this customer 18 months ago?" — but your customers will ask.' },
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
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 40 }}>The complete estimate-to-invoice workflow</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
          {[
            { title: 'Professional estimates', body: 'Build itemized estimates with labor guide times and parts pricing. Send to customers for digital approval before work starts.' },
            { title: 'Repair orders with technician assignment', body: 'Approved estimates become repair orders automatically. Assign technicians, add found work, and track job status from intake to completion.' },
            { title: 'Parts tracking with markup', body: 'Add parts at cost, set your markup, and the retail price calculates automatically. Parts usage ties to inventory so your stock counts stay current.' },
            { title: 'Invoice generation', body: 'Close a repair order and RedlineD1 generates a formatted invoice. Send it as a digital link for payment or print it for the customer at pickup.' },
            { title: 'Payment records', body: 'Record payments against invoices and maintain a clear transaction history tied to the customer and vehicle. Useful for accounting export and dispute resolution.' },
            { title: 'Complete job history', body: 'Every estimate, repair order, and invoice is saved to the vehicle record. The next time this customer comes in, you have the full history in seconds.' },
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
              { href: '/auto-repair-estimate-software', label: 'Auto Repair Estimate Software', desc: 'Estimates that turn into repair orders that turn into invoices.' },
              { href: '/repair-order-software', label: 'Repair Order Software', desc: 'Manage the full repair workflow from intake to close.' },
              { href: '/digital-vehicle-inspection-software', label: 'Digital Vehicle Inspection Software', desc: 'Inspections that connect to your invoicing workflow.' },
              { href: '/tools/missed-revenue-calculator', label: 'Missed Revenue Calculator', desc: 'See how much revenue lapsed customers represent.' },
              { href: '/pricing', label: 'Pricing', desc: 'Free plan available. Paid plans start at $24/month.' },
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
        heading="Stop re-entering data. Start getting paid faster."
        subtext="Free Forever plan. No credit card. Upgrade when you're ready."
      />
    </>
  );
}
