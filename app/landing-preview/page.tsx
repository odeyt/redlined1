import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { HeroSection } from '@/components/marketing/HeroSection';
import { FounderOriginSection } from '@/components/marketing/FounderOriginSection';
import { PainPointsSection } from '@/components/marketing/PainPointsSection';
import { ComparisonSection } from '@/components/marketing/ComparisonSection';
import { TimeSavingsCalculator } from '@/components/marketing/TimeSavingsCalculator';
import { RevenueOpportunityCalculator } from '@/components/marketing/RevenueOpportunityCalculator';
import { WorkflowSection } from '@/components/marketing/WorkflowSection';
import { CommandCenterSection } from '@/components/marketing/CommandCenterSection';
import { RepairIntelligenceSection } from '@/components/marketing/RepairIntelligenceSection';
import { VehicleIntelligenceSection } from '@/components/marketing/VehicleIntelligenceSection';
import { ServiceAdvisorSection } from '@/components/marketing/ServiceAdvisorSection';
import { CustomerIntelligenceSection } from '@/components/marketing/CustomerIntelligenceSection';
import { MigrationSection } from '@/components/marketing/MigrationSection';
import { MobileMechanicSection } from '@/components/marketing/MobileMechanicSection';
import { MultiLocationSection } from '@/components/marketing/MultiLocationSection';
import { IntelligencePhilosophySection } from '@/components/marketing/IntelligencePhilosophySection';
import { ProductEvolutionSection } from '@/components/marketing/ProductEvolutionSection';
import { PricingSection } from '@/components/marketing/PricingSection';
import { ReliabilitySection } from '@/components/marketing/ReliabilitySection';
import { FAQSection } from '@/components/marketing/FAQSection';
import { FinalCTA } from '@/components/marketing/FinalCTA';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { colors } from '@/components/marketing/theme';

/**
 * /landing-preview - isolated preview route built from
 * docs/design/aura/LANDING_PAGE_MASTER_SPEC.md. Does NOT replace the live
 * homepage (app/portal/page.tsx) or the app root (app/page.tsx). noindex/
 * nofollow via app/landing-preview/layout.tsx metadata export. Section
 * order matches the master spec's Part 3 narrative: Problem -> Evidence ->
 * Solution -> Business Impact -> Trust -> Trial.
 */
export default function LandingPreviewPage() {
  return (
    <main style={{ background: colors.surfaceBg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <a
        href="#main-content"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
          zIndex: 100,
          background: colors.primary,
          color: colors.surfaceWhite,
          padding: '12px 20px',
          borderRadius: '6px',
        }}
        onFocus={(e) => { e.currentTarget.style.left = '16px'; e.currentTarget.style.top = '16px'; }}
        onBlur={(e) => { e.currentTarget.style.left = '-9999px'; }}
      >
        Skip to main content
      </a>

      <MarketingHeader />

      <div id="main-content">
        <HeroSection />
        <FounderOriginSection />
        <PainPointsSection />
        <ComparisonSection />
        <TimeSavingsCalculator />
        <RevenueOpportunityCalculator />
        <WorkflowSection />
        <CommandCenterSection />
        <RepairIntelligenceSection />
        <VehicleIntelligenceSection />
        <ServiceAdvisorSection />
        <CustomerIntelligenceSection />
        <MigrationSection />
        <MobileMechanicSection />
        <MultiLocationSection />
        <IntelligencePhilosophySection />
        <ProductEvolutionSection />
        <PricingSection />
        <ReliabilitySection />
        <FAQSection />
        <FinalCTA />
      </div>

      <MarketingFooter />
    </main>
  );
}
