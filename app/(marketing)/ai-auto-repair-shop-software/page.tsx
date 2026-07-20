import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { softwareApplicationSchema, webPageSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { FAQSection } from '@/components/seo/FAQSection';
import { PageCTA } from '@/components/seo/PageCTA';

const SLUG = '/ai-auto-repair-shop-software';
const TITLE = 'AI for Auto Repair Shops That Actually Helps You Run the Business';
const DESCRIPTION =
  'RedlineD1 uses AI to identify revenue leakage, surface lapsed customers, score opportunities, and deliver daily shop intelligence — so shop owners spend less time analyzing data and more time fixing cars.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'feature',
  keywords: [
    'AI auto repair shop software',
    'automotive AI software',
    'shop intelligence software',
    'AI repair shop management',
    'auto repair revenue intelligence',
    'shop analytics AI',
    'automotive business intelligence',
  ],
});

const FAQS = [
  {
    question: 'What does the AI actually do in RedlineD1?',
    answer:
      'The AI in RedlineD1 analyzes your repair history, customer patterns, and shop activity to surface specific insights. This includes identifying customers who are overdue for a visit, flagging vehicles with unresolved findings from past inspections, scoring revenue opportunities, and generating a morning brief for the shop owner with prioritized actions for the day.',
  },
  {
    question: 'Is this AI for generating marketing copy, or does it affect how I run the shop?',
    answer:
      'The intelligence in RedlineD1 is operational, not decorative. It works from your actual repair orders, inspections, estimates, and customer history to identify specific, actionable gaps in your business — not generic suggestions.',
  },
  {
    question: 'Does the AI replace my service advisors?',
    answer:
      'No. RedlineD1\'s AI surfaces information that helps your advisors do their jobs better. It identifies which customers to call, which vehicles have deferred work, and which jobs have unusual margins — but humans make all the decisions and have all the customer conversations.',
  },
  {
    question: 'How does the revenue leakage detection work?',
    answer:
      'RedlineD1 compares repair history, inspection findings, and customer return patterns to identify gaps. If a customer approved a repair but hasn\'t returned for the follow-up service, or if a recurring service interval has been missed, the intelligence engine flags it as a revenue opportunity rather than treating it as closed.',
  },
  {
    question: 'What is the Morning Brief?',
    answer:
      'The Morning Brief is a daily AI-generated summary delivered to the shop owner or manager. It includes today\'s open jobs, priority customer follow-ups, vehicles with urgent deferred work, and shop performance signals from the prior period. It is designed to give a clear operational picture in under two minutes.',
  },
];

const SCHEMA = [
  softwareApplicationSchema({
    name: 'RedlineD1 — AI Auto Repair Shop Software',
    description: DESCRIPTION,
  }),
  webPageSchema({ name: TITLE, description: DESCRIPTION, url: absoluteUrl(SLUG) }),
];

export default function AISoftwarePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }} />

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'AI Shop Software', href: SLUG }]} />
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.15, marginBottom: 20, maxWidth: 760 }}>
          AI That Finds the Revenue Your Shop Is Already Leaving on the Table
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.65, maxWidth: 680, marginBottom: 32, color: 'var(--muted, #555)' }}>
          Most shop management software records what happened. RedlineD1\'s intelligence engine
          analyzes that history, identifies gaps, scores opportunities, and gives you a clear
          daily picture of where the money went — and how to get it back.
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
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>
            What most shops never know
          </h2>
          <p style={{ fontSize: 16, color: 'var(--muted, #666)', textAlign: 'center', maxWidth: 600, margin: '0 auto 36px' }}>
            Because the data is there — it just lives in old repair orders, inspection sheets, and
            customer records that no one has time to analyze.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { icon: '🔍', title: 'Which customers went quiet', body: 'Customers who were regular visitors and suddenly stopped. Not lost — just not followed up with. Each one is a recoverable relationship.' },
              { icon: '🗂️', title: 'Deferred work that was never pursued', body: 'Inspection findings that were documented, approved for future work, and then never scheduled. That\'s real revenue sitting in the system.' },
              { icon: '📉', title: 'Jobs with thin margins', body: 'Labor lines that consistently come in under the estimate, or parts marked up inconsistently. Patterns that cost money but are invisible job by job.' },
              { icon: '📅', title: 'Service intervals quietly expiring', body: 'Oil changes, timing belts, and brake service intervals passing without a follow-up. Every missed interval is a visit that went somewhere else.' },
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
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 40 }}>The RedlineD1 intelligence engine</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
          {[
            { title: 'Command Center', body: 'A shop-owner dashboard showing active jobs, priority alerts, customer opportunities, and today\'s key metrics — in one view, not scattered across tabs.' },
            { title: 'Morning Brief', body: 'A daily AI-generated operational summary delivered to the owner or manager. Open jobs, customer follow-ups, and shop performance signals in under two minutes.' },
            { title: 'Revenue leakage detection', body: 'The system identifies specific instances where revenue was missed — deferred work that was never scheduled, intervals that passed, or jobs closed below estimate.' },
            { title: 'Customer opportunity scoring', body: 'Each customer in your database is scored for return likelihood, service opportunity, and potential value. Prioritize outreach to the highest-value lapsed customers first.' },
            { title: 'Vehicle intelligence', body: 'Service history, inspection findings, and known issues are tracked per vehicle across every visit. When the same vehicle comes in, your team has the complete picture.' },
            { title: 'Repair intelligence', body: 'AI-assisted repair suggestions based on vehicle history, reported symptoms, and known patterns. Helps service advisors and technicians surface related issues faster.' },
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
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Related tools</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { href: '/tools/missed-revenue-calculator', label: 'Missed Revenue Calculator', desc: 'Estimate the revenue impact of lapsed customers at your shop.' },
              { href: '/tools/labor-rate-calculator', label: 'Labor Rate Calculator', desc: 'Make sure your labor rate covers your actual costs.' },
              { href: '/repair-order-software', label: 'Repair Order Software', desc: 'The operational data the intelligence engine runs on.' },
              { href: '/pricing', label: 'Pricing', desc: 'AI intelligence is included in Professional and above plans.' },
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
        heading="Your shop data is already there. Let it work for you."
        subtext="AI intelligence included in Professional and above plans. Start free."
        primaryLabel="Start Free"
        secondaryLabel="View Pricing"
      />
    </>
  );
}
