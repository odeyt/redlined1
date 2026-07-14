'use client';

import Link from 'next/link';

export default function BillingCanceledPage() {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.icon}>✕</div>
        <h1 style={styles.h1}>Checkout Canceled</h1>
        <p style={styles.body}>
          Your checkout was canceled. No payment was taken and nothing has changed on your account.
        </p>
        <p style={styles.sub}>
          You can upgrade anytime from the Plans page.
        </p>
        <div style={styles.actions}>
          <Link href="/" style={styles.btnPrimary}>Back to Dashboard</Link>
          <Link href="/pricing" style={styles.btnSecondary}>View Plans</Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1rem',
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 12,
    padding: '3rem 2.5rem',
    maxWidth: 440,
    width: '100%',
    textAlign: 'center',
    boxShadow: 'var(--shadow)',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    textTransform: 'none',
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: 'var(--line)',
    color: 'var(--muted)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.75rem',
    fontWeight: 700,
    margin: '0 auto 1.5rem',
  },
  h1: {
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    margin: '0 0 0.75rem',
    textTransform: 'uppercase',
    color: 'var(--text)',
  },
  body: {
    fontSize: '0.9375rem',
    lineHeight: 1.6,
    color: 'var(--text)',
    margin: '0 0 0.5rem',
  },
  sub: {
    fontSize: '0.8125rem',
    color: 'var(--muted)',
    margin: '0 0 2rem',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  btnPrimary: {
    display: 'inline-block',
    background: 'var(--accent)',
    color: '#fff',
    padding: '0.75rem 1.5rem',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: '0.875rem',
    textDecoration: 'none',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  btnSecondary: {
    display: 'inline-block',
    background: 'transparent',
    color: 'var(--accent)',
    padding: '0.75rem 1.5rem',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: '0.875rem',
    textDecoration: 'none',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    border: '1px solid var(--accent)',
  },
};
