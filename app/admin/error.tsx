'use client';

import { C } from '@/features/admin/shared/theme';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", padding: '64px 24px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: 1, color: C.danger, fontWeight: 700, marginBottom: 8 }}>ADMIN DATA UNAVAILABLE</div>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>This page could not load its data.</h1>
        <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, margin: '0 0 16px' }}>
          A required query failed, so nothing is shown rather than figures that might be wrong.
          {error.digest ? ` Reference: ${error.digest}.` : ''}
        </p>
        <button
          onClick={reset}
          style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
