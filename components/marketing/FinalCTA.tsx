import Link from 'next/link';
import { colors, container, buttonPrimary, buttonSecondary } from './theme';

export function FinalCTA() {
  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 96px)', background: colors.surfaceDark }}>
      <div style={{ ...container, textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 500, color: colors.textOnDark, margin: 0 }}>
          Run your shop from one connected system.
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginTop: '28px' }}>
          <Link href="/signup" data-analytics="trial_cta_click" style={buttonPrimary}>
            Start Your 7-Day Free Trial
          </Link>
          <a href="mailto:admin@redlined1.com" data-analytics="contact_sales_click" style={{ ...buttonSecondary, background: 'transparent', color: colors.textOnDark, borderColor: 'rgba(250,250,250,0.25)' }}>
            Talk to us
          </a>
        </div>
      </div>
    </section>
  );
}
