'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { ServiceAdvisorErrorBoundary } from './ServiceAdvisorErrorBoundary';
import { EstimateQualityCard } from './EstimateQualityCard';
import { RelatedServicesCard } from './RelatedServicesCard';
import { CustomerExplanationCard } from './CustomerExplanationCard';
import type {
  EstimateQualityReview,
  ServiceAdvisorSuggestion,
  CustomerExplanation,
  AdvisorBuildResult,
} from '@/intelligence/service-advisor/types';

interface Props {
  shopId: string;
  estimateId?: string;
  jobCardId?: string;
  customerId?: string;
  vehicleId?: string;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'disabled' | 'migration_required';

export function ServiceAdvisorPanel(props: Props) {
  return (
    <ServiceAdvisorErrorBoundary>
      <Suspense fallback={<PanelSkeleton />}>
        <ServiceAdvisorPanelInner {...props} />
      </Suspense>
    </ServiceAdvisorErrorBoundary>
  );
}

function ServiceAdvisorPanelInner({ shopId, estimateId, jobCardId, customerId, vehicleId }: Props) {
  const [state, setState] = useState<LoadState>('idle');
  const [result, setResult] = useState<AdvisorBuildResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!estimateId && !jobCardId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId, jobCardId]);

  async function load() {
    setState('loading');
    try {
      const res = await fetch('/api/intelligence/service-advisor/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId, estimateId, jobCardId, customerId, vehicleId }),
      });

      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (data?.error === 'Feature not enabled') { setState('disabled'); return; }
        setState('error'); setError('Access denied.'); return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.detail?.includes('relation') || data?.detail?.includes('does not exist')) {
          setState('migration_required'); return;
        }
        setState('error'); setError(data?.error ?? 'Request failed'); return;
      }

      const { session } = await res.json();

      // Poll for suggestions (session generates async)
      let attempts = 0;
      const poll = async (): Promise<void> => {
        if (attempts++ > 6) return;
        await new Promise(r => setTimeout(r, 1500));
        const sugRes = await fetch(`/api/intelligence/service-advisor/session/${session.id}/suggestions?shopId=${shopId}`);
        if (sugRes.ok) {
          const { suggestions } = await sugRes.json();
          setResult({
            session,
            qualityReview: null,
            suggestions: suggestions ?? [],
            customerExplanation: null,
            followUpRecommendations: [],
            dataQualityWarnings: [],
            engineErrors: [],
            builtAt: new Date().toISOString(),
          });
          setState('ready');
        } else {
          await poll();
        }
      };
      await poll();
    } catch (e) {
      setState('error');
      setError(String(e));
    }
  }

  async function handleAccept(suggestionId: string) {
    const sessionId = result?.session?.id;
    if (!sessionId) return;
    await fetch(`/api/intelligence/service-advisor/session/${sessionId}/suggestions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestionId, action: 'accept' }),
    });
  }

  async function handleDismiss(suggestionId: string) {
    const sessionId = result?.session?.id;
    if (!sessionId) return;
    await fetch(`/api/intelligence/service-advisor/session/${sessionId}/suggestions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestionId, action: 'dismiss' }),
    });
  }

  if (state === 'disabled' || state === 'idle') return null;
  if (state === 'migration_required') return (
    <div className="advisor-panel advisor-panel--info">
      Service Advisor requires a database migration. Run <code>migration_intelligent_service_advisor.sql</code> in Supabase.
    </div>
  );
  if (state === 'loading') return <PanelSkeleton />;
  if (state === 'error') return (
    <div className="advisor-panel advisor-panel--error">
      Service Advisor unavailable. {error ?? 'Estimate continues to work normally.'}
    </div>
  );
  if (!result) return null;

  const qualitySuggestions = result.suggestions.filter(s => s.suggestionType === 'estimate_quality');
  const relatedSuggestions = result.suggestions.filter(s => s.suggestionType === 'related_service' || s.suggestionType === 'declined_work');

  const mockQualityReview: EstimateQualityReview | null = qualitySuggestions.length > 0 ? {
    estimateId: estimateId ?? '',
    qualityScore: 100 - qualitySuggestions.length * 10,
    issues: qualitySuggestions.map(s => ({
      ruleKey: s.suggestionKey,
      severity: s.priority === 'critical' ? 'critical' : s.priority === 'high' ? 'warning' : 'info',
      title: s.title,
      description: s.explanation ?? '',
      affectedLineId: null,
      recommendation: s.reason ?? '',
    })),
    checkedAt: result.builtAt,
    dataQualityWarning: result.dataQualityWarnings.length > 0 ? result.dataQualityWarnings.join('; ') : null,
  } : null;

  return (
    <ServiceAdvisorErrorBoundary>
      <section className="advisor-panel" aria-label="Service Advisor">
        <div className="advisor-panel__header">
          <span className="advisor-panel__title">Service Advisor</span>
          {result.dataQualityWarnings.length > 0 && (
            <span className="advisor-panel__data-warning" title={result.dataQualityWarnings.join('; ')}>Limited data</span>
          )}
        </div>

        {mockQualityReview && <EstimateQualityCard review={mockQualityReview} />}
        {relatedSuggestions.length > 0 && (
          <RelatedServicesCard suggestions={relatedSuggestions} onAccept={handleAccept} onDismiss={handleDismiss} />
        )}
        {result.customerExplanation && (
          <CustomerExplanationCard explanation={result.customerExplanation} />
        )}

        {result.suggestions.length === 0 && (
          <p className="advisor-panel__empty">No suggestions for this estimate. Estimate looks good.</p>
        )}
      </section>
    </ServiceAdvisorErrorBoundary>
  );
}

function PanelSkeleton() {
  return (
    <div className="advisor-panel advisor-panel--skeleton" aria-busy="true">
      <div className="advisor-skeleton__line" style={{ width: '40%' }} />
      <div className="advisor-skeleton__line" style={{ width: '80%' }} />
      <div className="advisor-skeleton__line" style={{ width: '60%' }} />
    </div>
  );
}
