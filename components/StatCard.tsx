interface StatCardProps {
  label: string;
  value: string | number;
  subtext: string;
  accent?: string;   // border-bottom accent color
  active?: boolean;  // currently selected / highlighted
  onClick?: () => void;
  trend?: { value: number; label: string }; // optional trend indicator
  className?: string; // extra classes, e.g. "card-hero"
}

export function StatCard({ label, value, subtext, accent, active, onClick, trend, className }: StatCardProps) {
  const isClickable = !!onClick;

  return (
    <div
      className={`card stat${className ? ` ${className}` : ''}`}
      onClick={onClick}
      style={{
        cursor: isClickable ? 'pointer' : 'default',
        borderBottom: accent ? `3px solid ${accent}` : undefined,
        background: active ? `${accent}10` : undefined,
        boxShadow: active ? `0 0 0 2px ${accent}40, var(--shadow)` : undefined,
        transition: 'box-shadow 0.15s, background 0.15s, transform 0.1s',
        userSelect: 'none',
      }}
      onMouseEnter={isClickable ? e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLElement).style.boxShadow = active
          ? `0 0 0 2px ${accent}60, 0 6px 18px rgba(0,0,0,0.12)`
          : '0 6px 18px rgba(0,0,0,0.10)';
      } : undefined}
      onMouseLeave={isClickable ? e => {
        (e.currentTarget as HTMLElement).style.transform = '';
        (e.currentTarget as HTMLElement).style.boxShadow = active
          ? `0 0 0 2px ${accent}40, var(--shadow)`
          : '';
      } : undefined}
    >
      <div className="label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{label}</span>
        {active && accent && (
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, display: 'inline-block', flexShrink: 0 }} />
        )}
      </div>
      <strong style={{ color: active && accent ? accent : undefined }}>{value}</strong>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {subtext}
        {trend && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
            background: trend.value >= 0 ? '#dcfce7' : '#fee2e2',
            color: trend.value >= 0 ? '#15803d' : '#dc2626',
          }}>
            {trend.value >= 0 ? '▲' : '▼'} {Math.abs(trend.value)}% {trend.label}
          </span>
        )}
      </span>
    </div>
  );
}
