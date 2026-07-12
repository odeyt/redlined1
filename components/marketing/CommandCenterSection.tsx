import { colors, container, h2Style, card, badge } from './theme';

const ACTION_QUEUE = [
  { priority: 'High', action: 'Follow up on stale estimate', reason: 'No customer response in 3 days', evidence: '1 estimate', value: '$X,XXX (illustrative)', status: 'Open' },
  { priority: 'High', action: 'Send invoice for completed job', reason: 'Job marked complete, not yet invoiced', evidence: '1 job card', value: '$XXX (illustrative)', status: 'Open' },
  { priority: 'Medium', action: 'Reorder brake pads', reason: 'Inventory below reorder threshold', evidence: '2 SKUs low', value: '-', status: 'Open' },
  { priority: 'Medium', action: 'Schedule approved work', reason: 'Approved estimate not yet scheduled', evidence: '1 estimate', value: '$XXX (illustrative)', status: 'In progress' },
];

// Medium uses a darkened amber (#92400E), not the raw `warning` (#F59E0B) token -
// the raw token fails WCAG AA as text on a light background (2.15:1) per
// docs/design/aura/DESIGN_VERIFIED.md's contrast restriction. #92400E passes
// and matches the same darkened-amber pattern used for "Evidence-Based" in
// ComparisonSection.tsx.
const PRIORITY_COLOR: Record<string, string> = { High: colors.primary, Medium: '#92400E', Low: colors.textMuted };

/**
 * CommandCenterSection - "Owner Command Center". Sample/illustrative data
 * only (docs/design/aura/PRODUCT_ASSET_REQUIREMENTS.md). Maturity note
 * reflects PRODUCT_STATUS_MATRIX.md PARTIAL classification (SI-5 not yet
 * instructed to start per CLAUDE.md).
 */
export function CommandCenterSection() {
  return (
    <section id="intelligence" style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: colors.surfaceBg }}>
      <div style={container}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px', marginBottom: '32px' }}>
          <div style={{ maxWidth: '640px' }}>
            <h2 style={h2Style}>Know what deserves attention before the day gets away from you.</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ ...badge, background: colors.successBg, color: colors.successText }}>Available Now (core)</span>
            <span style={{ ...badge, background: '#FEF3E2', color: '#92400E' }}>Rolling Out (full scoring)</span>
          </div>
        </div>

        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div className="rd1-scroll-x">
            <table style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: colors.surfaceBg }}>
                  {['Priority', 'Action', 'Reason', 'Evidence', 'Est. value', 'Status'].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: 'left', padding: '12px 16px', fontSize: '12px', color: colors.textMuted, borderBottom: `1px solid ${colors.borderLight}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACTION_QUEUE.map((row) => (
                  <tr key={row.action}>
                    <td style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.borderLight}` }}>
                      <span style={{ ...badge, background: 'transparent', border: `1px solid ${PRIORITY_COLOR[row.priority]}`, color: PRIORITY_COLOR[row.priority] }}>
                        {row.priority}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.borderLight}`, fontSize: '14px', fontWeight: 500, color: colors.textMain }}>{row.action}</td>
                    <td style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.borderLight}`, fontSize: '13px', color: colors.textMuted }}>{row.reason}</td>
                    <td style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.borderLight}`, fontSize: '13px', color: colors.textMuted }}>{row.evidence}</td>
                    <td style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.borderLight}`, fontSize: '13px', color: colors.textMain }}>{row.value}</td>
                    <td style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.borderLight}`, fontSize: '13px', color: colors.textMuted }}>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p style={{ marginTop: '12px', fontSize: '12px', color: colors.textMuted }}>
          Sample Command Center data shown for illustration only. Dollar figures are not real shop data.
        </p>
      </div>
    </section>
  );
}
