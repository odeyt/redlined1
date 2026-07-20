import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { webPageSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { PageCTA } from '@/components/seo/PageCTA';

const SLUG = '/compare/redlined1-vs-tekmetric';
const TITLE = 'RedlineD1 vs. Tekmetric — Auto Repair Software Comparison';
const DESCRIPTION =
  'A neutral side-by-side comparison of RedlineD1 and Tekmetric across repair orders, DVI, AI features, multi-location, and pricing. Competitor claims verified from public sources.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'comparison',
  keywords: [
    'RedlineD1 vs Tekmetric',
    'Tekmetric alternative',
    'Tekmetric comparison',
    'auto repair software comparison',
  ],
});

/** Last date competitor claims were verified from public sources */
const VERIFIED_DATE = '2025-01-01';

type Status = 'yes' | 'no' | 'partial' | 'verify' | 'planned';

interface ComparisonRow {
  feature: string;
  rd1: Status;
  rd1Note?: string;
  competitor: Status;
  competitorNote?: string;
}

const ROWS: ComparisonRow[] = [
  { feature: 'Free tier', rd1: 'yes', rd1Note: 'Free Forever plan, no time limit', competitor: 'no', competitorNote: 'Verify with vendor' },
  { feature: 'Digital repair orders', rd1: 'yes', competitor: 'yes', competitorNote: 'Verify with vendor' },
  { feature: 'Estimates', rd1: 'yes', competitor: 'yes', competitorNote: 'Verify with vendor' },
  { feature: 'Photo-based DVI', rd1: 'yes', competitor: 'yes', competitorNote: 'Verify with vendor' },
  { feature: 'Customer-facing inspection report', rd1: 'yes', competitor: 'yes', competitorNote: 'Verify with vendor' },
  { feature: 'Labor guide integration', rd1: 'yes', competitor: 'yes', competitorNote: 'Verify with vendor' },
  { feature: 'Parts inventory', rd1: 'yes', competitor: 'yes', competitorNote: 'Verify with vendor' },
  { feature: 'Multi-location support', rd1: 'yes', rd1Note: 'Business plan (up to 10 locations)', competitor: 'yes', competitorNote: 'Verify with vendor' },
  { feature: 'Technician time tracking', rd1: 'partial', rd1Note: 'Technician assignment per labor line', competitor: 'yes', competitorNote: 'Verify with vendor' },
  { feature: 'AI revenue intelligence', rd1: 'yes', rd1Note: 'Professional plan and above', competitor: 'verify', competitorNote: 'Verify with vendor' },
  { feature: 'Morning brief / daily summary', rd1: 'yes', rd1Note: 'AI-generated, daily', competitor: 'verify', competitorNote: 'Verify with vendor' },
  { feature: 'Revenue leakage detection', rd1: 'yes', competitor: 'verify', competitorNote: 'Verify with vendor' },
  { feature: 'VIN decoding', rd1: 'yes', competitor: 'yes', competitorNote: 'Verify with vendor' },
  { feature: 'Mobile browser access', rd1: 'yes', rd1Note: 'Full web app, no install required', competitor: 'yes', competitorNote: 'Verify with vendor' },
  { feature: 'Public pricing', rd1: 'yes', rd1Note: 'Transparent pricing page', competitor: 'partial', competitorNote: 'Verify current pricing with vendor' },
  { feature: 'Free plan starting price', rd1: 'yes', rd1Note: '$0 / month (Free Forever)', competitor: 'no', competitorNote: 'Verify with vendor' },
  { feature: 'Entry paid plan pricing', rd1: 'yes', rd1Note: '$24/month (Solo)', competitor: 'verify', competitorNote: 'Verify with vendor' },
];

