import { colors, container, h2Style, card } from './theme';

const TIMELINE = [
  { label: 'First visit', detail: 'Sample Customer - oil change' },
  { label: 'Return visit', detail: 'Brake inspection, work approved' },
  { label: 'Declined item', detail: 'Cabin filter declined' },
  { label: 'Most recent visit', detail: 'Invoice paid in full' },
];

const METRICS = [
  { label: 'Lifetime revenue', value: '$X,XXX (illustrative)' },
  { label: 'Visits', value: '6 (sample)' },
  { label: 'Average invoice', value: '$XXX (illustrative)' },
  { label: 'Unpaid balance', value: '$0' },
];

/** CustomerIntelligenceSection - see LANDING_PAGE_MASTER_SPEC.md Section 5.12. */
export function CustomerIntelligenceSection() {
  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)' }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '32px' }}>
          <h2 style={h2Style}>Understand the relationship, not just the last invoice.</h2>
        </div>
        <div className="rd1-two-col">
          <div className="rd1-card-grid rd1-card-grid-2">
            {METRICS.map((m) => (
              <div key={m.label} style={card}>
                <div style={{ fontSize: '12px', color: colors.textMuted }}>{m.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 600, color: colors.textMain, marginTop: '4px' }}>{m.value}</div>
              </div>
            ))}
          </div>
          <div style={card}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, marginBottom: '12px' }}>Relationship timeline (sample)</div>
            {TIMELINE.map((item, i) => (
              <div key={item.label} style={{ display: 'flex', gap: '12px', paddingBlock: '10px', borderTop: i > 0 ? `1px solid ${colors.borderLight}` : 'none' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '9999px', background: colors.primary, marginTop: '6px', flexShrink: 0 }} aria-hidden="true" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.textMain }}>{item.label}</div>
                  <div style={{ fontSize: '13px', color: colors.textMuted }}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
