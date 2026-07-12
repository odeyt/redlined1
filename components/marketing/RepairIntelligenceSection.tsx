import { colors, container, h2Style, card } from './theme';

const TREE_STEPS = [
  { label: 'Complaint', detail: 'Sample: intermittent rough idle' },
  { label: 'Symptoms', detail: 'Sample: stalls at stop, cold start only' },
  { label: 'DTCs', detail: 'Sample: P0300, P0171' },
  { label: 'Tests performed', detail: 'Sample: fuel pressure test, smoke test' },
  { label: 'Failed attempts', detail: 'Sample: spark plug replacement (no change)' },
  { label: 'Final repair', detail: 'Sample: intake manifold gasket replaced' },
  { label: 'Verification', detail: 'Sample: road test, no fault recurrence' },
];

const LOOP_STEPS = ['Repair Work', 'Repair Intelligence', 'Vehicle Memory', 'Customer Memory', 'Business Memory', 'Owner Recommendations', 'Better Decisions', 'Verified Outcomes'];

/**
 * RepairIntelligenceSection - see LANDING_PAGE_MASTER_SPEC.md Section 5.9.
 * PRODUCT_STATUS_MATRIX.md classifies Repair Intelligence PARTIAL - copy
 * describes the real capture/record capability without claiming the fully
 * autonomous learning loop is complete.
 */
export function RepairIntelligenceSection() {
  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)' }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '32px' }}>
          <h2 style={h2Style}>Every repair should make the shop smarter.</h2>
          <p style={{ color: colors.textMuted, marginTop: '12px' }}>
            RedlineD1 captures how a problem was diagnosed, what failed, what fixed it, and how the repair was
            verified - turning completed repairs into reusable shop knowledge.
          </p>
        </div>

        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {TREE_STEPS.map((step, i) => (
            <div key={step.label} style={{ display: 'flex', gap: '16px', paddingBlock: '10px', borderBottom: i < TREE_STEPS.length - 1 ? `1px solid ${colors.borderLight}` : 'none' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '9999px', background: colors.surfaceBg, border: `1px solid ${colors.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: colors.textMuted, flexShrink: 0 }}>
                {i + 1}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: colors.textMain }}>{step.label}</div>
                <div style={{ fontSize: '13px', color: colors.textMuted }}>{step.detail}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '48px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: colors.textMain, marginBottom: '8px' }}>Every repair improves the next decision.</h3>
          <p style={{ fontSize: '13px', color: colors.textMuted, marginBottom: '16px' }}>Designed to improve through verified shop outcomes.</p>
          <div className="rd1-scroll-x">
            <div style={{ display: 'flex', gap: '8px', minWidth: '900px' }}>
              {LOOP_STEPS.map((step, i) => (
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ padding: '8px 14px', borderRadius: '8px', background: colors.surfaceBg, border: `1px solid ${colors.borderLight}`, fontSize: '12px', color: colors.textMain, whiteSpace: 'nowrap' }}>
                    {step}
                  </div>
                  {i < LOOP_STEPS.length - 1 && <span aria-hidden="true" style={{ color: colors.textMuted }}>&rarr;</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
