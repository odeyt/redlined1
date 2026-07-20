import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { softwareApplicationSchema, webPageSchema, faqSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { FAQSection } from '@/components/seo/FAQSection';
import { PageCTA } from '@/components/seo/PageCTA';

const SLUG = '/technician-time-tracking';
const TITLE = 'Technician Time Tracking for Auto Repair Shops';
const DESCRIPTION =
  'RedlineD1 gives auto repair shops built-in technician time tracking — clock-in, clock-out, job assignment, elapsed time, and billable-hours visibility — so you can see where time goes and improve efficiency without a separate app.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'feature',
  keywords: [
    'technician time tracking auto repair',
    'mechanic time tracking software',
    'auto repair shop time tracking',
    'technician clock in clock out software',
    'billable hours tracking auto repair',
    'technician productivity tracking',
  ],
  breadcrumbs: [
    { name: 'Home', href: '/' },
    { name: 'Technician Time Tracking', href: SLUG },
  ],
});

const FAQS = [
  {
    question: 'Does RedlineD1 support clock-in and clock-out for technicians?',
    answer:
      'Yes. RedlineD1 includes built-in time tracking with clock-in and clock-out. Technicians log in to start a time entry, link it to a job card or repair order, and clock out when the work is complete. Elapsed time is tracked live and stored as part of the job record.',
  },
  {
    question: 'Can I see how many billable hours each technician produces?',
    answer:
      'Yes. The time tracking module shows clocked hours per technician alongside the jobs they were assigned. You can filter by date — today, this week, or all time — and see who is working, for how long, and on which jobs.',
  },
  {
    question: 'What is technician efficiency rate?',
    answer:
      'Efficiency rate is the percentage of a technician\'s clocked hours that are billed to customers. A technician who clocks 40 hours but only bills 32 hours runs at 80% efficiency. The gap is absorbed by comebacks, waiting, and non-billable time. Most well-run shops target 80–90%.',
  },
  {
    question: 'Is there a calculator I can use to understand my shop\'s efficiency?',
    answer:
      'Yes. The Technician Efficiency Calculator lets you enter your current billed hours and clocked hours, then shows you your efficiency rate and how much annual revenue you could recover by improving it.',
  },
  {
    question: 'Which plan includes time tracking?',
    answer:
      'Clock-in and clock-out time tracking is available to all paid plan subscribers. Detailed efficiency reporting and cross-technician analytics are included on Professional and above.',
  },
  {
    question: 'Can technicians add notes to a time entry?',
    answer:
      'Yes. When clocking in, a technician can add the job card number, repair order reference, and optional notes. This creates a complete time record that is linked to the job rather than floating as a standalone entry.',
  },
];

