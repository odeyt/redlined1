/**
 * ReliabilitySection — only verified statements (see CLAUDE.md Hard
 * Constraints #11-12). No SLA percentage claims.
 */
const POINTS = [
  {
    icon: '🛡️',
    color: '#6366f1',
    title: 'Supabase-backed PostgreSQL',
    desc: 'Row-level security enforced at the database layer — data is isolated per shop by design.',
  },
  {
    icon: '🏪',
    color: '#22c55e',
    title: 'Battle-tested in production',
    desc: 'Used daily inside a real, operating two-location repair business — not a demo environment.',
  },
  {
    icon: '🚦',
    color: '#f59e0b',
    title: 'Safe feature rollout',
    desc: 'Feature flags allow new capability to roll out without disrupting daily shop work.',
  },
  {
    icon: '⚡',
    color: '#cc0000',
    title: 'Fire-and-forget integrations',
    desc: 'Intelligence and billing hooks never block core ops — a third-party outage never prevents a job card, estimate, or invoice from being created.',
  },
];

export function ReliabilitySection() {
  return (
    <section style={{ paddingBlock: 'clamp(56px,8vw,128px)', background: '#07070a', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        .rel-card { transition: all 0.25s ease; }
        .rel-card:hover { transform: translateY(-2px); }
      `}</style>

      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)', backgroundSize: '52px 52px' }} />
      <div aria-hidden="true" style={{ position: 'absolute', bottom: '10%', right: '10%', width: 500, height: 400, background: 'radial-gradient(ellipse,rgba(99,102,241,0.06) 0%,transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: 1200, marginInline: 'auto', paddingInline: 'clamp(16px,5vw,48px)', position: 'relative' }}>

        <div style={{ marginBottom: 52 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '6px 14px', borderRadius: 9999, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 8px #6366f1' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Built for Real Work</span>
          </div>
          <h2 style={{ fontSize: 'clamp(26px,4vw,44px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', margin: 0, lineHeight: 1.1 }}>
            Built for daily shop operations,<br />
            <span style={{ color: '#6366f1' }}>not a demo.</span>
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {POINTS.map(point => (
            <div
              key={point.title}
              className="rel-card"
              style={{
                padding: '28px', borderRadius: 18,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 13, flexShrink: 0,
                background: `${point.color}14`, border: `1px solid ${point.color}33`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, boxShadow: `0 4px 16px ${point.color}22`,
              }}>
                {point.icon}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 8 }}>{point.title}</div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, margin: 0 }}>{point.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom trust bar */}
        <div style={{ marginTop: 48, padding: '20px 28px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'center' }}>
          {[
            { icon: '🔒', label: 'Row-level security' },
            { icon: '🏪', label: 'Live in production' },
            { icon: '📱', label: 'Mobile-ready PWA' },
            { icon: '🌏', label: 'Multi-location' },
            { icon: '⚡', label: 'Fire-and-forget hooks' },
          ].map(t => (
            <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
