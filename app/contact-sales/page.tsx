'use client';

import { useState, useEffect } from 'react';
import { RedlineD1Logo } from '@/components/brand/RedlineD1Logo';

const CONTEXT_COPY: Record<string, { heading: string; sub: string }> = {
  enterprise: {
    heading: 'Talk to Sales — Enterprise',
    sub: 'Custom contracts, SLAs, white-label, and API access for groups and chains.',
  },
  migration: {
    heading: 'White-Glove Migration',
    sub: 'Our team extracts, cleans, maps, and imports your data end to end.',
  },
  general: {
    heading: 'Talk to Us',
    sub: "Questions about RedlineD1? We'll get back to you shortly.",
  },
};

export default function ContactSalesPage() {
  const [context, setContext] = useState('general');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [shopName, setShopName] = useState('');
  const [message, setMessage]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('context');
    if (c && CONTEXT_COPY[c]) setContext(c);
  }, []);

  const copy = CONTEXT_COPY[context];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/contact-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, shopName, context, message }),
      });
      if (!res.ok) throw new Error('Failed to send. Please try again.');
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <a href="/" aria-label="RedlineD1 home" style={{ display: 'inline-block', textDecoration: 'none' }}>
            <RedlineD1Logo height={56} background="dark" animated={true} />
          </a>
          <span className="login-logo-sub">Shop Operations</span>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
            <div style={{ fontSize: 44, marginBottom: 16 }}>📩</div>
            <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 10, color: '#fff' }}>Message sent</h2>
            <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
              We'll get back to you at <strong style={{ color: '#fff' }}>{email}</strong> shortly.
            </p>
            <a href="/" style={{ color: '#cc0000', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>← Back to Home</a>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{copy.heading}</h2>
              <p style={{ color: '#777', fontSize: 13, lineHeight: 1.6 }}>{copy.sub}</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-field">
                <label htmlFor="name">Your Name</label>
                <input id="name" type="text" required value={name}
                  onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div className="login-field">
                <label htmlFor="shop">Shop / Company Name</label>
                <input id="shop" type="text" value={shopName}
                  onChange={e => setShopName(e.target.value)} placeholder="Smith Auto Group" />
              </div>
              <div className="login-field">
                <label htmlFor="email">Email Address</label>
                <input id="email" type="email" autoComplete="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@yourshop.com" />
              </div>
              <div className="login-field">
                <label htmlFor="message">Message (optional)</label>
                <textarea id="message" rows={4} value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Tell us about your shop or what you need"
                  style={{ resize: 'vertical', width: '100%', fontFamily: 'inherit' }} />
              </div>
              {error && <p className="login-error">{error}</p>}
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Sending…' : 'Send Message'}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: 13, color: '#888', marginTop: 16 }}>
              Prefer email? Reach us directly at{' '}
              <a href="mailto:admin@redlined1.com" style={{ color: '#cc0000', fontWeight: 600 }}>admin@redlined1.com</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
