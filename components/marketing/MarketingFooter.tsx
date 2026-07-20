import Link from 'next/link';
import { RedlineD1Logo } from '@/components/brand/RedlineD1Logo';
import { colors, container } from './theme';

/**
 * MarketingFooter - standard marketing footer, plus a small "Brand" preview
 * of the logo variant set (full/compact/monochrome, light/dark, tagline),
 * per mission Part 21's instruction to integrate the variant preview into
 * the landing page itself rather than a separate page. No fabricated
 * social proof, no customer logos, no press mentions.
 */
export function MarketingFooter() {
  return (
    <footer style={{ paddingBlock: '56px', borderTop: `1px solid ${colors.borderLight}` }}>
      <div style={container}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '32px', marginBottom: '40px' }}>
          <div>
            <RedlineD1Logo variant="full" tagline height={36} />
            <p style={{ fontSize: '13px', color: colors.textMuted, marginTop: '12px', maxWidth: '320px' }}>
              The Automotive Business Operating System. Built inside a real repair shop.
            </p>
          </div>

          <nav aria-label="Footer">
            <div style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Product</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><a href="#workflow" style={{ color: colors.textMain, fontSize: '14px', textDecoration: 'none' }}>How it works</a></li>
              <li><a href="#pricing" style={{ color: colors.textMain, fontSize: '14px', textDecoration: 'none' }}>Pricing</a></li>
              <li><a href="#faq" style={{ color: colors.textMain, fontSize: '14px', textDecoration: 'none' }}>FAQ</a></li>
            </ul>
          </nav>

          <nav aria-label="Account">
            <div style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Account</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><Link href="/login" style={{ color: colors.textMain, fontSize: '14px', textDecoration: 'none' }}>Sign In</Link></li>
              <li><Link href="/signup" style={{ color: colors.textMain, fontSize: '14px', textDecoration: 'none' }}>Start Free</Link></li>
              <li><a href="mailto:admin@redlined1.com" style={{ color: colors.textMain, fontSize: '14px', textDecoration: 'none' }}>Contact Sales</a></li>
            </ul>
          </nav>
        </div>

        <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: '24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>
            &copy; {new Date().getFullYear()} RedlineD1. All rights reserved.
          </p>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link href="/privacy" style={{ fontSize: '12px', color: colors.textMuted, textDecoration: 'none' }}>Privacy</Link>
            <Link href="/terms" style={{ fontSize: '12px', color: colors.textMuted, textDecoration: 'none' }}>Terms</Link>
            <Link href="/refund-policy" style={{ fontSize: '12px', color: colors.textMuted, textDecoration: 'none' }}>Refund Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
