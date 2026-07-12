import Link from 'next/link';
import { colors, container, buttonPrimary, buttonSecondary, eyebrow } from './theme';

/**
 * HeroSection - see docs/design/aura/LANDING_PAGE_MASTER_SPEC.md Section 5.1.
 *
 * No "RedlineD1 Engine v2.0" version badge (fabricated per the design audit -
 * omitted entirely). Secondary CTA scrolls to #workflow in-page since no
 * product-tour video asset exists in this repo.
 */
export function HeroSection() {
  return (
    <section
      id="top"
      style={{
        position: 'relative',
        paddingBlock: 'clamp(64px, 10vw, 120px)',
        background: `radial-gradient(ellipse 80% 50% at 50% -10%, rgba(180,35,24,0.06), transparent)`,
      }}
    >
      <div style={{ ...container, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
        <span style={eyebrow}>Built inside a real automotive repair business</span>
        <h1
          style={{
            fontSize: 'clamp(36px, 6vw, 72px)',
            fontWeight: 500,
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            color: colors.textMain,
            maxWidth: '900px',
            margin: 0,
          }}
        >
          The operating system that helps repair shops think.
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.6, color: colors.textMuted, maxWidth: '720px', margin: 0 }}>
          Run customers, vehicles, estimates, technicians, invoices, payments, and business intelligence from one connected platform.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.6, color: colors.textMuted, maxWidth: '640px', margin: 0 }}>
          RedlineD1 helps automotive businesses recover missed revenue, preserve repair knowledge, reduce repeated mistakes, and know what deserves attention next.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginTop: '8px' }}>
          <Link href="/signup" data-analytics="trial_cta_click" style={buttonPrimary}>
            Start Your 7-Day Free Trial
          </Link>
          <a href="#workflow" data-analytics="product_tour_click" style={buttonSecondary}>
            Watch Product Tour
          </a>
        </div>

        <div
          aria-hidden="true"
          style={{
            marginTop: '48px',
            width: '100%',
            maxWidth: '960px',
            borderRadius: '16px',
            border: `1px solid ${colors.borderLight}`,
            background: colors.surfaceWhite,
            boxShadow: '0 12px 48px -12px rgba(0,0,0,0.08)',
            padding: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
            textAlign: 'left',
          }}
        >
          {[
            { label: 'Open Job Cards', value: '12' },
            { label: 'Stale Estimates', value: '3 (illustrative)' },
            { label: 'Unpaid Invoices', value: '5 (illustrative)' },
          ].map((stat) => (
            <div key={stat.label} style={{ padding: '12px', borderRadius: '10px', background: colors.surfaceBg }}>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: colors.textMuted }}>
                {stat.label}
              </div>
              <div style={{ fontSize: '22px', fontWeight: 600, color: colors.textMain, marginTop: '4px' }}>{stat.value}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>Sample Command Center data shown for illustration only.</p>
      </div>
    </section>
  );
}