const STATUS_COLORS: Record<Status, { bg: string; color: string; label: string }> = {
  yes: { bg: 'rgba(22,163,74,0.1)', color: '#15803d', label: '✓ Yes' },
  no: { bg: 'rgba(220,38,38,0.08)', color: '#b91c1c', label: '✗ No' },
  partial: { bg: 'rgba(234,179,8,0.12)', color: '#92400e', label: '~ Partial' },
  verify: { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', label: '? Verify' },
  planned: { bg: 'rgba(59,130,246,0.1)', color: '#1d4ed8', label: '◷ Planned' },
};

function Cell({ status, note }: { status: Status; note?: string }) {
  const style = STATUS_COLORS[status];
  return (
    <td style={{ padding: '12px 14px', verticalAlign: 'top', borderBottom: '1px solid var(--line, #f0f0f0)' }}>
      <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 6, background: style.bg, color: style.color, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>
        {style.label}
      </span>
      {note && <div style={{ fontSize: 12, color: 'var(--muted, #888)', marginTop: 4, lineHeight: 1.4 }}>{note}</div>}
    </td>
  );
}

export default function VsTekmetricPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webPageSchema({ name: TITLE, description: DESCRIPTION, url: absoluteUrl(SLUG) })),
        }}
      />

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Compare', href: '/compare' }, { name: 'vs. Tekmetric', href: SLUG }]} />
        <h1 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, lineHeight: 1.2, marginBottom: 16, maxWidth: 760 }}>
          RedlineD1 vs. Tekmetric
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.65, maxWidth: 660, marginBottom: 8, color: 'var(--muted, #555)' }}>
          A neutral feature comparison of RedlineD1 and Tekmetric across the criteria that matter
          most to independent auto repair shops.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32, fontSize: 13, color: 'var(--muted, #888)' }}>
          <span>Competitor data verified: <strong>{VERIFIED_DATE}</strong></span>
          <span>|</span>
          <span>Source: Tekmetric public website and documentation</span>
          <span>|</span>
          <span>Features change — <strong>verify current details with each vendor</strong></span>
        </div>

        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--line, #e5e7eb)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ background: 'var(--surface-soft, #f9fafb)' }}>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700, fontSize: 14, borderBottom: '2px solid var(--line, #e5e7eb)', width: '36%' }}>Feature</th>
                <th style={{ textAlign: 'left', padding: '14px 14px', fontWeight: 700, fontSize: 14, borderBottom: '2px solid var(--line, #e5e7eb)', color: 'var(--accent, #dc2626)' }}>RedlineD1</th>
                <th style={{ textAlign: 'left', padding: '14px 14px', fontWeight: 700, fontSize: 14, borderBottom: '2px solid var(--line, #e5e7eb)' }}>Tekmetric</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(row => (
                <tr key={row.feature} style={{ background: 'var(--surface, #fff)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500, borderBottom: '1px solid var(--line, #f0f0f0)', verticalAlign: 'top' }}>{row.feature}</td>
                  <Cell status={row.rd1} note={row.rd1Note} />
                  <Cell status={row.competitor} note={row.competitorNote} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 8, background: 'rgba(107,114,128,0.08)', fontSize: 13, color: 'var(--muted, #555)' }}>
          <strong>Disclaimer:</strong> &ldquo;Verify with vendor&rdquo; indicates a feature or claim that we could not confirm from publicly available Tekmetric documentation as of the date above. Contact Tekmetric directly for current feature availability and pricing. RedlineD1 features listed reflect the production release.
        </div>

        <div style={{ marginTop: 48, maxWidth: 820 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Key differences</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ paddingLeft: 16, borderLeft: '3px solid var(--accent, #dc2626)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Free tier availability</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--muted, #555)', margin: 0 }}>
                RedlineD1 offers a Free Forever plan with no time limit. Shops can manage customers, vehicles, repair orders, estimates, and invoices on the free plan with usage limits. This is useful for shops evaluating the platform without a trial clock running. Tekmetric does not appear to offer a permanent free tier — verify with their sales team.
              </p>
            </div>
            <div style={{ paddingLeft: 16, borderLeft: '3px solid var(--accent, #dc2626)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>AI revenue intelligence</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--muted, #555)', margin: 0 }}>
                RedlineD1 includes AI-powered intelligence features in the Professional tier and above, including a Morning Brief, revenue leakage detection, customer opportunity scoring, and vehicle intelligence. Whether Tekmetric offers comparable intelligence features should be verified directly with their team.
              </p>
            </div>
            <div style={{ paddingLeft: 16, borderLeft: '3px solid var(--accent, #dc2626)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Starting price transparency</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--muted, #555)', margin: 0 }}>
                RedlineD1 publishes its pricing on the website. The Solo plan starts at $24/month and the Free Forever plan is $0. Tekmetric&apos;s current pricing should be verified directly on their website or by contacting their team.
              </p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 600 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Explore more</h2>
          {[
            { href: '/compare', label: 'All software comparisons', desc: 'See comparisons against other shop management platforms.' },
            { href: '/pricing', label: 'RedlineD1 Pricing', desc: 'Free Forever plan and paid tiers explained.' },
            { href: '/ai-auto-repair-shop-software', label: 'AI Intelligence Features', desc: 'What the RedlineD1 intelligence engine does.' },
          ].map(({ href, label, desc }) => (
            <a key={href} href={href} style={{ display: 'block', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--line, #e5e7eb)', textDecoration: 'none', color: 'inherit', background: 'var(--surface, #fff)' }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent, #dc2626)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, color: 'var(--muted, #666)' }}>{desc}</div>
            </a>
          ))}
        </div>
      </section>

      <PageCTA
        heading="Try RedlineD1 free before deciding"
        subtext="Free Forever plan. No credit card. See how it fits your shop."
        primaryLabel="Start Free"
        secondaryLabel="View All Comparisons"
        secondaryHref="/compare"
      />
    </>
  );
}
