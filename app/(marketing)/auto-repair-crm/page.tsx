import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { softwareApplicationSchema, webPageSchema, faqSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { FAQSection } from '@/components/seo/FAQSection';
import { PageCTA } from '@/components/seo/PageCTA';

const SLUG = '/auto-repair-crm';
const TITLE = 'Auto Repair CRM — Customer and Vehicle Relationship Management';
const DESCRIPTION =
  'RedlineD1 keeps complete customer profiles, full vehicle service history, declined repair tracking, and follow-up records in one place — so you can build lasting customer relationships from a real shop workflow.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'feature',
  keywords: [
    'auto repair CRM',
    'automotive CRM software',
    'repair shop customer management',
    'auto repair customer database',
    'mechanic shop customer tracking',
    'vehicle history software',
  ],
  breadcrumbs: [
    { name: 'Home', href: '/' },
    { name: 'Auto Repair CRM', href: SLUG },
  ],
});

const FAQS = [
  {
    question: 'What customer information does RedlineD1 track?',
    answer:
      'RedlineD1 stores customer contact details, their complete vehicle roster, every estimate and repair order, all digital inspection reports, any declined service items, and communication notes. Everything is linked to the customer record and searchable.',
  },
  {
    question: 'Does RedlineD1 track vehicle service history?',
    answer:
      'Yes. Every vehicle has a detailed history showing every job performed, every estimate created, every inspection conducted, and any recommended work the customer declined. This history is visible the moment you pull up a vehicle — before the customer tells you why they came in.',
  },
  {
    question: 'Can I track work that the customer declined?',
    answer:
      'Yes. When a customer does not approve a recommended service item, that item is saved to the vehicle record as declined. The next time that vehicle comes in, the declined work surfaces automatically so you can revisit it at the right moment — without relying on memory.',
  },
  {
    question: 'Can customers see their own vehicle history?',
    answer:
      'Yes. The customer portal gives customers access to their vehicle records, completed inspections, and service history through a secure, shareable link. It requires no login from the customer and works on any device.',
  },
  {
    question: 'Does RedlineD1 include marketing automation or bulk SMS campaigns?',
    answer:
      'RedlineD1 supports individual job-related communications: sending estimates, sharing inspection results, and invoice delivery. Bulk marketing campaigns and automated SMS broadcast features are not included in the current platform.',
  },
  {
    question: 'How is a CRM different from just having a customer list?',
    answer:
      'A customer list gives you names and phone numbers. A CRM connects the customer to every vehicle, every job, every declined repair, and the full timeline of the relationship. In a repair shop, the vehicle is as important as the customer — RedlineD1 tracks both.',
  },
];

