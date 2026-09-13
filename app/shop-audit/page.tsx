import type { Metadata } from 'next';
import Link from 'next/link';
import { RedlineD1Logo } from '@/components/brand/RedlineD1Logo';
import { ShopAuditForm } from './ShopAuditForm';

export const metadata: Metadata = {
  title: 'Shop Workflow Audit — RedlineD1',
  description:
    'A focused review of your repair shop’s workflow — intake, inspections, estimates, payments and follow-up — to find where time and revenue are being lost.',
  alternates: { canonical: '/shop-audit' },
  openGraph: {
    title: 'Find where your repair shop is losing time and revenue',
    description:
      'A focused review of your shop’s workflow, from customer intake to follow-up, with practical opportunities to improve it.',
    url: '/shop-audit',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

/** What the audit actually looks at. Written as the questions an owner
 *  already asks themselves, not as feature names. */
const REVIEW_AREAS = [
  'Missed calls and inquiries that never became jobs',
  'Estimates sent but never followed up',
  'Declined repairs nobody revisited',
  'Completed work that was not invoiced promptly',
  'Outstanding balances and who is chasing them',
  'Customer communication bottlenecks',
  'Technician workflow and bay scheduling',
  'Parts ordering and inventory delays',
  'Visibility across multiple locations',
  'What it would take to migrate your existing data',
];

export default function ShopAuditPage() {
  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 620 }}>
        <div className="login-logo">
          <Link href="/" aria-label="RedlineD1 home" style={{ display: 'inline-block', textDecoration: 'none' }}>
            <RedlineD1Logo height={56} background="dark" animated={true} />
          </Link>
          <span className="login-logo-sub">Shop Operations</span>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <p style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase',
            color: '#cc0000', marginBottom: 10,
          }}>
            RedlineD1 Shop Workflow Audit
          </p>
          <h1 style={{ fontSize: 'clamp(20px, 3.2vw, 26px)', fontWeight: 800, lineHeight: 1.3, marginBottom: 12, color: '#fff' }}>
            Find where your repair shop is losing time and revenue.
          </h1>
          <p style={{ color: '#888', fontSize: 14, lineHeight: 1.65 }}>
            In a focused shop audit we review your current workflow — from customer intake and
            inspections to estimates, payments and follow-up — and identify practical opportunities
            to improve it with RedlineD1.
          </p>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '16px 18px', marginBottom: 22,
        }}>
          <h2 style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase',
            color: '#999', marginBottom: 12,
          }}>
            What we look at
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 7 }}>
            {REVIEW_AREAS.map(area => (
              <li key={area} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13, color: '#aaa', lineHeight: 1.5 }}>
                <span aria-hidden="true" style={{ color: '#cc0000', flexShrink: 0, fontWeight: 700 }}>→</span>
                <span>{area}</span>
              </li>
            ))}
          </ul>
        </div>

        <p style={{
          fontSize: 12.5, color: '#888', lineHeight: 1.6, marginBottom: 22,
          paddingLeft: 12, borderLeft: '2px solid rgba(204,0,0,0.4)',
        }}>
          Built from real workflows inside an operating two-location repair business.
        </p>

        <ShopAuditForm />

        <p style={{ textAlign: 'center', fontSize: 13, color: '#888', marginTop: 18 }}>
          Just want to try it yourself?{' '}
          <Link href="/signup" data-analytics="start_free_clicked" data-cta-location="shop-audit" style={{ color: '#cc0000', fontWeight: 600 }}>Start free</Link>
          {' '}— no card required.
        </p>
      </div>
    </div>
  );
}
