import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { softwareApplicationSchema, webPageSchema, faqSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { FAQSection } from '@/components/seo/FAQSection';
import { PageCTA } from '@/components/seo/PageCTA';

const SLUG = '/auto-repair-estimate-software';
const TITLE = 'Auto Repair Estimate Software — Build, Send, and Convert Estimates';
const DESCRIPTION =
  'RedlineD1 helps auto repair shops build professional estimates with labor and parts line items, get customer authorization, and convert approved estimates into repair orders in one step.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'feature',
  keywords: [
    'auto repair estimate software',
    'automotive estimating software',
    'mechanic estimate software',
    'repair shop quoting software',
    'auto repair estimate tool',
    'digital auto repair estimate',
  ],
  breadcrumbs: [
    { name: 'Home', href: '/' },
    { name: 'Auto Repair Estimate Software', href: SLUG },
  ],
});

const FAQS = [
  {
    question: 'What is the difference between an estimate, a repair order, and an invoice?',
    answer:
      'An estimate is a priced proposal sent to the customer before work begins — it requires their approval. A repair order is the active work document once the customer authorizes the job; it tracks labor, parts, and technician assignments. An invoice is generated when the job is complete and payment is due. RedlineD1 moves jobs through all three stages in a single connected workflow.',
  },
  {
    question: 'Can the customer authorize an estimate digitally?',
    answer:
      'Yes. Once you build an estimate, you can send it to the customer as a shareable link. They can review the work and approve it from their phone without needing to call in or come to the shop.',
  },
  {
    question: 'What happens to declined work?',
    answer:
      'Declined repair items are tracked on the vehicle record. The next time that vehicle comes in, the declined work surfaces automatically so you can revisit it with the customer — without relying on memory or paper notes.',
  },
  {
    question: 'Can I convert an estimate directly into a repair order?',
    answer:
      'Yes. Once a customer approves an estimate, you convert it to a repair order in one click. All line items, labor times, and parts carry over. No re-entering data.',
  },
  {
    question: 'Does RedlineD1 include a labor guide?',
    answer:
      'RedlineD1 includes labor guide integration for time estimates. You can also enter custom labor times when the standard guide does not apply to a specific job.',
  },
  {
    question: 'Can I track how many of my estimates convert to approved jobs?',
    answer:
      'Yes. RedlineD1 records estimate status (pending, approved, declined, partially approved) so you can review your approval rate over time and see which types of work customers decline most often.',
  },
];

const SCHEMA = [
  softwareApplicationSchema({
    name: 'RedlineD1 — Auto Repair Estimate Software',
    description: DESCRIPTION,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
  }),
  webPageSchema({
    name: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl(SLUG),
  }),
  faqSchema(FAQS),
];

const h2: React.CSSProperties = { fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 700, marginBottom: 24 };
const card: React.CSSProperties = { background: 'var(--surface, #fff)', borderRadius: 12, padding: 24, border: '1px solid var(--line, #e5e7eb)' };
const featureBar: React.CSSProperties = { paddingLeft: 20, borderLeft: '3px solid var(--accent, #dc2626)' };
const muted: React.CSSProperties = { fontSize: 14, lineHeight: 1.65, color: 'var(--muted, #666)', margin: 0 };

export default function AutoRepairEstimateSoftwarePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }} />

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Auto Repair Estimate Software', href: SLUG }]} />
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.15, marginBottom: 20, maxWidth: 760 }}>
          Auto Repair Estimate Software Built for Shop Owners
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.65, maxWidth: 680, marginBottom: 12, color: 'var(--muted, #555)' }}>
          Estimates that go out fast, get approved digitally, and flow directly into repair orders and invoices — no copy-paste, no double data entry.
        </p>
        <p style={{ fontSize: 16, lineHeight: 1.6, maxWidth: 680, marginBottom: 32, color: 'var(--muted, #555)' }}>
          Available on every RedlineD1 plan, including Free Forever.
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

      {/* The estimate workflow problem */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={h2}>Why estimates break down in most shops</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { icon: '📋', title: 'Written on paper, lost in a drawer', body: 'Paper estimates get lost, smudge, or end up on the floor of the bay. The customer\'s copy and your copy never match.' },
              { icon: '📞', title: 'Approvals happen verbally', body: 'Verbal approvals leave no record. When a customer disputes work later, you have nothing to point to.' },
              { icon: '🔁', title: 'Rekeying data into invoices', body: 'Retyping labor and parts from an estimate into an invoice wastes time and introduces errors that damage trust.' },
              { icon: '🗑️', title: 'Declined work is forgotten', body: 'You recommended a brake job three visits ago. The customer said not now. You have no way to remember unless you wrote it somewhere — and it\'s probably not where you can find it.' },
            ].map(({ icon, title, body }) => (
              <div key={title} style={card}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
                <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</h3>
                <p style={muted}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Estimate workflow */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px' }}>
        <h2 style={h2}>The estimate-to-invoice workflow in RedlineD1</h2>
        <p style={{ fontSize: 16, color: 'var(--muted, #666)', marginBottom: 40, lineHeight: 1.6 }}>
          Every estimate starts a connected job record. Nothing gets lost, rekeyed, or forgotten.
        </p>
        <div style={{ display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {[
            {
              step: '01', title: 'Build the estimate',
              body: 'Add labor line items with times from the labor guide or your own rates. Add parts with markup. Write a clear customer-facing description of each item.',
            },
            {
              step: '02', title: 'Send for customer authorization',
              body: 'Share a link with the customer. They review itemized work on their phone and authorize or decline each item. No phone tag needed.',
            },
            {
              step: '03', title: 'Convert to repair order in one click',
              body: 'Approved items carry forward to a repair order with all labor and parts intact. Assign to a technician and track status through the bay.',
            },
            {
              step: '04', title: 'Track declined work',
              body: 'Items the customer declined stay attached to the vehicle record. The next visit, RedlineD1 shows you what was previously declined so you can follow up at the right time.',
            },
            {
              step: '05', title: 'Close out to invoice',
              body: 'When the job is complete, convert the repair order to an invoice with one action. Send to the customer with a payment link. Record is complete.',
            },
            {
              step: '06', title: 'Review estimate approvals over time',
              body: 'See which types of work get approved and which get declined most often. Use that data to adjust how you present recommendations.',
            },
          ].map(({ step, title, body }) => (
            <div key={step} style={featureBar}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent, #dc2626)', marginBottom: 6, letterSpacing: '0.05em' }}>{step}</div>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</h3>
              <p style={muted}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24 }}>Who this is built for</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, color: 'var(--accent, #dc2626)' }}>Good fit</h3>
              <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, color: 'var(--muted, #555)', margin: 0 }}>
                <li>Independent shops replacing paper or whiteboard estimates</li>
                <li>Mobile mechanics who need to estimate on-site</li>
                <li>Shops that want digital customer authorization records</li>
                <li>Owners who want to track declined work across visits</li>
                <li>Shops tired of rekeying estimate data into invoices</li>
              </ul>
            </div>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>May not be the right fit</h3>
              <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, color: 'var(--muted, #555)', margin: 0 }}>
                <li>Dealerships requiring OEM-specific estimating DMS</li>
                <li>Body shops needing photo-based collision estimating tools</li>
                <li>Shops that require insurance adjuster integration</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Related links */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Related</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { href: '/repair-order-software', label: 'Repair Order Software', desc: 'Manage active jobs from estimate approval to completion.' },
            { href: '/auto-repair-invoicing-software', label: 'Auto Repair Invoicing Software', desc: 'Convert completed repair orders into professional invoices.' },
            { href: '/digital-vehicle-inspection-software', label: 'Digital Vehicle Inspection Software', desc: 'Turn inspection findings directly into estimate line items.' },
            { href: '/resources/repair-order-template', label: 'Free Repair Order Template', desc: 'A printable repair order form to use before going digital.' },
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
        heading="Send your first digital estimate in minutes"
        subtext="Free Forever plan available. No credit card needed. Estimates, repair orders, and invoices in one workflow."
        primaryLabel="Start Free"
        secondaryLabel="See Pricing"
        secondaryHref="/pricing"
      />
    </>
  );
}
