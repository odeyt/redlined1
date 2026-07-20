interface Props {
  heading?: string;
  subtext?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

export function PageCTA({
  heading = 'Ready to run a tighter shop?',
  subtext = 'Start free. No credit card required. Upgrade when you need more.',
  primaryLabel = 'Start Free',
  primaryHref = '/signup',
  secondaryLabel = 'View Pricing',
  secondaryHref = '/pricing',
}: Props) {
  return (
    <section
      style={{
        background: 'var(--accent, #dc2626)',
        padding: '64px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, color: '#fff', margin: '0 0 12px', lineHeight: 1.2 }}>
          {heading}
        </h2>
        <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.85)', margin: '0 0 32px', lineHeight: 1.6 }}>
          {subtext}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href={primaryHref}
            style={{
              display: 'inline-block',
              background: '#fff',
              color: 'var(--accent, #dc2626)',
              fontWeight: 700,
              fontSize: 15,
              padding: '14px 28px',
              borderRadius: 999,
              textDecoration: 'none',
              transition: 'opacity .15s',
            }}
          >
            {primaryLabel}
          </a>
          <a
            href={secondaryHref}
            style={{
              display: 'inline-block',
              background: 'transparent',
              color: '#fff',
              fontWeight: 600,
              fontSize: 15,
              padding: '14px 28px',
              borderRadius: 999,
              border: '2px solid rgba(255,255,255,0.6)',
              textDecoration: 'none',
              transition: 'border-color .15s',
            }}
          >
            {secondaryLabel}
          </a>
        </div>
      </div>
    </section>
  );
}
