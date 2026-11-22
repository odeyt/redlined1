import Link from 'next/link';

/**
 * DemoVideoSection — the Redline AI live demo video, embedded directly
 * above PricingSection on the landing page (anchor: /#demo). Filmed inside
 * D1 Imports, the shop RedlineD1 was built in: morning brief, stale
 * estimates, money owed, vehicle history. Published on the @RedlineD1ShopOS
 * YouTube channel. Uses the youtube-nocookie embed domain and lazy loading
 * so the iframe costs nothing until a visitor scrolls to it.
 */
export function DemoVideoSection() {
  return (
    <section
      id="demo"
      aria-label="Watch the Redline AI live demo"
      style={{
        background: '#0d0d10',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '56px clamp(16px,5vw,48px)',
      }}
    >
      <div style={{ maxWidth: 880, margin: '0 auto', textAlign: 'center' }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#ff6060',
            margin: '0 0 14px',
          }}
        >
          Live demo
        </p>
        <h2
          style={{
            fontSize: 'clamp(24px,3.5vw,36px)',
            fontWeight: 900,
            color: '#fff',
            letterSpacing: '-0.025em',
            lineHeight: 1.15,
            margin: '0 0 12px',
          }}
        >
          Watch Redline AI run a real shop
        </h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', lineHeight: 1.55, margin: '0 0 28px' }}>
          Filmed inside D1 Imports — the shop RedlineD1 was built in. Morning brief, stale
          estimates, money owed, vehicle history.
        </p>
        <div
          style={{
            position: 'relative',
            paddingTop: '56.25%',
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.1)',
            background: '#000',
          }}
        >
          <iframe
            src="https://www.youtube-nocookie.com/embed/A29EsqmyKJg"
            title="Redline AI: The AI Chief of Staff Inside Your Shop Software — Live Demo"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 0,
            }}
          />
        </div>
        <p style={{ fontSize: 15, margin: '22px 0 0' }}>
          <Link
            href="/signup"
            style={{ color: '#ff6060', fontWeight: 700, textDecoration: 'none' }}
          >
            Pilot shops get Redline AI free for 30 days →
          </Link>
        </p>
      </div>
    </section>
  );
}
