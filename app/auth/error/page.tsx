'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function AuthErrorContent() {
  const params = useSearchParams();
  const type = params.get('type');
  const isExpired = type === 'expired';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ textAlign: 'center', padding: 32, maxWidth: 400 }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>{isExpired ? '⏱️' : '⚠️'}</div>
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 17, marginBottom: 10 }}>
          {isExpired ? 'This link has expired' : 'Something went wrong'}
        </p>
        <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
          {isExpired
            ? 'Confirmation links expire after 24 hours and can only be used once. Sign in if your email is already confirmed, or sign up again.'
            : "We couldn't verify this link. Try signing in — if your email is confirmed you'll be let straight through."}
        </p>
        <a href="/login" style={{ display: 'inline-block', background: '#cc0000', color: '#fff', padding: '12px 28px', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none', marginBottom: 16 }}>
          Go to Sign In
        </a>
        <br />
        {isExpired ? (
          <a href="/signup" style={{ color: '#666', fontSize: 13 }}>Sign up with a new account</a>
        ) : (
          <a href="/forgot-password" style={{ color: '#666', fontSize: 13 }}>Need a password reset link?</a>
        )}
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorContent />
    </Suspense>
  );
}
