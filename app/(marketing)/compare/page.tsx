import type { Metadata } from 'next';
import { generateMeta } from '@/lib/seo/metadata';
import { webPageSchema, itemListSchema } from '@/lib/seo/schema';
import { absoluteUrl } from '@/lib/seo/urls';
import { Breadcrumb } from '@/components/seo/Breadcrumb';
import { PageCTA } from '@/components/seo/PageCTA';

const SLUG = '/compare';
const TITLE = 'RedlineD1 vs. Other Auto Repair Shop Software';
const DESCRIPTION =
  'See how RedlineD1 compares to Tekmetric, Shopmonkey, AutoLeap, and other auto repair shop management platforms. Neutral criteria, transparent methodology, verified-date sourcing.';

export const metadata: Metadata = generateMeta({
  title: TITLE,
  description: DESCRIPTION,
  slug: SLUG,
  pageType: 'comparison',
  keywords: [
    'auto repair software comparison',
    'Tekmetric alternative',
    'Shopmonkey alternative',
    'AutoLeap alternative',
    'best auto repair shop software',
    'shop management software comparison',
  ],
});

const COMPARISONS = [
  {
    competitor: 'Tekmetric',
    slug: '/compare/redlined1-vs-tekmetric',
    desc: 'Cloud-based shop management with strong reporting and workflow features.',
    categories: ['Repair orders', 'Reporting', 'Technician workflow', 'Multi-location', 'AI intelligence', 'Pricing'],
  },
  {
    competitor: 'Shopmonkey',
    slug: '/compare/redlined1-vs-shopmonkey',
    desc: 'Modern cloud shop software known for its UI and multi-shop features.',
    categories: ['Digital inspections', 'Invoicing', 'Customer communication', 'Multi-location', 'Pricing'],
  },
  {
    competitor: 'AutoLeap',
    slug: '/compare/redlined1-vs-autoleap',
    desc: 'Shop management platform with AI-assisted advisor features.',
    categories: ['AI features', 'Estimates', 'DVI', 'Pricing'],
  },
];

const SCHEMA = [
  webPageSchema({ name: TITLE, description: DESCRIPTION, url: absoluteUrl(SLUG) }),
  itemListSchema(
    'RedlineD1 Software Comparisons',
    COMPARISONS.map(c => ({
      name: `RedlineD1 vs. ${c.competitor}`,
      description: c.desc,
      url: `/compare/redlined1-vs-${c.competitor.toLowerCase()}`,
    })),
  ),
];

export default function ComparePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }} />

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 40px' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Compare', href: SLUG }]} />
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, lineHeight: 1.15, marginBottom: 16, maxWidth: 740 }}>
          How RedlineD1 Compares to Other Shop Management Software
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.65, maxWidth: 660, marginBottom: 12, color: 'var(--muted, #555)' }}>
          Side-by-side comparisons using neutral criteria. Competitor information is
          sourced from public documentation and verified at the date shown.
          Features and pricing change — verify current details with each vendor.
        </p>
        <p style={{ fontSize: 13, color: 'var(--muted, #888)', marginBottom: 40 }}>
          Last methodology review: January 2025. This page links to individual comparison pages where claim dates are noted per item.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 56 }}>
          {COMPARISONS.map(({ competitor, slug, desc, categories }) => (
            <a
              key={slug}
              href={slug}
              style={{ display: 'block', padding: 24, borderRadius: 12, border: '1px solid var(--line, #e5e7eb)', textDecoration: 'none', color: 'inherit', background: 'var(--surface, #fff)', transition: 'border-color .15s' }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--accent, #dc2626)' }}>
                RedlineD1 vs. {competitor}
              </h2>
              <p style={{ fontSize: 14, color: 'var(--muted, #666)', marginBottom: 16, lineHeight: 1.6 }}>{desc}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {categories.map(c => (
                  <span key={c} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 999, background: 'var(--surface-soft, #f3f4f6)', color: 'var(--muted, #555)' }}>{c}</span>
                ))}
              </div>
              <div style={{ marginTop: 16, fontWeight: 600, fontSize: 14, color: 'var(--accent, #dc2626)' }}>
                View comparison →
              </div>
            </a>
          ))}
        </div>

        {/* Methodology */}
        <div style={{ background: 'var(--surface-soft, #f9fafb)', borderRadius: 12, padding: 28, border: '1px solid var(--line, #e5e7eb)', maxWidth: 820, marginBottom: 40 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Comparison methodology</h2>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--muted, #555)' }}>
            <p style={{ marginBottom: 12 }}>
              Comparisons on this site follow these principles:
            </p>
            <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
              <li>Competitor features are sourced from their public documentation, product pages, or feature announcements</li>
              <li>Each claim includes a &ldquo;last verified&rdquo; date — software features change frequently</li>
              <li>Unknown or unverified features are marked &ldquo;Verify with vendor&rdquo; — not assumed</li>
              <li>Pricing is listed where publicly published — otherwise noted as &ldquo;Contact vendor&rdquo;</li>
              <li>Criteria are applied consistently across all compared platforms</li>
              <li>RedlineD1 features listed are only those present in the current production release</li>
              <li>Planned or in-development features are labeled clearly</li>
            </ul>
            <p>
              We aim for fairness. If you notice an inaccuracy, contact us and we&apos;ll update the comparison.
            </p>
          </div>
        </div>

        <div style={{ maxWidth: 820 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Not sure which software is right for you?</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { href: '/pricing', label: 'View RedlineD1 Pricing', desc: 'Free Forever plan available. Paid plans from $24/month.' },
              { href: '/mobile-mechanic-software', label: 'Mobile Mechanic Software', desc: 'Purpose-built for mobile and field mechanics.' },
              { href: '/ai-auto-repair-shop-software', label: 'AI Intelligence Features', desc: 'See what separates RedlineD1 on shop intelligence.' },
            ].map(({ href, label, desc }) => (
              <a key={href} href={href} style={{ display: 'block', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--line, #e5e7eb)', textDecoration: 'none', color: 'inherit', background: 'var(--surface, #fff)' }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent, #dc2626)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--muted, #666)' }}>{desc}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <PageCTA
        heading="Try RedlineD1 yourself"
        subtext="Free Forever plan. No credit card required. See if it fits your shop in minutes."
        primaryLabel="Start Free"
        secondaryLabel="View Pricing"
      />
    </>
  );
}
