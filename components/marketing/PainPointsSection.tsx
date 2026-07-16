'use client';

const PAIN_POINTS = [
  { icon: '📋', text: 'Estimates that never get followed up' },
  { icon: '🧾', text: 'Completed jobs that never get invoiced' },
  { icon: '💸', text: 'Unpaid invoices that go unnoticed' },
  { icon: '🔄', text: 'Declined work nobody revisits' },
  { icon: '🔧', text: 'Technicians re-diagnosing the same problem twice' },
  { icon: '🧠', text: "Repair knowledge that lives only in one person's memory" },
  { icon: '📊', text: 'Owners digging through reports to find what matters' },
  { icon: '🗂️', text: 'Customer and vehicle history scattered across systems' },
  { icon: '📦', text: 'Inventory shortages discovered mid-job' },
  { icon: '📍', text: 'Limited visibility once a business has more than one location' },
];

export function PainPointsSection() {
  return (
    <section style={{ paddingBlock: 'clamp(56px, 8vw, 128px)', background: '#07070a', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes pain-card-glow { 0%,100%{box-shadow:0 0 0 rgba(204,0,0,0)} 50%{box-shadow:0 0 24px rgba(204,0,0,0.08)} }
        .pain-card { transition: all 0.25s ease; }
        .pain-card:hover { transform: translateY(-2px); border-color: rgba(204,0,0,0.35) !important; box-shadow: 0 8px 32px rgba(204,0,0,0.12) !important; }
      `}</style>

      {/* Grid bg */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(204,0,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(204,0,0,0.025) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
      }} />
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: 0, left: '20%', width: 600, height: 400,
        background: 'radial-gradient(ellipse, rgba(204,0,0,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: 1200, marginInline: 'auto', paddingInline: 'clamp(16px,5vw,48px)', position: 'relative' }}>

        {/* Header */}
        <div style={{ marginBottom: 56 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '6px 14px', borderRadius: 9999, background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.25)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#cc0000', boxShadow: '0 0 8px #cc0000' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#ff6666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Revenue Leaks</span>
          </div>
          <h2 style={{ fontSize: 'clamp(28px,5vw,52px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', margin: '0 0 16px', maxWidth: 680, lineHeight: 1.1 }}>
            Repair shops lose money in ways<br />
            <span style={{ color: '#cc0000' }}>most software never shows.</span>
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', maxWidth: 520, lineHeight: 1.7 }}>
            These aren't edge cases. They happen every week at every shop without a connected operating system.
          </p>
        </div>

        {/* Pain point grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {PAIN_POINTS.map((point) => (
            <div
              key={point.text}
              className="pain-card"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                padding: '20px 22px', borderRadius: 14,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{point.icon}</span>
              <div>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, fontWeight: 500 }}>
                  {point.text}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom callout */}
        <div style={{ marginTop: 48, padding: '24px 32px', borderRadius: 16, background: 'linear-gradient(135deg, rgba(204,0,0,0.1), rgba(0,0,0,0.3))', border: '1px solid rgba(204,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#cc0000,#ff2222)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, boxShadow: '0 4px 16px rgba(204,0,0,0.4)' }}>
            ⚡
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0, flex: 1 }}>
            RedlineD1 connects all of these problems inside one operating system — so nothing falls through the cracks.
          </p>
        </div>
      </div>
    </section>
  );
}