const SCHEMA = [
  softwareApplicationSchema({
    name: 'RedlineD1 — Auto Repair CRM',
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

export default function AutoRepairCrmPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }} />

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Auto Repair CRM', href: SLUG }]} />
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.15, marginBottom: 20, maxWidth: 760 }}>
          Know Every Customer, Every Vehicle, Every Visit
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.65, maxWidth: 680, marginBottom: 12, color: 'var(--muted, #555)' }}>
          A customer relationship in a repair shop is built through vehicles, jobs, and trust earned over time. RedlineD1 keeps the complete record — estimates, repairs, declined work, and inspection history — attached to every customer and vehicle.
        </p>
        <p style={{ fontSize: 16, marginBottom: 32, color: 'var(--muted, #555)' }}>
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

      {/* Pain points */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={h2}>The customer knowledge problem in most shops</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { icon: '🧠', title: 'Customer history lives in the owner\'s head', body: 'When you or a trusted employee leaves, the customer relationship leaves with them. There is no system to hand over.' },
              { icon: '📋', title: 'Declined work gets forgotten', body: 'You recommended tires three visits ago. The customer said not yet. You have no way to know that unless you wrote it on a sticky note that is long gone.' },
              { icon: '🔄', title: 'Repeat customers feel like strangers', body: 'When a customer comes back, staff should already know their vehicle, their history, and what is coming due — not have to ask the customer to remind them.' },
              { icon: '🔗', title: 'Customer and vehicle records are not connected', body: 'A list of customers and a separate list of vehicles with no linking means you cannot pull up a vehicle and know who owns it or what has been done to it.' },
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

      {/* Features */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px' }}>
        <h2 style={h2}>Customer and vehicle relationship features in RedlineD1</h2>
        <div style={{ display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {[
            { title: 'Customer profiles with full vehicle roster', body: 'Each customer record holds all their vehicles. Each vehicle holds all its jobs, estimates, inspections, and declined service items. The relationship is fully connected.' },
            { title: 'Complete service history per vehicle', body: 'Pull up any vehicle and see every job ever performed, every estimate created, every inspection conducted, and every recommended item the customer did or did not approve.' },
            { title: 'Declined repair tracking', body: 'Items the customer declines are saved to the vehicle record. The next visit, they surface automatically. You can revisit without relying on memory or notes.' },
            { title: 'Customer portal access', body: 'Share a secure link with the customer. They can view their vehicle service history, completed inspections, and repair records from any device without logging in.' },
            { title: 'Estimate and repair history', body: 'Every estimate, approved or declined, is stored. Every completed repair order is archived. You can pull up what was done years ago without searching physical files.' },
            { title: 'AI-powered customer intelligence (Professional+)', body: 'On Professional and above, RedlineD1 analyzes customer and vehicle patterns to surface retention risks, upcoming service opportunities, and revenue gaps you might otherwise miss.' },
          ].map(({ title, body }) => (
            <div key={title} style={featureBar}>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</h3>
              <p style={muted}>{body}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, padding: 20, background: 'var(--surface-soft, #f9fafb)', borderRadius: 10, border: '1px solid var(--line, #e5e7eb)', fontSize: 14, color: 'var(--muted, #666)', lineHeight: 1.6 }}>
          <strong>Not included:</strong> RedlineD1 does not include bulk SMS campaigns, automated email drip sequences, or third-party marketing automation integrations. Individual job communications (estimate links, inspection shares, invoice delivery) are supported.
        </div>
      </section>

      {/* Who it's for */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Who this is built for</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: 'var(--accent, #dc2626)' }}>Good fit</h3>
              <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, color: 'var(--muted, #555)', margin: 0 }}>
                <li>Shops that want all customer and vehicle data in one place</li>
                <li>Operations building a loyal repeat-customer base</li>
                <li>Shops that want to track declined work systematically</li>
                <li>Shops that want to share vehicle history with customers</li>
              </ul>
            </div>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>May not be the right fit</h3>
              <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, color: 'var(--muted, #555)', margin: 0 }}>
                <li>Shops that need bulk SMS or email marketing campaigns</li>
                <li>Operations that need external CRM (Salesforce, HubSpot) integration</li>
                <li>Fleet operators needing multi-vehicle contract billing</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Related */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Related</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { href: '/repair-order-software', label: 'Repair Order Software', desc: 'How repair orders connect to customer and vehicle records.' },
            { href: '/digital-vehicle-inspection-software', label: 'Digital Vehicle Inspection Software', desc: 'Share inspection results directly with the customer through their portal.' },
            { href: '/tools/missed-revenue-calculator', label: 'Missed Revenue Calculator', desc: 'Estimate how much revenue you lose from lapsed customers every month.' },
            { href: '/ai-auto-repair-shop-software', label: 'AI Auto Repair Shop Software', desc: 'AI-powered customer retention and revenue intelligence on Professional plans.' },
          ].map(({ href, label, desc }) => (
            <a key={href} href={href} style={{ display: 'flex', gap: 12, padding: '14px 16px', borderRadius: 10, border: '1px solid var(--line, #e5e7eb)', textDecoration: 'none', color: 'inherit' }}>
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
        heading="Build customer relationships that bring people back"
        subtext="Free Forever plan available. Full customer and vehicle history on every plan."
        primaryLabel="Start Free"
        secondaryLabel="See Pricing"
        secondaryHref="/pricing"
      />
    </>
  );
}
