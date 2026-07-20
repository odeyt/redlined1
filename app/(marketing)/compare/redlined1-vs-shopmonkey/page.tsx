import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { webPageSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { PageCTA } from '@/components/seo/PageCTA';

const SLUG = '/compare/redlined1-vs-shopmonkey';
const TITLE = 'RedlineD1 vs. Shopmonkey — Auto Repair Software Comparison';
const DESCRIPTION =
  'A neutral side-by-side comparison of RedlineD1 and Shopmonkey across DVI, invoicing, customer communication, multi-location, and pricing. Competitor claims verified from public sources.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'comparison',
  keywords: [
    'RedlineD1 vs Shopmonkey',
    'Shopmonkey alternative',
    'Shopmonkey comparison',
    'auto repair software comparison',
  ],
});

const VERIFIED_DATE = '2025-01-01';

type Status = 'yes' | 'no' | 'partial' | 'verify' | 'planned';

const STATUS_COLORS: Record<Status, { bg: string; color: string; label: string }> = {
  yes: { bg: 'rgba(22,163,74,0.1)', color: '#15803d', label: '✓ Yes' },
  no: { bg: 'rgba(220,38,38,0.08)', color: '#b91c1c', label: '✗ No' },
  partial: { bg: 'rgba(234,179,8,0.12)', color: '#92400e', label: '~ Partial' },
  verify: { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', label: '? Verify' },
  planned: { bg: 'rgba(59,130,246,0.1)', color: '#1d4ed8', label: '◷ Planned' },
};

const ROWS = [
  { feature: 'Free tier', rd1: 'yes' as Status, rd1Note: 'Free Forever plan, no time limit', competitor: 'no' as Status, competitorNote: 'Verify with vendor' },
  { feature: 'Digital repair orders', rd1: 'yes' as Status, competitor: 'yes' as Status, competitorNote: 'Verify with vendor' },
  { feature: 'Estimates', rd1: 'yes' as Status, competitor: 'yes' as Status, competitorNote: 'Verify with vendor' },
  { feature: 'Photo-based DVI', rd1: 'yes' as Status, competitor: 'yes' as Status, competitorNote: 'Verify with vendor' },
  { feature: 'Customer text/SMS updates', rd1: 'verify' as Status, rd1Note: 'Verify current availability', competitor: 'yes' as Status, competitorNote: 'Verify with vendor' },
  { feature: 'Invoicing and payment', rd1: 'yes' as Status, competitor: 'yes' as Status, competitorNote: 'Verify with vendor' },
  { feature: 'Multi-location support', rd1: 'yes' as Status, rd1Note: 'Business plan (up to 10 locations)', competitor: 'yes' as Status, competitorNote: 'Verify with vendor' },
  { feature: 'AI revenue intelligence', rd1: 'yes' as Status, rd1Note: 'Professional plan and above', competitor: 'verify' as Status, competitorNote: 'Verify with vendor' },
  { feature: 'Morning brief / daily summary', rd1: 'yes' as Status, rd1Note: 'AI-generated, daily', competitor: 'verify' as Status, competitorNote: 'Verify with vendor' },
  { feature: 'Revenue leakage detection', rd1: 'yes' as Status, competitor: 'verify' as Status, competitorNote: 'Verify with vendor' },
  { feature: 'VIN decoding', rd1: 'yes' as Status, competitor: 'yes' as Status, competitorNote: 'Verify with vendor' },
  { feature: 'Mobile browser access', rd1: 'yes' as Status, rd1Note: 'Full web app, no install required', competitor: 'yes' as Status, competitorNote: 'Verify with vendor' },
  { feature: 'Public pricing', rd1: 'yes' as Status, rd1Note: 'Transparent pricing page', competitor: 'partial' as Status, competitorNote: 'Verify current pricing with vendor' },
  { feature: 'Free plan starting price', rd1: 'yes' as Status, rd1Note: '$0 / month (Free Forever)', competitor: 'no' as Status, competitorNote: 'Verify with vendor' },
  { feature: 'Entry paid plan pricing', rd1: 'yes' as Status, rd1Note: '$24/month (Solo)', competitor: 'verify' as Status, competitorNote: 'Verify with vendor' },
];

function Cell({ status, note }: { status: Status; note?: string }) {
  const s = STATUS_COLORS[status];
  return (
    <td style={{ padding: '12px 14px', verticalAlign: 'top', borderBottom: '1px solid var(--line, #f0f0f0)' }}>
      <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 6, background: s.bg, color: s.color, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{s.label}</span>
      {note && <div style={{ fontSize: 12, color: 'var(--muted, #888)', marginTop: 4, lineHeight: 1.4 }}>{note}</div>}
    </td>
  );
}

export default function VsShopmonkeyPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema({ name: TITLE, description: DESCRIPTION, url: absoluteUrl(SLUG) })) }} />

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Compare', href: '/compare' }, { name: 'vs. Shopmonkey', href: SLUG }]} />
        <h1 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, lineHeight: 1.2, marginBottom: 16, maxWidth: 760 }}>RedlineD1 vs. Shopmonkey</h1>
        <p style={{ fontSize: 17, lineHeight: 1.65, maxWidth: 660, marginBottom: 8, color: 'var(--muted, #555)' }}>
          A neutral feature comparison of RedlineD1 and Shopmonkey. Competitor claims sourced from Shopmonkey&apos;s public website and documentation as of the date shown.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32, fontSize: 13, color: 'var(--muted, #888)' }}>
          <span>Competitor data verified: <strong>{VERIFIED_DATE}</strong></span>
          <span>|</span>
          <span>Features change — <strong>verify current details with each vendor</strong></span>
        </div>

        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--line, #e5e7eb)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ background: 'var(--surface-soft, #f9fafb)' }}>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700, fontSize: 14, borderBottom: '2px solid var(--line, #e5e7eb)', width: '36%' }}>Feature</th>
                <th style={{ textAlign: 'left', padding: '14px 14px', fontWeight: 700, fontSize: 14, borderBottom: '2px solid var(--line, #e5e7eb)', color: 'var(--accent, #dc2626)' }}>RedlineD1</th>
                <th style={{ textAlign: 'left', padding: '14px 14px', fontWeight: 700, fontSize: 14, borderBottom: '2px solid var(--line, #e5e7eb)' }}>Shopmonkey</th>
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
          <strong>Disclaimer:</strong> &ldquo;Verify with vendor&rdquo; indicates a feature or claim we could not confirm from publicly available Shopmonkey documentation as of the date above. Contact Shopmonkey directly for current feature availability and pricing. RedlineD1 features listed reflect the production release.
        </div>

        <div style={{ marginTop: 48, maxWidth: 820 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Key differences</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ paddingLeft: 16, borderLeft: '3px solid var(--accent, #dc2626)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Free tier</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--muted, #555)', margin: 0 }}>
                RedlineD1 offers a Free Forever plan with no time limit. Shopmonkey does not appear to offer a permanent free tier — verify with their sales team.
              </p>
            </div>
            <div style={{ paddingLeft: 16, borderLeft: '3px solid var(--accent, #dc2626)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>AI revenue intelligence</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--muted, #555)', margin: 0 }}>
                RedlineD1 includes AI-powered intelligence features (Morning Brief, revenue leakage detection, customer scoring) in the Professional tier and above. Whether Shopmonkey offers comparable AI intelligence should be verified directly with their team.
              </p>
            </div>
            <div style={{ paddingLeft: 16, borderLeft: '3px solid var(--accent, #dc2626)' }}>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Pricing transparency</h3>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--muted, #555)', margin: 0 }}>
                RedlineD1 publishes its full pricing on the website. The Free Forever plan is $0 and paid plans start at $24/month. Shopmonkey&apos;s current pricing structure should be confirmed directly with their team.
              </p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 600 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Explore more</h2>
          {[
            { href: '/compare', label: 'All software comparisons', desc: 'See comparisons against other shop management platforms.' },
            { href: '/compare/redlined1-vs-tekmetric', label: 'RedlineD1 vs. Tekmetric', desc: 'Compare against Tekmetric.' },
            { href: '/pricing', label: 'RedlineD1 Pricing', desc: 'Free Forever plan and paid tiers explained.' },
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
