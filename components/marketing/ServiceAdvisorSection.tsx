import { colors, container, h2Style, card, badge } from './theme';

const REVIEW_ITEMS = [
  'Missing description on line 3',
  'Zero-price item flagged for review',
  'Possible duplicate line detected',
  'Labor not itemized for this repair',
];

const TRUST_LABELS = ['Evidence-based', 'Human-reviewed', 'Transparent', 'Editable', 'Ethical'];

/**
 * ServiceAdvisorSection - "Intelligent Service Advisor". Does not claim
 * automatic customer communication; drafts are reviewed/sent by shop staff.
 */
export function ServiceAdvisorSection() {
  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: colors.surfaceDark, color: colors.textOnDark }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '32px' }}>
          <h2 style={{ ...h2Style, color: colors.textOnDark }}>Build better estimates. Explain repairs more clearly.</h2>
          <p style={{ color: 'rgba(250,250,250,0.65)', marginTop: '12px' }}>
            Before an estimate goes out, RedlineD1 reviews it for gaps and drafts a plain-language explanation your
            staff can edit and send.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
          {TRUST_LABELS.map((label) => (
            <span key={label} style={{ ...badge, background: 'rgba(250,250,250,0.08)', color: colors.textOnDark, border: '1px solid rgba(250,250,250,0.15)' }}>
              {label}
            </span>
          ))}
        </div>

        <div
          style={{
            ...card,
            background: 'rgba(250,250,250,0.05)',
            border: '1px solid rgba(250,250,250,0.12)',
          }}
        >
          {REVIEW_ITEMS.map((item, i) => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBlock: '10px', borderTop: i > 0 ? '1px solid rgba(250,250,250,0.1)' : 'none' }}>
              <span aria-hidden="true" style={{ color: '#FBBF24' }}>&#9888;</span>
              <span style={{ fontSize: '14px', color: 'rgba(250,250,250,0.9)' }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
