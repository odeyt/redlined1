import Link from 'next/link';
import { colors, container, h2Style, card, buttonPrimary, disclaimer } from './theme';

const FLOW_STEPS = ['Export', 'Upload', 'Map Fields', 'Detect Duplicates', 'Validate', 'Review', 'Go Live'];

const SOURCE_PLATFORMS = [
  'Tekmetric', 'Shopmonkey', 'Shop-Ware', 'AutoLeap', 'Mitchell 1', 'RO Writer',
  'Protractor', 'NAPA TRACS', 'MaxxTraxx', 'Manager SE', 'Shop Boss', 'GaragePlug',
];

const TIERS = [
  { name: 'Self-Service Import', desc: 'CSV/Excel import for parts and inventory data - available today.' },
  { name: 'Assisted Migration', desc: 'Our team helps map and validate your data during onboarding.' },
  { name: 'White-Glove Migration', desc: 'Full-service migration handled end to end. Contact sales.' },
];

/**
 * MigrationSection - see LANDING_PAGE_MASTER_SPEC.md Section 8 and
 * PRODUCT_STATUS_MATRIX.md (Migration/Import: PARTIAL - CSV/Excel import for
 * parts/inventory is real; no full-shop migration pipeline exists). Named
 * platforms appear as plain text only, never as logos, never as claimed
 * integrations or partnerships.
 */
export function MigrationSection() {
  return (
    <section id="migration" style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: colors.surfaceBg }}>
      <div style={container}>
        <div style={{ maxWidth: '680px', marginBottom: '32px' }}>
          <h2 style={h2Style}>Switch without losing your shop history.</h2>
          <p style={{ color: colors.textMuted, marginTop: '12px' }}>
            RedlineD1 supports migration through available export formats, structured imports, and assisted
            onboarding.
          </p>
        </div>

        <div className="rd1-scroll-x" style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', gap: '8px', minWidth: '760px' }}>
            {FLOW_STEPS.map((step, i) => (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ padding: '10px 16px', borderRadius: '9999px', background: colors.surfaceWhite, border: `1px solid ${colors.borderLight}`, fontSize: '13px', color: colors.textMain, whiteSpace: 'nowrap' }}>
                  {step}
                </div>
                {i < FLOW_STEPS.length - 1 && <span aria-hidden="true" style={{ color: colors.textMuted }}>&rarr;</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="rd1-card-grid rd1-card-grid-3" style={{ marginBottom: '32px' }}>
          {TIERS.map((tier) => (
            <div key={tier.name} style={card}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: colors.textMain, marginBottom: '8px' }}>{tier.name}</div>
              <div style={{ fontSize: '13px', color: colors.textMuted }}>{tier.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: colors.textMain, marginBottom: '12px' }}>Coming from another platform?</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {SOURCE_PLATFORMS.map((p) => (
              <span key={p} style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${colors.borderLight}`, fontSize: '13px', color: colors.textMain, background: colors.surfaceWhite }}>
                {p}
              </span>
            ))}
            <span style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${colors.borderLight}`, fontSize: '13px', color: colors.textMain, background: colors.surfaceWhite }}>
              CSV / Excel
            </span>
          </div>
        </div>

        <p style={{ ...disclaimer, marginBottom: '24px', maxWidth: '760px' }}>
          These are common shop-management platforms shop owners switch from. RedlineD1 has no official partnership
          with the platforms listed. Import capabilities vary by source platform and available export format.
          Parts and inventory import is available today via CSV/Excel; customer and vehicle history migration is
          handled through Assisted or White-Glove onboarding.
        </p>

        <Link href="/signup" data-analytics="migration_cta_click" style={buttonPrimary}>
          Start Your 7-Day Free Trial
        </Link>
      </div>
    </section>
  );
}
