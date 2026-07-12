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
          <span style={{ ...badge, background: colors.successBg, color: colors.successText, marginBottom: '16px' }}>Mobile-ready today</span>
          <h2 style={h2Style}>Built for the shop floor, driveway, and road.</h2>
          <p style={{ color: colors.textMuted, marginTop: '12px' }}>
            RedlineD1 is a responsive, installable web app - add it to your home screen and run a full job from your
            phone, no office required.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {/* Phone frame — matches the layered mockup style from the hero section */}
          <div
            aria-hidden="true"
            style={{
              width: '260px',
              background: colors.surfaceDark,
              borderRadius: '36px',
              padding: '14px 10px 10px',
              boxShadow: '0 24px 64px -16px rgba(0,0,0,0.28), 0 0 0 2px rgba(255,255,255,0.06) inset',
              position: 'relative',
            }}
          >
            {/* Notch */}
            <div style={{ width: '80px', height: '22px', background: colors.surfaceDark, borderRadius: '0 0 14px 14px', margin: '0 auto 8px', position: 'relative', zIndex: 1 }} />

            {/* Screen */}
            <div style={{ borderRadius: '24px', overflow: 'hidden', background: colors.surfaceWhite }}>

              {/* App header bar — brand red */}
              <div style={{ background: colors.primary, padding: '14px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: colors.surfaceWhite, letterSpacing: '0.04em' }}>RedlineD1</span>
                <span style={{ width: '28px', height: '28px', borderRadius: '9999px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: colors.surfaceWhite }}>D1</span>
                </span>
              </div>

              {/* Content area */}
              <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Card 1 */}
                <div style={{ background: colors.surfaceBg, border: `1px solid ${colors.borderLight}`, borderRadius: '12px', padding: '12px' }}>
                  <div style={{ width: '60%', height: '11px', background: colors.surfaceDark, borderRadius: '4px', marginBottom: '8px' }} />
                  <div style={{ width: '85%', height: '8px', background: colors.borderLight, borderRadius: '4px', marginBottom: '5px' }} />
                  <div style={{ width: '65%', height: '8px', background: colors.borderLight, borderRadius: '4px' }} />
                </div>

                {/* Card 2 */}
                <div style={{ background: colors.surfaceBg, border: `1px solid ${colors.borderLight}`, borderRadius: '12px', padding: '12px' }}>
                  <div style={{ width: '70%', height: '11px', background: colors.surfaceDark, borderRadius: '4px', marginBottom: '8px' }} />
                  <div style={{ width: '90%', height: '8px', background: colors.borderLight, borderRadius: '4px', marginBottom: '5px' }} />
                  <div style={{ width: '55%', height: '8px', background: colors.borderLight, borderRadius: '4px' }} />
                </div>

                {/* Action button */}
                <div style={{ background: colors.surfaceDark, borderRadius: '10px', padding: '14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '80px', height: '10px', background: 'rgba(255,255,255,0.3)', borderRadius: '4px' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
