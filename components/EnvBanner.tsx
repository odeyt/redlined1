'use client';

/**
 * Visible only when NEXT_PUBLIC_APP_ENV is not "production".
 * Shows a small banner so staff know they are on staging or development.
 * Renders nothing in production — zero impact on prod UI.
 */
export function EnvBanner() {
  const env = process.env.NEXT_PUBLIC_APP_ENV;
  if (!env || env === 'production') return null;

  const isStaging = env === 'staging';

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      height: 28,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: isStaging ? '#f59e0b' : '#3b82f6',
      color: '#fff',
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      userSelect: 'none',
      pointerEvents: 'none',
    }}>
      {isStaging ? '⚠ Staging Environment — Not Production' : '🛠 Development Environment'}
    </div>
  );
}