const SCHEMA = [
  softwareApplicationSchema({
    name: 'RedlineD1 — Technician Time Tracking',
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

export default function TechnicianTimeTrackingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }} />

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Technician Time Tracking', href: SLUG }]} />
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.15, marginBottom: 20, maxWidth: 760 }}>
          Technician Time Tracking Built Into Your Shop Workflow
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.65, maxWidth: 680, marginBottom: 12, color: 'var(--muted, #555)' }}>
          Most shops lose revenue through unbillable technician time — not because technicians are slow, but because no one is measuring where the time actually goes. RedlineD1 includes clock-in, clock-out, and job-linked time tracking as part of the core platform.
        </p>
        <p style={{ fontSize: 16, marginBottom: 32, color: 'var(--muted, #555)' }}>
          Available on all paid RedlineD1 plans.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="/signup" style={{ display: 'inline-block', background: 'var(--accent, #dc2626)', color: '#fff', fontWeight: 700, fontSize: 15, padding: '13px 26px', borderRadius: 999, textDecoration: 'none' }}>
            Start Free
          </a>
          <a href="/tools/technician-efficiency-calculator" style={{ display: 'inline-block', background: 'transparent', color: 'var(--accent, #dc2626)', fontWeight: 600, fontSize: 15, padding: '13px 26px', borderRadius: 999, border: '2px solid var(--accent, #dc2626)', textDecoration: 'none' }}>
            Try the Efficiency Calculator
          </a>
        </div>
      </section>

      {/* The problem */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '56px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={h2}>Why shops lose money on unbillable technician time</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { icon: '⏱️', title: 'No measurement, no improvement', body: 'If you do not know how many hours your technicians are billing versus clocking, you have no way to know if the shop is running efficiently or hemorrhaging time.' },
              { icon: '🔄', title: 'Comebacks eat hours silently', body: 'Rework on a job that was not done right the first time costs labor without generating revenue. Without time tracking, this never shows up as a problem until it is too late.' },
              { icon: '⏳', title: 'Waiting time gets lost in the payroll', body: 'Time spent waiting for parts, for approval, or for a bay to open is clocked time that is not billable. Without data, you cannot identify or address it.' },
              { icon: '📊', title: 'Performance conversations need data', body: 'Telling a technician they need to be more productive is not actionable. Showing them their billed hours versus clocked hours is.' },
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
        <h2 style={h2}>What RedlineD1 tracks</h2>
        <div style={{ display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {[
            { title: 'Clock-in and clock-out per technician', body: 'Technicians log in, enter their name and optionally a job card reference, and clock in. The system records start time. When the job is done, they clock out. Elapsed time is calculated automatically.' },
            { title: 'Job-linked time entries', body: 'Each time entry can be linked to a specific job card or repair order number. This connects time data directly to the jobs you are running, making it easy to see which jobs consumed the most time.' },
            { title: 'Live elapsed time display', body: 'The time tracking view shows all open time entries with a live elapsed counter. At a glance, you can see who is currently clocked in and how long they have been on a job.' },
            { title: 'Technician roster and assignment', body: 'The platform pulls from your registered technician list. Assign specific technicians to jobs and track their time against those assignments for a complete picture.' },
            { title: 'Date-range filtering', body: 'Filter time entries by today, this week, or all time. Quickly see the output from a shift, a week, or a pay period without exporting data to a spreadsheet.' },
            { title: 'Notes per time entry', body: 'Technicians can add notes when clocking in — what they are working on, what they need, or anything relevant to the job record. Notes stay attached to the time entry.' },
          ].map(({ title, body }) => (
            <div key={title} style={featureBar}>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</h3>
              <p style={muted}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Calculator CTA */}
      <section style={{ background: 'var(--surface-soft, #f9fafb)', padding: '48px 24px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Find out what your efficiency gap is costing you</h2>
          <p style={{ fontSize: 16, color: 'var(--muted, #666)', marginBottom: 24, lineHeight: 1.6 }}>
            Enter your current billed hours, labor rate, and team size. The Technician Efficiency Calculator shows you the annual revenue difference between your current efficiency rate and a realistic 85% target.
          </p>
          <a href="/tools/technician-efficiency-calculator" style={{ display: 'inline-block', background: 'var(--accent, #dc2626)', color: '#fff', fontWeight: 700, fontSize: 15, padding: '13px 28px', borderRadius: 999, textDecoration: 'none' }}>
            Open the Efficiency Calculator →
          </a>
        </div>
      </section>

      {/* Who it's for */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Who this is built for</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: 'var(--accent, #dc2626)' }}>Good fit</h3>
            <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, color: 'var(--muted, #555)', margin: 0 }}>
              <li>Shop owners who want to measure technician output</li>
              <li>Managers who need to have performance conversations backed by data</li>
              <li>Shops with multiple technicians where time accountability matters</li>
              <li>Owners trying to identify where unbillable time is being lost</li>
            </ul>
          </div>
          <div>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>May not be the right fit</h3>
            <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 2, color: 'var(--muted, #555)', margin: 0 }}>
              <li>Solo mechanics who are both the owner and the only technician</li>
              <li>Shops that need certified payroll integration for union reporting</li>
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
              { href: '/tools/technician-efficiency-calculator', label: 'Technician Efficiency Calculator', desc: 'Calculate your current efficiency rate and annual revenue gap vs 85% target.' },
              { href: '/repair-order-software', label: 'Repair Order Software', desc: 'Assign jobs to technicians and track status through the bay.' },
              { href: '/ai-auto-repair-shop-software', label: 'AI Auto Repair Shop Software', desc: 'AI-powered recommendations for technician productivity and shop operations.' },
              { href: '/digital-vehicle-inspection-software', label: 'Digital Vehicle Inspection Software', desc: 'Reduce comeback time with documented inspections before work begins.' },
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
        heading="See exactly where your technician hours go"
        subtext="Built-in time tracking on all paid plans. Start free — no credit card required."
        primaryLabel="Start Free"
        secondaryLabel="Try Efficiency Calculator"
        secondaryHref="/tools/technician-efficiency-calculator"
      />
    </>
  );
}
