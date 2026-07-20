import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { softwareApplicationSchema, webPageSchema, faqSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { FAQSection } from '@/components/seo/FAQSection';
import { PageCTA } from '@/components/seo/PageCTA';

const SLUG = '/multi-location-auto-repair-software';
const TITLE = 'Multi-Location Auto Repair Software — Manage Multiple Shops from One Platform';
const DESCRIPTION =
  'RedlineD1 Business gives multi-location auto repair operations a single platform for managing jobs, technicians, customer records, and owner-level visibility across up to 10 locations.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'feature',
  keywords: [
    'multi-location auto repair software',
    'multi shop management software',
    'auto repair chain software',
    'multiple location mechanic software',
    'automotive franchise software',
    'auto repair branch management',
  ],
  breadcrumbs: [
    { name: 'Home', href: '/' },
    { name: 'Multi-Location Auto Repair Software', href: SLUG },
  ],
});

const FAQS = [
  {
    question: 'How many locations does RedlineD1 support?',
    answer:
      'The Business plan supports up to 10 shop locations under a single account. Each location has its own job board, customer records, and technician roster. The Enterprise plan supports unlimited locations with custom pricing — contact us to discuss your setup.',
  },
  {
    question: 'Can the owner see all locations at once?',
    answer:
      'Yes. Business plan subscribers can view job activity, technician status, and key metrics across all locations from the Command Center — a consolidated operational dashboard built for owners who are not always on-site.',
  },
  {
    question: 'Are customer and vehicle records shared between locations?',
    answer:
      'Customer and vehicle records are accessible across your account. If a customer visits a different location from where they usually go, the full service history is available to the team at that location.',
  },
  {
    question: 'Can I control which staff can see which location?',
    answer:
      'Yes. Role-based access lets you assign technicians and service writers to specific locations. Owner-level accounts have cross-location visibility. Technicians and staff see only the location they are assigned to.',
  },
  {
    question: 'Is multi-location available on lower-tier plans?',
    answer:
      'The Professional plan supports up to 3 locations. The Business plan supports up to 10 locations. Multi-location access is not available on Free, Solo, or Starter plans.',
  },
  {
    question: 'Does RedlineD1 support consolidated billing across locations?',
    answer:
      'Subscription billing is consolidated under a single account for Business plan customers — you pay one bill for the full account. Location-level financial reporting (revenue per location, jobs per location) is available in the Business plan reporting features.',
  },
];

