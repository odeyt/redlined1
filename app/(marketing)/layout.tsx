import '../landing-preview/landing.css';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { colors } from '@/components/marketing/theme';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rd1-landing"
      style={{ background: colors.surfaceBg, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <a href="#main-content" className="rd1-skip-link">
        Skip to main content
      </a>
      <MarketingHeader />
      <main id="main-content">{children}</main>
      <MarketingFooter />
    </div>
  );
}
