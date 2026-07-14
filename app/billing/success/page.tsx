'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function BillingSuccessPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) {
          clearInterval(t);
          router.push('/');
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.icon}>✓</div>
        <h1 style={styles.h1}>Payment Successful</h1>
        <p style={styles.body}>
          Your subscription is now active. All features for your plan are unlocked.
        </p>
        <p style={styles.sub}>
          Redirecting to your dashboard in {countdown}s…
        </p>
        <Link href="/" style={styles.btn}>Go to Dashboard</Link>
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
    background: '#16a34a',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2rem',
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
  btn: {
    display: 'inline-block',
    background: 'var(--accent)',
    color: '#fff',
    padding: '0.75rem 1.75rem',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: '0.875rem',
    textDecoration: 'none',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
};