const SCHEMA = [
  softwareApplicationSchema({
    name: 'RedlineD1 — Multi-Location Auto Repair Software',
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

export default function MultiLocationAutoRepairSoftwarePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }} />

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Multi-Location Auto Repair Software', href: SLUG }]} />
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.15, marginBottom: 20, maxWidth: 760 }}>
          Manage Multiple Auto Repair Locations from One Platform
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.65, maxWidth: 680, marginBottom: 12, color: 'var(--muted, #555)' }}>
          When you run more than one shop, your biggest management problem is visibility. RedlineD1 Business gives you one login and one dashboard to see what is happening across all your locations — without calling each manager.
        </p>
        <p style={{ fontSize: 16, marginBottom: 32, color: 'var(--muted, #555)' }}>
          <strong>Business plan: $179/month</strong> ($1,790/year). Up to 10 locations. Unlimited technicians.
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

      {/* Problems */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={h2}>Running multiple shops with per-location software</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { icon: '📊', title: 'No cross-location view', body: 'When your shops use separate tools — or the same tool with separate logins — there is no way to see the full picture without calling each location.' },
              { icon: '👥', title: 'Customer history stays at one location', body: 'A customer who goes to your west location and then comes to your east location looks like a new customer. Staff cannot see what was previously done.' },
              { icon: '🔐', title: 'Access control is manual', body: 'Without role-based access, you either give everyone too much access or not enough. Managers should see their location; owners should see all.' },
              { icon: '📈', title: 'Comparing performance between shops is guesswork', body: 'Without a consolidated view, comparing revenue, job count, or technician output across your locations means exporting spreadsheets manually.' },
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

      {/* Capabilities */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px' }}>
        <h2 style={h2}>What RedlineD1 Business gives multi-location operators</h2>
        <div style={{ display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {[
            { title: 'Up to 10 locations, one account', body: 'Add each shop as a location under your single Business account. Switch between locations from the header without logging in and out.' },
            { title: 'Command Center — owner visibility across all locations', body: 'The Command Center dashboard shows active jobs, open repair orders, and technician status across your entire operation. See the state of every location without calling anyone.' },
            { title: 'Shared customer and vehicle records', body: 'Customer and vehicle history is shared across your account. If a customer goes to a different location, staff can see the complete service history from previous visits at any location.' },
            { title: 'Role-based access control', body: 'Owner accounts see all locations. Managers and technicians see only the location they are assigned to. Assign roles on a per-user basis without workarounds.' },
            { title: 'Location-level job tracking', body: 'Each location has its own job board, repair order list, and technician roster. Jobs are assigned to a location and stay organized within it.' },
            { title: 'AI-powered shop intelligence per location', body: 'The Professional and Business plans include AI-powered recommendations and revenue intelligence. Each location benefits independently while the owner can review patterns across all of them.' },
          ].map(({ title, body }) => (
            <div key={title} style={featureBar}>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</h3>
              <p style={muted}>{body}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, padding: 20, background: 'var(--surface-soft, #f9fafb)', borderRadius: 10, border: '1px solid var(--line, #e5e7eb)', fontSize: 14, color: 'var(--muted, #666)', lineHeight: 1.6 }}>
          <strong>Note on planned features:</strong> Centralized inventory sharing across locations and cross-location job transfers are on the product roadmap and are not yet available. If these are requirements for your operation, contact us to discuss your timeline before subscribing.
        </div>
      </section>

      {/* Plan comparison */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Multi-location plan options</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { name: 'Professional', price: '$99/month', locations: 'Up to 3 locations', techs: 'Up to 8 technicians', ai: 'AI intelligence included' },
              { name: 'Business', price: '$179/month', locations: 'Up to 10 locations', techs: 'Unlimited technicians', ai: 'AI intelligence + priority support' },
              { name: 'Enterprise', price: 'Contact Sales', locations: 'Unlimited locations', techs: 'Unlimited technicians', ai: 'Dedicated account manager' },
            ].map(plan => (
              <div key={plan.name} style={{ ...card, ...(plan.name === 'Business' ? { border: '2px solid var(--accent, #dc2626)' } : {}) }}>
                {plan.name === 'Business' && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent, #dc2626)', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Most popular for multi-location</div>}
                <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>{plan.name}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent, #dc2626)', marginBottom: 16 }}>{plan.price}</div>
                <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, margin: 0 }}>
                  <li>{plan.locations}</li>
                  <li>{plan.techs}</li>
                  <li>{plan.ai}</li>
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Who this is built for</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: 'var(--accent, #dc2626)' }}>Good fit</h3>
            <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, color: 'var(--muted, #555)', margin: 0 }}>
              <li>Independent shop owners with 2–10 locations</li>
              <li>Small regional automotive chains</li>
              <li>Owner-operators who want cross-location visibility</li>
              <li>Operations moving from per-location tools to one platform</li>
            </ul>
          </div>
          <div>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>May not be the right fit</h3>
            <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, color: 'var(--muted, #555)', margin: 0 }}>
              <li>Dealership groups requiring manufacturer DMS integration</li>
              <li>Operations requiring real-time cross-location inventory transfer (on roadmap)</li>
              <li>Franchise systems with mandated software from the franchisor</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Related */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '48px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Related</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { href: '/automotive-business-operating-system', label: 'Automotive Business Operating System', desc: 'How RedlineD1 replaces multiple disconnected tools with one operating system.' },
              { href: '/ai-auto-repair-shop-software', label: 'AI Auto Repair Shop Software', desc: 'AI-powered intelligence for revenue, customer retention, and operations.' },
              { href: '/technician-time-tracking', label: 'Technician Time Tracking', desc: 'Track clock-in, clock-out, and billable hours across all technicians.' },
              { href: '/pricing', label: 'View All Plans', desc: 'Compare Professional, Business, and Enterprise plans.' },
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
        heading="One platform for every location you run"
        subtext="Business plan at $179/month supports up to 10 locations. Start free — no credit card required."
        primaryLabel="Start Free"
        secondaryLabel="See Plans"
        secondaryHref="/pricing"
      />
    </>
  );
}
