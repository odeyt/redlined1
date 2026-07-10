'use client';

import React, { useState } from 'react';
import type { ServiceAdvisorSuggestion } from '@/intelligence/service-advisor/types';

interface Props {
  suggestion: ServiceAdvisorSuggestion;
  onAccept: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}

export function AdvisorSuggestionActions({ suggestion, onAccept, onDismiss }: Props) {
  const [loading, setLoading] = useState<'accept' | 'dismiss' | null>(null);
  const [done, setDone] = useState<'accepted' | 'dismissed' | null>(null);

  if (done) {
    return <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{done === 'accepted' ? 'Accepted' : 'Dismissed'}</span>;
  }

  async function handleAccept() {
    setLoading('accept');
    try { await onAccept(suggestion.id); setDone('accepted'); } finally { setLoading(null); }
  }

  async function handleDismiss() {
    setLoading('dismiss');
    try { await onDismiss(suggestion.id); setDone('dismissed'); } finally { setLoading(null); }
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <button
        className="btn btn--sm btn--secondary"
        onClick={handleAccept}
        disabled={loading !== null}
        aria-label="Accept suggestion"
      >
        {loading === 'accept' ? '…' : 'Accept'}
      </button>
      <button
        className="btn btn--sm btn--ghost"
        onClick={handleDismiss}
        disabled={loading !== null}
        aria-label="Dismiss suggestion"
      >
        {loading === 'dismiss' ? '…' : 'Dismiss'}
      </button>
    </div>
  );
}
