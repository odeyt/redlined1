import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { softwareApplicationSchema, webPageSchema, faqSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { FAQSection } from '@/components/seo/FAQSection';
import { PageCTA } from '@/components/seo/PageCTA';

const SLUG = '/automotive-business-operating-system';
const TITLE = 'Automotive Business Operating System — RedlineD1';
const DESCRIPTION =
  'RedlineD1 is an automotive business operating system — not just a CRM, not just an invoicing tool, not just a DVI app. It connects repair operations, customer records, technician workflows, business intelligence, and AI guidance in one platform built inside a real shop.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'feature',
  keywords: [
    'automotive business operating system',
    'auto repair shop management system',
    'all-in-one auto repair software',
    'shop management platform',
    'automotive shop software platform',
    'repair shop business software',
  ],
  breadcrumbs: [
    { name: 'Home', href: '/' },
    { name: 'Automotive Business Operating System', href: SLUG },
  ],
});

const FAQS = [
  {
    question: 'What is an automotive business operating system?',
    answer:
      'An operating system for a repair business is a single platform that replaces the collection of disconnected tools most shops use — one app for estimates, another for invoicing, a spreadsheet for inventory, a notebook for inspections. An operating system connects all of those functions in one workflow, so data flows from customer intake through job completion without being rekeyed or lost.',
  },
  {
    question: 'How is RedlineD1 different from a basic invoicing app?',
    answer:
      'An invoicing app generates invoices. An operating system manages the entire workflow that produces them — estimates, customer authorizations, technician assignments, digital inspections, parts tracking, time tracking, and business intelligence. RedlineD1 starts where invoicing apps stop.',
  },
  {
    question: 'How is RedlineD1 different from a CRM?',
    answer:
      'A CRM manages customer contact information and communication history. RedlineD1 does that too — but it also manages the vehicles, the jobs, the inspections, the technician workflows, the inventory, and the business metrics that give the customer relationship context. In a repair shop, the vehicle is as central as the customer.',
  },
  {
    question: 'Is the AI available on all plans?',
    answer:
      'AI-powered shop intelligence — including revenue recommendations, customer retention analysis, and operational guidance — is available on Professional plan and above. The Professional plan starts at $99 per month. Core workflow features (estimates, repair orders, invoices, inspections) are available on all plans including Free Forever.',
  },
  {
    question: 'What makes RedlineD1 different from other shop management platforms?',
    answer:
      'RedlineD1 was built inside D1 Imports, a two-location repair operation in Laos. It is not a product built by people who have studied the industry — it is a product built by people who run a shop every day. That context shapes every design decision.',
  },
  {
    question: 'Can RedlineD1 replace all my current tools?',
    answer:
      'For most independent shops, yes. RedlineD1 covers estimates, repair orders, invoices, digital vehicle inspections, customer and vehicle records, technician assignments, time tracking, parts inventory, and business intelligence. If you are currently using separate apps for each of these, you can consolidate into one platform.',
  },
];

const SCHEMA = [
  softwareApplicationSchema({
    name: 'RedlineD1 — Automotive Business Operating System',
    description: DESCRIPTION,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
  }),
  webPageSchema({ name: TITLE, description: DESCRIPTION, url: absoluteUrl(SLUG) }),
  faqSchema(FAQS),
];

const h2: React.CSSProperties = { fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 700, marginBottom: 24 };
const muted: React.CSSProperties = { fontSize: 14, lineHeight: 1.65, color: 'var(--muted, #666)', margin: 0 };

export default function AutomotiveBusinessOperatingSystemPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }} />

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Automotive Business Operating System', href: SLUG }]} />
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.15, marginBottom: 20, maxWidth: 800 }}>
          One Platform for Every Part of Running an Auto Repair Business
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.65, maxWidth: 680, marginBottom: 16, color: 'var(--muted, #555)' }}>
          Most shops run on five or six disconnected tools. RedlineD1 is an automotive business operating system — one platform that connects repair operations, customer records, technician workflows, inventory, and business intelligence into a single, coherent workflow.
        </p>
        <p style={{ fontSize: 16, marginBottom: 32, color: 'var(--muted, #555)' }}>
          Built inside a real repair shop. Used daily by the people who built it.
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

      {/* The fragmentation problem */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={h2}>What most shops are actually running on</h2>
          <p style={{ fontSize: 16, color: 'var(--muted, #666)', marginBottom: 32, maxWidth: 680, lineHeight: 1.6 }}>
            Independent shops piece together their operations from a collection of tools that do not talk to each other. Each one solves one problem and creates two handoff problems.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {[
              'Invoicing app that does not know about your jobs',
              'Separate estimating tool with its own customer list',
              'Paper inspections or a basic DVI app',
              'Whiteboard or sticky notes for technician dispatch',
              'Spreadsheet for inventory',
              'Text messages for customer follow-up',
            ].map(item => (
              <div key={item} style={{ background: 'var(--surface, #fff)', borderRadius: 10, padding: '16px 20px', border: '1px solid var(--line, #e5e7eb)', fontSize: 14, color: 'var(--muted, #666)', lineHeight: 1.5 }}>
                {item}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 16, color: 'var(--muted, #666)', marginTop: 32, maxWidth: 680, lineHeight: 1.6 }}>
            Every handoff between these tools is a place where data gets rekeyed, errors get introduced, and jobs fall through the cracks.
          </p>
        </div>
      </section>

      {/* What an OS covers */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px' }}>
        <h2 style={h2}>What the RedlineD1 operating system covers</h2>
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {[
            {
              category: 'Shop operations',
              items: [
                'Repair orders — from intake to close',
                'Estimates with customer digital authorization',
                'Invoicing and payment links',
                'Technician assignment and job status',
              ],
            },
            {
              category: 'Customer and vehicle records',
              items: [
                'Customer profiles with full vehicle roster',
                'Complete vehicle service history',
                'Declined repair tracking per vehicle',
                'Customer portal for self-service history review',
              ],
            },
            {
              category: 'Inspection and intake',
              items: [
                'Digital vehicle inspections with photos',
                'Customer-facing inspection reports',
                'Inspection to estimate conversion',
                'VIN decoding and vehicle lookup',
              ],
            },
            {
              category: 'Technician workflows',
              items: [
                'Technician assignment per job',
                'Clock-in and clock-out time tracking',
                'Job-linked time entries',
                'Billable hours visibility',
              ],
            },
            {
              category: 'Business intelligence (Professional+)',
              items: [
                'AI-powered revenue recommendations',
                'Customer retention risk alerts',
                'Revenue leakage identification',
                'Operational efficiency insights',
              ],
            },
            {
              category: 'Multi-location (Business+)',
              items: [
                'Up to 10 locations under one account',
                'Cross-location customer and vehicle records',
                'Command Center owner dashboard',
                'Role-based access by location',
              ],
            },
          ].map(({ category, items }) => (
            <div key={category} style={{ background: 'var(--surface, #fff)', borderRadius: 12, padding: 24, border: '1px solid var(--line, #e5e7eb)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 12, marginBottom: 12, color: 'var(--accent, #dc2626)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{category}</h3>
              <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, margin: 0 }}>
                {items.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* OS vs single-function tools */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <h2 style={h2}>Operating system vs. single-function tool</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 500 }}>
              <thead>
                <tr style={{ background: 'var(--surface, #fff)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--line, #e5e7eb)', fontWeight: 700 }}>What you need</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--line, #e5e7eb)', fontWeight: 700 }}>Single-function tool</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid var(--line, #e5e7eb)', fontWeight: 700, color: 'var(--accent, #dc2626)' }}>RedlineD1</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Customer history linked to jobs', 'Separate CRM', '✓ Included'],
                  ['Estimates that become repair orders', 'Manual copy-paste', '✓ One click'],
                  ['DVI that feeds estimate line items', 'Separate app, manual transfer', '✓ Connected workflow'],
                  ['Time tracking attached to jobs', 'Separate time app', '✓ Built in'],
                  ['Invoice from closed RO', 'Re-enter in invoicing app', '✓ One click'],
                  ['Declined work surfaced next visit', 'Memory or sticky notes', '✓ Automatic'],
                  ['Owner cross-location visibility', 'Log in/out of each location', '✓ Command Center'],
                  ['AI operational guidance', 'Not available', '✓ Professional+'],
                ].map(([need, singleTool, rd]) => (
                  <tr key={need} style={{ borderBottom: '1px solid var(--line, #e5e7eb)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 500 }}>{need}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted, #666)' }}>{singleTool}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--accent, #dc2626)', fontWeight: 600 }}>{rd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Related */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Explore the platform</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {[
            { href: '/ai-auto-repair-shop-software', label: 'AI Auto Repair Shop Software', desc: 'AI intelligence layer on Professional and above.' },
            { href: '/repair-order-software', label: 'Repair Order Software', desc: 'The operational core of the platform.' },
            { href: '/digital-vehicle-inspection-software', label: 'DVI Software', desc: 'Photo-based inspections connected to estimates.' },
            { href: '/technician-time-tracking', label: 'Technician Time Tracking', desc: 'Clock-in, clock-out, and efficiency data.' },
            { href: '/auto-repair-crm', label: 'Auto Repair CRM', desc: 'Customer profiles and vehicle history.' },
            { href: '/multi-location-auto-repair-software', label: 'Multi-Location Support', desc: 'Run multiple shops from one account.' },
          ].map(({ href, label, desc }) => (
            <a key={href} href={href} style={{ display: 'block', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--line, #e5e7eb)', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--accent, #dc2626)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, color: 'var(--muted, #666)' }}>{desc}</div>
            </a>
          ))}
        </div>
      </section>

      <FAQSection faqs={FAQS} />
      <PageCTA
        heading="Replace five tools with one"
        subtext="Free Forever plan available. No credit card required. Built in a real shop, used in a real shop every day."
        primaryLabel="Start Free"
        secondaryLabel="See Plans"
        secondaryHref="/pricing"
      />
    </>
  );
}
