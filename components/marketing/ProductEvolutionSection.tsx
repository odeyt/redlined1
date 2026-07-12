import { colors, container, h2Style, card } from './theme';

/**
 * ProductEvolutionSection - populated only from PRODUCT_STATUS_MATRIX.md.
 * Never shows Planned as currently available. Sapelee never appears.
 */
const COLUMNS = [
  {
    title: 'Available Now',
    items: [
      'Customer, Vehicle, Job Card, Estimate, Repair Order, Invoice, Payment, Inventory management',
      'Time Tracking',
      'Command Center + Morning Brief',
      'Vehicle Intelligence',
      'Intelligent Service Advisor',
      'Customer Lifetime Intelligence',
      'Multi-location mirroring',
      'Mobile-ready installable web app (PWA)',
      'CSV / Excel parts import',
    ],
    style: 'solid' as const,
  },
  {
    title: 'Rolling Out',
    items: [
      'Full evidence-scored owner decision dashboard',
      'Expanded Business Memory',
      'Deeper Repair Intelligence automation',
    ],
    style: 'dashed' as const,
  },
  {
    title: 'Planned',
    items: [
      'Native mobile apps',
      'Published developer API access',
      'Expanded migration tooling beyond CSV/Excel',
    ],
    style: 'dashed' as const,
  },
];

export function ProductEvolutionSection() {
  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)' }}>
      <div style={container}>
        <div style={{ maxWidth: '640px', marginBottom: '32px' }}>
          <h2 style={h2Style}>Where RedlineD1 is today, and where it's going.</h2>
        </div>
        <div className="rd1-card-grid rd1-card-grid-3">
          {COLUMNS.map((col) => (
            <div
              key={col.title}
              style={{
                ...card,
                border: col.style === 'dashed' ? `1px dashed ${colors.borderLight}` : `1px solid ${colors.borderLight}`,
                opacity: col.style === 'dashed' ? 0.85 : 1,
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: col.style === 'solid' ? colors.success : colors.textMuted, marginBottom: '14px' }}>
                {col.title}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {col.items.map((item) => (
                  <li key={item} style={{ fontSize: '13px', color: colors.textMain, lineHeight: 1.5 }}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
