import { colors, container, h2Style, card, disclaimer } from './theme';

const SIGNALS = [
  { label: 'Visit history', value: '4 recorded visits (sample)' },
  { label: 'Repeat concerns', value: 'Rough idle noted twice' },
  { label: 'Recurring DTCs', value: 'P0171 seen on 2 visits' },
  { label: 'Declined work', value: '1 item declined last visit' },
  { label: 'Risk signal', value: 'Elevated - repeat symptom' },
  { label: 'Recommended check', value: 'Fuel trim recheck' },
];

/** VehicleIntelligenceSection - see LANDING_PAGE_MASTER_SPEC.md Section 5.10. */
export function VehicleIntelligenceSection() {
  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: colors.surfaceBg }}>
      <div style={container} className="rd1-two-col">
        <div>
          <h2 style={h2Style}>Every vehicle arrives with context.</h2>
          <p style={{ color: colors.textMuted, marginTop: '12px', marginBottom: '20px' }}>
            Visit history, repeat concerns, recurring fault codes, declined work, and repair patterns - surfaced
            automatically the moment a vehicle comes back in.
          </p>
          <p style={disclaimer}>Based on recorded shop data. Not a replacement for inspection or diagnosis.</p>
        </div>
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '0' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, marginBottom: '12px' }}>Sample Vehicle - 2018 Sedan</div>
          {SIGNALS.map((s, i) => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBlock: '10px', borderTop: i > 0 ? `1px solid ${colors.borderLight}` : 'none' }}>
              <span style={{ fontSize: '13px', color: colors.textMuted }}>{s.label}</span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: colors.textMain }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
