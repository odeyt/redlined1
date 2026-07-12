import { colors, container } from './theme';

const STATEMENTS = [
  'Every repetitive task in an automotive business should eventually be handled by AI.',
  'Every important decision should be supported by AI.',
  'Every repair should make the AI smarter.',
  'Every shop should become more profitable because of RedlineD1.',
];

/**
 * IntelligencePhilosophySection - "The RedlineD1 North Star". Dark editorial
 * section, exact copy per mission Part 18.
 */
export function IntelligencePhilosophySection() {
  return (
    <section style={{ paddingBlock: 'clamp(64px, 10vw, 128px)', background: colors.surfaceDark }}>
      <div style={{ ...container, textAlign: 'center' }}>
        <h2 style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.primary, margin: 0 }}>
          The RedlineD1 North Star
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '24px', marginBottom: '32px' }}>
          {STATEMENTS.map((s) => (
            <p key={s} style={{ fontSize: 'clamp(18px, 2.5vw, 26px)', fontWeight: 500, lineHeight: 1.4, color: colors.textOnDark, margin: 0 }}>
              {s}
            </p>
          ))}
        </div>
        <p style={{ fontSize: '15px', lineHeight: 1.6, color: 'rgba(250,250,250,0.6)', maxWidth: '640px', marginInline: 'auto' }}>
          AI should reduce repetitive work, preserve knowledge, and support better decisions. It should never hide
          reasoning or replace skilled technicians. Humans remain in control.
        </p>
      </div>
    </section>
  );
}
