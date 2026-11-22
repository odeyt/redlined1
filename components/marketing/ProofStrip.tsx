/**
 * ProofStrip — real usage numbers from D1 Imports, the shop RedlineD1 was
 * built in and runs in every day. Figures verified from the live workspace
 * on 2026-11-22 (customers, vehicles, job cards, invoices, inspections).
 * Refresh monthly. When a customer testimonial is approved, it belongs
 * directly under this strip.
 */
const STATS: { value: string; label: string }[] = [
  { value: '159', label: 'Customers managed' },
  { value: '133', label: 'Vehicles on file' },
  { value: '112', label: 'Job cards run' },
  { value: '151', label: 'Invoices issued' },
  { value: '58', label: 'Digital inspections' },
];

export function ProofStrip() {
  return (
    <section
      aria-label="RedlineD1 in daily use at a real repair shop"
      style={{
        background: '#0d0d10',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '36px clamp(16px,5vw,48px)',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#ff6060',
            margin: '0 0 20px',
          }}
        >
          Not a demo — RedlineD1 runs a real repair shop every day
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '20px 40px',
            justifyContent: 'center',
          }}
        >
          {STATS.map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: '20px 0 0' }}>
          Every figure above is live workload at D1 Imports — the shop RedlineD1 was built in.
        </p>
      </div>
    </section>
  );
}
