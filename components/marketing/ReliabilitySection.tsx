import { colors, container, h2Style, card } from './theme';

const POINTS = [
  'Supabase-backed PostgreSQL with row-level security',
  'Used daily inside a real, operating two-location repair business',
  'Feature flags allow safe rollout of new capability without disrupting daily work',
  'Intelligence and billing hooks are fire-and-forget - a third-party outage never blocks a job card, estimate, or invoice from being created',
];

/**
 * ReliabilitySection - only verified statements (see CLAUDE.md Hard
 * Constraints #11-12). No SLA percentage claims - none are documented or
 * verifiable in this repo.
 */
export function ReliabilitySection() {
  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)' }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '32px' }}>
          <h2 style={h2Style}>Built for daily shop operations, not a demo.</h2>
        </div>
        <div className="rd1-card-grid rd1-card-grid-2">
          {POINTS.map((point) => (
            <div key={point} style={{ ...card, display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span aria-hidden="true" style={{ color: colors.success, fontWeight: 700 }}>&#10003;</span>
              <span style={{ fontSize: '14px', color: colors.textMain, lineHeight: 1.5 }}>{point}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
