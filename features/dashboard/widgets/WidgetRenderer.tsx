'use client';

import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { WidgetDefinition } from '@/lib/dashboardWidgets/types';

function WidgetErrorFallback({ title }: { title: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 6, padding: 20, height: '100%', textAlign: 'center', color: 'var(--muted)',
    }}>
      <span style={{ fontSize: 22 }}>⚠️</span>
      <div style={{ fontSize: 12 }}>{title} couldn&apos;t load.</div>
    </div>
  );
}

function WidgetSkeleton() {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ height: 12, width: '40%', background: 'var(--line)', borderRadius: 4, marginBottom: 10, opacity: 0.6 }} />
      <div style={{ height: 24, width: '65%', background: 'var(--line)', borderRadius: 4, opacity: 0.4 }} />
    </div>
  );
}

interface WidgetRendererProps {
  definition: WidgetDefinition;
  onNav: (module: string) => void;
  chrome?: React.ReactNode;
}

/**
 * Wraps every widget in its own error boundary + Suspense so one widget
 * throwing (or being slow) never takes the rest of the Dashboard down.
 */
export function WidgetRenderer({ definition: def, onNav, chrome }: WidgetRendererProps) {
  const Widget = def.component;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
      {chrome}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <ErrorBoundary fallback={<WidgetErrorFallback title={def.title} />}>
          <Suspense fallback={<WidgetSkeleton />}>
            <Widget onNav={onNav} />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
