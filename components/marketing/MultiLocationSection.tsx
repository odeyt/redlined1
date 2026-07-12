import { colors, container, h2Style, card } from './theme';

/**
 * MultiLocationSection - matches the real, live shop_mirrors bidirectional
 * mirroring capability (lib/shopStore.ts, lib/useShop.ts) confirmed
 * AVAILABLE NOW in PRODUCT_STATUS_MATRIX.md.
 */
export function MultiLocationSection() {
  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: colors.surfaceBg }}>
      <div style={container} className="rd1-two-col">
        <div>
          <h2 style={h2Style}>Run every location from one connected system.</h2>
          <p style={{ color: colors.textMuted, marginTop: '12px' }}>
            RedlineD1 mirrors customer, vehicle, and job data across multiple locations, so owners and staff see one
            shared picture instead of separate silos.
          </p>
        </div>
        <div className="rd1-card-grid rd1-card-grid-2">
          {['Location 1', 'Location 2'].map((loc) => (
            <div key={loc} style={card}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: colors.textMain, marginBottom: '10px' }}>{loc}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: colors.textMuted }}>
                <span>Shared customer records</span>
                <span>Shared vehicle history</span>
                <span>Shared job-card visibility</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
