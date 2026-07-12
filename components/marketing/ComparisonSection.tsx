import { colors, container, h2Style, badge } from './theme';

type Maturity = 'Standard' | 'Limited' | 'Available' | 'Advanced' | 'Evidence-Based' | 'Planned';

const ROWS: { category: string; traditional: Maturity; redline: Maturity }[] = [
  { category: 'Customers', traditional: 'Standard', redline: 'Available' },
  { category: 'Vehicles', traditional: 'Standard', redline: 'Available' },
  { category: 'Estimates', traditional: 'Standard', redline: 'Available' },
  { category: 'Repair Orders', traditional: 'Limited', redline: 'Available' },
  { category: 'Invoices', traditional: 'Standard', redline: 'Available' },
  { category: 'Inventory', traditional: 'Limited', redline: 'Available' },
  { category: 'Technician Workflow', traditional: 'Limited', redline: 'Available' },
  { category: 'Repair Intelligence', traditional: 'Planned', redline: 'Evidence-Based' },
  { category: 'Vehicle Intelligence', traditional: 'Limited', redline: 'Advanced' },
  { category: 'Customer Lifetime Intelligence', traditional: 'Limited', redline: 'Advanced' },
  { category: 'Owner Decision Intelligence', traditional: 'Limited', redline: 'Evidence-Based' },
  { category: 'Business Memory', traditional: 'Planned', redline: 'Available' },
  { category: 'Evidence-Based Recommendations', traditional: 'Planned', redline: 'Evidence-Based' },
  { category: 'Knowledge Retention', traditional: 'Limited', redline: 'Advanced' },
  { category: 'Migration Assistance', traditional: 'Standard', redline: 'Available' },
  { category: 'Mobile Readiness', traditional: 'Limited', redline: 'Available' },
];

const MATURITY_COLOR: Record<Maturity, { bg: string; fg: string }> = {
  Standard: { bg: '#F5F5F5', fg: colors.textMuted },
  Limited: { bg: '#F5F5F5', fg: colors.textMuted },
  Available: { bg: colors.successBg, fg: colors.success },
  Advanced: { bg: colors.successBg, fg: colors.success },
  'Evidence-Based': { bg: '#FEF3E2', fg: '#92400E' },
  Planned: { bg: '#F5F5F5', fg: colors.textMuted },
};

function MaturityBadge({ value }: { value: Maturity }) {
  const c = MATURITY_COLOR[value];
  return <span style={{ ...badge, background: c.bg, color: c.fg }}>{value}</span>;
}

/**
 * ComparisonSection - never names a specific competitor (cannot be verified
 * against any single product's real feature set). "Traditional Shop
 * Software" is a generic category label. See LANDING_PAGE_MASTER_SPEC.md
 * Section 5.4 and docs/design/aura/06_COMPETITIVE_COMPARISON_AUDIT.md.
 */
export function ComparisonSection() {
  return (
    <section id="comparison" style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: colors.surfaceBg }}>
      <div style={container}>
        <div style={{ maxWidth: '680px', marginBottom: '32px' }}>
          <h2 style={h2Style}>Traditional Shop Software vs. RedlineD1 Automotive Business OS.</h2>
        </div>
        <div className="rd1-scroll-x">
          <table style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse', background: colors.surfaceWhite, border: `1px solid ${colors.borderLight}`, borderRadius: '12px', overflow: 'hidden' }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: '14px 16px', fontSize: '13px', color: colors.textMuted, borderBottom: `1px solid ${colors.borderLight}` }}>Category</th>
                <th scope="col" style={{ textAlign: 'left', padding: '14px 16px', fontSize: '13px', color: colors.textMuted, borderBottom: `1px solid ${colors.borderLight}` }}>Traditional Shop Software</th>
                <th scope="col" style={{ textAlign: 'left', padding: '14px 16px', fontSize: '13px', color: colors.primary, borderBottom: `1px solid ${colors.borderLight}` }}>RedlineD1</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.category}>
                  <th scope="row" style={{ textAlign: 'left', padding: '12px 16px', fontSize: '14px', fontWeight: 500, color: colors.textMain, borderBottom: `1px solid ${colors.borderLight}` }}>
                    {row.category}
                  </th>
                  <td style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.borderLight}` }}>
                    <MaturityBadge value={row.traditional} />
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.borderLight}` }}>
                    <MaturityBadge value={row.redline} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: '16px', fontSize: '13px', color: colors.textMuted, maxWidth: '760px' }}>
          "Traditional Shop Software" describes common patterns across general-purpose shop-management tools, not
          any specific product. RedlineD1 ratings reflect verified, currently shipped capability - see the Product
          Evolution section below for what is available now versus rolling out.
        </p>
      </div>
    </section>
  );
}
