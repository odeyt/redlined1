import { colors, container, h2Style, bodyLg } from './theme';

const VERIFIED_POINTS = [
  'Tested in daily shop operations',
  'Built around real technician workflows',
  'Designed for active service bays',
  'Improved through real repair cases',
  'Built for solo mechanics, growing shops, and multi-location operators',
];

/**
 * FounderOriginSection - "Built inside a real repair shop."
 * See LANDING_PAGE_MASTER_SPEC.md Section 5.2. No testimonials, no names,
 * no photos of people - matches the earlier removal of fabricated
 * testimonials/team photos from app/portal/page.tsx; must not regress here.
 */
export function FounderOriginSection() {
  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: colors.surfaceBg }}>
      <div style={{ ...container }} className="rd1-two-col">
        <div>
          <h2 style={h2Style}>Built inside a real repair shop.</h2>
          <p style={{ ...bodyLg, marginTop: '20px' }}>
            RedlineD1 was created inside an active automotive business to solve real problems involving job flow,
            technician knowledge, estimates, invoices, customer history, inventory, and owner visibility.
          </p>
          <ul style={{ listStyle: 'none', margin: '28px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {VERIFIED_POINTS.map((point) => (
              <li key={point} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '15px', color: colors.textMain }}>
                <span aria-hidden="true" style={{ color: colors.success, fontWeight: 700 }}>✓</span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        {/* Structured CSS/SVG illustration - not stock photography, not a real shop photo (no confirmed usage rights) */}
        <svg
          viewBox="0 0 400 300"
          role="img"
          aria-label="Illustration of a connected repair-shop workflow: intake, job card, estimate, and invoice bays"
          style={{ width: '100%', height: 'auto' }}
        >
          <rect x="0" y="0" width="400" height="300" rx="16" fill={colors.surfaceWhite} stroke={colors.borderLight} />
          {[
            { x: 30, label: 'Intake' },
            { x: 130, label: 'Job Card' },
            { x: 230, label: 'Estimate' },
            { x: 330, label: 'Invoice' },
          ].map((bay, i) => (
            <g key={bay.label}>
              <rect x={bay.x - 20} y="110" width="80" height="80" rx="10" fill={colors.surfaceBg} stroke={colors.borderLight} />
              <circle cx={bay.x + 20} cy="140" r="10" fill={i === 3 ? colors.primary : colors.textMuted} opacity={i === 3 ? 1 : 0.4} />
              <rect x={bay.x - 5} y="160" width="50" height="6" rx="3" fill={colors.borderLight} />
              <text x={bay.x + 20} y="210" fontSize="11" textAnchor="middle" fill={colors.textMuted} fontFamily="Inter, sans-serif">
                {bay.label}
              </text>
            </g>
          ))}
          <line x1="70" y1="150" x2="110" y2="150" stroke={colors.borderLight} strokeWidth="2" />
          <line x1="170" y1="150" x2="210" y2="150" stroke={colors.borderLight} strokeWidth="2" />
          <line x1="270" y1="150" x2="310" y2="150" stroke={colors.borderLight} strokeWidth="2" />
        </svg>
      </div>
    </section>
  );
}
