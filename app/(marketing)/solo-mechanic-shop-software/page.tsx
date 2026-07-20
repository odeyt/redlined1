import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { softwareApplicationSchema, webPageSchema, faqSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { FAQSection } from '@/components/seo/FAQSection';
import { PageCTA } from '@/components/seo/PageCTA';

const SLUG = '/solo-mechanic-shop-software';
const TITLE = 'Solo Mechanic Shop Software — One Person, Full Workflow';
const DESCRIPTION =
  'RedlineD1 Solo gives independent mechanics a complete job management system for $24 per month. Customer intake, estimates, repair orders, invoices, and vehicle history — without staff complexity or enterprise bloat.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'feature',
  keywords: [
    'solo mechanic shop software',
    'independent mechanic software',
    'one person auto repair software',
    'small shop management software',
    'solo auto repair shop software',
    'mechanic software for one person',
  ],
  breadcrumbs: [
    { name: 'Home', href: '/' },
    { name: 'Solo Mechanic Shop Software', href: SLUG },
  ],
});

const FAQS = [
  {
    question: 'What does the Solo plan include?',
    answer:
      'The Solo plan at $24 per month ($240 per year) gives one operator access to the full job workflow: customer intake, estimates, repair orders, invoicing, digital vehicle inspections, VIN decoding, and vehicle history. It is designed for a single owner-operator and includes one user login and one location.',
  },
  {
    question: 'Is there a free plan available?',
    answer:
      'Yes. The Free Forever plan lets you run the complete workflow with no credit card required. It has lower usage limits than Solo but is a real, functional plan — not a time-limited trial.',
  },
  {
    question: 'Can I use RedlineD1 on my phone while working in the bay?',
    answer:
      'Yes. RedlineD1 is a web application that runs in any mobile browser. You can create job cards, look up vehicles by VIN, attach inspection photos, and send invoices from your phone without installing a separate app.',
  },
  {
    question: 'Do I need to hire staff to use this software?',
    answer:
      'No. The Solo plan is built for a single operator. You are the customer intake, the technician, and the invoicing desk. The workflow reflects that — you can move a job through every stage by yourself without needing to assign it to other users.',
  },
  {
    question: 'What happens if I want to add a helper or second technician later?',
    answer:
      'You can upgrade to a higher-tier plan at any time. The Starter plan at $49 per month adds a second user account. Professional at $99 per month supports up to eight technicians.',
  },
  {
    question: 'Does the Solo plan include AI features?',
    answer:
      'AI-powered shop intelligence is available on the Professional plan and above. The Solo plan covers the core job management workflow: estimates, repair orders, invoices, and vehicle history.',
  },
];

const SCHEMA = [
  softwareApplicationSchema({
    name: 'RedlineD1 — Solo Mechanic Shop Software',
    description: DESCRIPTION,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
  }),
  webPageSchema({ name: TITLE, description: DESCRIPTION, url: absoluteUrl(SLUG) }),
  faqSchema(FAQS),
];

const h2: React.CSSProperties = { fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 700, marginBottom: 24 };
const card: React.CSSProperties = { background: 'var(--surface, #fff)', borderRadius: 12, padding: 24, border: '1px solid var(--line, #e5e7eb)' };
const featureBar: React.CSSProperties = { paddingLeft: 20, borderLeft: '3px solid var(--accent, #dc2626)' };
const muted: React.CSSProperties = { fontSize: 14, lineHeight: 1.65, color: 'var(--muted, #666)', margin: 0 };

export default function SoloMechanicShopSoftwarePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }} />

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Solo Mechanic Shop Software', href: SLUG }]} />
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.15, marginBottom: 20, maxWidth: 760 }}>
          Shop Software Built for One Person Running the Whole Operation
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.65, maxWidth: 680, marginBottom: 12, color: 'var(--muted, #555)' }}>
          When you are the owner, the mechanic, and the front desk — you need software that keeps up with you, not the other way around.
        </p>
        <p style={{ fontSize: 16, marginBottom: 32, color: 'var(--muted, #555)' }}>
          <strong>Solo plan: $24/month</strong> ($240/year). One login. Full workflow. No staff required.
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
          <h2 style={h2}>Running a solo shop without the right tools</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { icon: '📝', title: 'Every job is tracked in your head', body: 'Or in a notebook. Or on the back of a receipt. When you have six jobs open at once, something always gets forgotten.' },
              { icon: '💰', title: 'Invoicing takes twice as long as it should', body: 'You write up the work, then write it again on an invoice. Or you send a generic bank transfer with no record attached.' },
              { icon: '🔍', title: 'Customer history lives in your memory', body: 'When a customer comes back for the third time, you may not remember what you did last year or what work they declined.' },
              { icon: '📱', title: 'Software built for big shops does not fit you', body: 'Most shop management software is priced and designed for multi-bay operations with a service writer and multiple technicians. You are one person.' },
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

      {/* Daily workflow */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px' }}>
        <h2 style={h2}>Your daily workflow in RedlineD1</h2>
        <div style={{ display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {[
            { title: 'Customer intake', body: 'Add the customer and vehicle record when they call or drop in. VIN decode fills in the year, make, model, and engine automatically. Notes and customer concerns are captured before you forget them.' },
            { title: 'Quick estimates', body: 'Build an estimate with labor and parts line items. Send it to the customer as a shareable link so they can authorize work before you start. No phone tag. No verbal disputes later.' },
            { title: 'Repair order tracking', body: 'Once a customer approves an estimate, open the repair order. Track the status as you work — from intake through diagnosis, parts on order, in progress, and ready.' },
            { title: 'Digital vehicle inspections', body: 'Walk around the vehicle, note conditions, and attach photos. Share the inspection report with the customer to explain what you found and why you recommend additional work.' },
            { title: 'Invoice and close', body: 'When the job is done, convert to an invoice in one click. Send it with a payment link. The record is saved to the customer and vehicle automatically.' },
            { title: 'Vehicle history on every return visit', body: 'Pull up any vehicle and see every job, estimate, inspection, and declined service item. Be prepared before the customer finishes parking.' },
          ].map(({ title, body }) => (
            <div key={title} style={featureBar}>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</h3>
              <p style={muted}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Plan callout */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Solo plan — what you get</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <div style={card}>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent, #dc2626)', marginBottom: 4 }}>$24<span style={{ fontSize: 16, fontWeight: 600 }}>/month</span></div>
              <div style={{ fontSize: 14, color: 'var(--muted, #666)', marginBottom: 16 }}>or $240/year (save ~17%)</div>
              <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, margin: 0 }}>
                <li>1 operator login</li>
                <li>1 shop location</li>
                <li>Unlimited customers and vehicles</li>
                <li>Up to 200 completed jobs per month</li>
                <li>Digital vehicle inspections</li>
                <li>Estimates, repair orders, invoices</li>
                <li>VIN decoding</li>
                <li>Email support</li>
              </ul>
            </div>
            <div style={{ ...card, background: 'var(--surface-soft, #f9fafb)' }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Also available</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700 }}>Free Forever</div>
                <div style={{ fontSize: 13, color: 'var(--muted, #666)', lineHeight: 1.6 }}>Start at $0 with no time limit. Lower usage caps apply — great for getting started before you commit to a paid plan.</div>
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>Professional — $99/month</div>
                <div style={{ fontSize: 13, color: 'var(--muted, #666)', lineHeight: 1.6 }}>When you add helpers, the Professional plan supports up to 8 technicians plus AI-powered shop intelligence.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Who this is for</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: 'var(--accent, #dc2626)' }}>Good fit</h3>
            <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, color: 'var(--muted, #555)', margin: 0 }}>
              <li>Independent mechanics working alone</li>
              <li>Mobile mechanics who run their own operation</li>
              <li>Shops transitioning from paper to digital</li>
              <li>Mechanics who want to look more professional to customers</li>
            </ul>
          </div>
          <div>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>May not be the right fit</h3>
            <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, color: 'var(--muted, #555)', margin: 0 }}>
              <li>Shops that need multiple technician accounts</li>
              <li>Operations requiring multi-location management</li>
              <li>Shops that require AI-assisted service recommendations</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Related */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '48px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Related resources</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { href: '/mobile-mechanic-software', label: 'Mobile Mechanic Software', desc: 'Run jobs in the field from your phone — the mobile-specific workflow.' },
              { href: '/auto-repair-estimate-software', label: 'Auto Repair Estimate Software', desc: 'How estimates, repair orders, and invoices work in one connected flow.' },
              { href: '/tools/labor-rate-calculator', label: 'Labor Rate Calculator', desc: 'Calculate the rate you need to cover costs and hit your profit target.' },
              { href: '/pricing', label: 'View All Plans', desc: 'Compare Solo, Starter, Professional, and Business plans.' },
            ].map(({ href, label, desc }) => (
              <a key={href} href={href} style={{ display: 'flex', gap: 12, padding: '14px 16px', borderRadius: 10, border: '1px solid var(--line, #e5e7eb)', textDecoration: 'none', color: 'inherit', background: 'var(--surface, #fff)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--accent, #dc2626)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted, #666)' }}>{desc}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <FAQSection faqs={FAQS} />
      <PageCTA
        heading="Run your whole shop from one screen"
        subtext="Solo plan at $24/month. Free Forever plan available with no credit card required."
        primaryLabel="Start Free"
        secondaryLabel="See Plans"
        secondaryHref="/pricing"
      />
    </>
  );
}
