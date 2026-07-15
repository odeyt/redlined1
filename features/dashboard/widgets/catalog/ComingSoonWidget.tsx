'use client';

export function makeComingSoonWidget(title: string, icon: string, blurb: string) {
  return function ComingSoonWidget() {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: 24, height: '100%', textAlign: 'center', color: 'var(--muted)',
      }}>
        <span style={{ fontSize: 28 }}>{icon}</span>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 12 }}>{blurb}</div>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
          color: 'var(--accent)', background: 'rgba(204,0,0,0.08)', padding: '3px 10px', borderRadius: 999,
        }}>
          Coming Soon
        </span>
      </div>
    );
  };
}
