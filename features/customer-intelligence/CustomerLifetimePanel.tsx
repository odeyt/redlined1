'use client';

import React, { useEffect, useState } from 'react';
import { CustomerIntelligenceErrorBoundary } from './CustomerIntelligenceErrorBoundary';
import { CustomerRelationshipCard } from './CustomerRelationshipCard';
import { CustomerRetentionCard } from './CustomerRetentionCard';
import { CustomerSegmentsCard } from './CustomerSegmentsCard';
import { CustomerOpportunitiesCard } from './CustomerOpportunitiesCard';
import { CustomerFinancialSummary } from './CustomerFinancialSummary';
import { CustomerTimeline } from './CustomerTimeline';
import type { CustomerBuildResult } from '@/intelligence/customer/types';

interface Props {
  customerId: string;
  disabled?: boolean;
}

type PanelState = 'idle' | 'loading' | 'ready' | 'error' | 'disabled' | 'feature_off';

export function CustomerLifetimePanel({ customerId, disabled }: Props) {
  const [state, setState] = useState<PanelState>(disabled ? 'disabled' : 'idle');
  const [result, setResult] = useState<CustomerBuildResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (disabled) { setState('disabled'); return; }
    setState('loading');

    fetch(`/api/intelligence/customer/${customerId}`)
      .then(async res => {
        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          if (body?.error === 'Feature not enabled') { setState('feature_off'); return; }
          setState('error'); setErrorMsg('Access denied.'); return;
        }
        if (!res.ok) { setState('error'); setErrorMsg(`Error ${res.status}`); return; }
        const body = await res.json();
        if (body.profile) {
          // Profile already exists — build full result from separate calls
          rebuildFromProfile(body.profile);
        } else {
          setState('error'); setErrorMsg('Unexpected response');
        }
      })
      .catch(e => { setState('error'); setErrorMsg(String(e)); });
  }, [customerId, disabled]);

  function rebuildFromProfile(profile: CustomerBuildResult['profile']) {
    // Trigger full build to get all sub-results
    fetch(`/api/intelligence/customer/${customerId}`, { method: 'POST' })
      .then(async res => {
        if (!res.ok) { setState('error'); setErrorMsg(`Build error ${res.status}`); return; }
        const body = await res.json();
        setResult(body.result ?? null);
        setState('ready');
      })
      .catch(e => { setState('error'); setErrorMsg(String(e)); });
  }

  if (state === 'disabled' || state === 'feature_off') return null;

  if (state === 'idle' || state === 'loading') {
    return (
      <div className="rounded-lg border p-4 text-xs text-muted-foreground animate-pulse">
        Loading customer intelligence…
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rounded-lg border p-3 text-xs text-muted-foreground">
        Customer intelligence unavailable{errorMsg ? ` (${errorMsg})` : ''}.
      </div>
    );
  }

  if (!result) return null;

  return (
    <CustomerIntelligenceErrorBoundary>
      <div className="space-y-3">
        <CustomerFinancialSummary profile={result.profile} />
        <CustomerRelationshipCard score={result.relationshipScore} />
        <CustomerRetentionCard risk={result.retentionRisk} />
        <CustomerSegmentsCard segments={result.segments} />
        <CustomerOpportunitiesCard opportunities={result.opportunities} />
        <CustomerTimeline items={result.timeline} />
        {result.dataQualityWarnings.length > 0 && (
          <p className="text-xs text-muted-foreground italic px-1">
            Data quality notes: {result.dataQualityWarnings.join(', ')}
          </p>
        )}
      </div>
    </CustomerIntelligenceErrorBoundary>
  );
}
