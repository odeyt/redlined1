/**
 * ProductEvolutionSection — populated only from PRODUCT_STATUS_MATRIX.md.
 * Never shows Planned as currently available. Sapelee never appears.
 */
const COLUMNS = [
  {
    title: 'Available Now',
    icon: '⚡',
    color: '#22c55e',
    borderColor: 'rgba(34,197,94,0.3)',
    bgColor: 'rgba(34,197,94,0.06)',
    glowColor: 'rgba(34,197,94,0.1)',
    items: [
      'Customer, Vehicle, Job Card, Estimate, Repair Order, Invoice, Payment, Inventory management',
      'Digital Vehicle Inspections (DVI)',
      'Inspection templates and checklists',
      'Inspection findings with technician notes and photos',
      'Customer-facing shareable inspection report',
      'Online customer approval via share link',
      'Vehicle-linked inspection history',
      'Time Tracking',
      'Command Center + Morning Brief',
      'Vehicle Intelligence',
      'Intelligent Service Advisor',
      'Customer Lifetime Intelligence',
      'Multi-location mirroring',
      'Mobile-ready installable web app (PWA)',
      'CSV / Excel parts import',
    ],
  },
  {
    title: 'Rolling Out',
    icon: '🚀',
    color: '#f59e0b',
    borderColor: 'rgba(245,158,11,0.2)',
    bgColor: 'rgba(245,158,11,0.04)',
    glowColor: 'rgba(245,158,11,0.06)',
    items: [
      'Full evidence-scored owner decision dashboard',
      'Expanded Business Memory',
      'Deeper Repair Intelligence automation',
    ],
  },
  {
    title: 'Planned',
    icon: '🗺️',
    color: '#6366f1',
    borderColor: 'rgba(99,102,241,0.2)',
    bgColor: 'rgba(99,102,241,0.04)',
    glowColor: 'rgba(99,102,241,0.06)',
    items: [
      'Native Android application',
      'Native iPhone application',
      'Published developer API access',
      'Expanded migration tooling beyond CSV/Excel',
    ],
  },
];

export function ProductEvolutionSection() {
  return (
    <section style={{ paddingBlock: 'clamp(56px,8vw,128px)', background: '#0d0d14', position: 'relative', overflow: 'hidden' }}>

      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(34,197,94,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(34,197,94,0.02) 1px,transparent 1px)', backgroundSize: '52px 52px' }} />
      <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: '30%', width: 600, height: 400, background: 'radial-gradient(ellipse,rgba(34,197,94,0.05) 0%,transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: 1200, marginInline: 'auto', paddingInline: 'clamp(16px,5vw,48px)', position: 'relative' }}>

        <div style={{ marginBottom: 52 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '6px 14px', borderRadius: 9999, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Product Roadmap</span>
          </div>
          <h2 style={{ fontSize: 'clamp(26px,4vw,44px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', margin: 0, lineHeight: 1.1 }}>
            Where RedlineD1 is today,<br />
            <span style={{ color: '#22c55e' }}>and where it's going.</span>
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
          {COLUMNS.map(col => (
            <div key={col.title} style={{
              padding: '28px', borderRadius: 20,
              background: col.bgColor,
              border: `1.5px solid ${col.borderColor}`,
              boxShadow: `0 0 40px ${col.glowColor}`,
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: `${col.color}18`, border: `1px solid ${col.color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>
                  {col.icon}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: col.color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {col.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
                    {col.items.length} {col.items.length === 1 ? 'item' : 'items'}
                  </div>
                </div>
              </div>

              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.items.map(item => (
                  <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                      <circle cx="7" cy="7" r="7" fill={`${col.color}1a`} />
                      <path d="M4 7l2 2 4-4" stroke={col.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
