import { colors, container, h2Style } from './theme';

const STEPS = ['Intake', 'Job Card', 'Estimate', 'Repair Order', 'Invoice', 'Payment', 'Intelligence'];

/**
 * WorkflowSection - repair lifecycle. All steps AVAILABLE NOW per
 * PRODUCT_STATUS_MATRIX.md. Final "Intelligence" node styled distinctly to
 * signal it's a layer on top of the real workflow, not a separate product.
 */
export function WorkflowSection() {
  return (
    <section id="workflow" style={{ paddingBlock: 'clamp(56px, 8vw, 128px)' }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '40px' }}>
          <h2 style={h2Style}>One connected repair lifecycle.</h2>
          <p style={{ color: colors.textMuted, marginTop: '12px' }}>
            Every step below is available today - no separate tools, no re-entering the same customer or vehicle twice.
          </p>
        </div>
        <div className="rd1-scroll-x">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '760px', paddingBottom: '8px' }}>
            {STEPS.map((step, i) => {
              const isLast = i === STEPS.length - 1;
              return (
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      padding: '10px 18px',
                      borderRadius: '9999px',
                      fontSize: '14px',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      background: isLast ? colors.surfaceDark : colors.surfaceWhite,
                      color: isLast ? colors.textOnDark : colors.textMain,
                      border: `1px solid ${isLast ? colors.surfaceDark : colors.borderLight}`,
                    }}
                  >
                    {step}
                  </div>
                  {!isLast && (
                    <div
                      aria-hidden="true"
                      style={{
                        width: '32px',
                        height: '2px',
                        background: i === STEPS.length - 2 ? 'transparent' : colors.borderLight,
                        borderTop: i === STEPS.length - 2 ? `2px dashed ${colors.textMuted}` : 'none',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
