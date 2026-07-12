import { colors, container, h2Style, badge } from './theme';

const PHONE_STEPS = [
  'Add customer', 'Add vehicle', 'Enter VIN', 'Take photos',
  'Create Job Card', 'Build estimate', 'Capture signature', 'Generate invoice', 'View history',
];

/**
 * MobileMechanicSection - "Mobile-ready today" (PWA). Native apps are never
 * claimed as live here - see PRODUCT_STATUS_MATRIX.md (Native Mobile Apps:
 * UNSUPPORTED/PLANNED at most; public/manifest.json + service worker confirm
 * a real, installable PWA today).
 */
export function MobileMechanicSection() {
  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)' }}>
      <div style={container} className="rd1-two-col">
        <div>
          <span style={{ ...badge, background: colors.successBg, color: colors.success, marginBottom: '16px' }}>Mobile-ready today</span>
          <h2 style={h2Style}>Built for the shop floor, driveway, and road.</h2>
          <p style={{ color: colors.textMuted, marginTop: '12px' }}>
            RedlineD1 is a responsive, installable web app - add it to your home screen and run a full job from your
            phone, no office required.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              width: '240px',
              border: `10px solid ${colors.surfaceDark}`,
              borderRadius: '28px',
              background: colors.surfaceWhite,
              boxShadow: '0 12px 48px -12px rgba(0,0,0,0.15)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '14px 12px', background: colors.surfaceDark, color: colors.textOnDark, fontSize: '11px', fontWeight: 600, textAlign: 'center' }}>
              RedlineD1 Mobile
            </div>
            <div style={{ padding: '10px' }}>
              {PHONE_STEPS.map((step, i) => (
                <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 6px', borderBottom: i < PHONE_STEPS.length - 1 ? `1px solid ${colors.borderLight}` : 'none' }}>
                  <span style={{ width: '16px', height: '16px', borderRadius: '9999px', border: `1px solid ${colors.borderLight}`, flexShrink: 0 }} aria-hidden="true" />
                  <span style={{ fontSize: '12px', color: colors.textMain }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
