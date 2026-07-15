'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useShop } from '@/lib/useShop';
import { useAppDispatch } from '@/lib/store';
import { useFeatureFlag, useFeatureFlags } from '@/components/featureFlags/FeatureFlagProvider';
import { OperationalStatsProvider } from './widgets/OperationalStatsContext';
import { WidgetGrid } from './widgets/WidgetGrid';
import { AddWidgetModal } from './widgets/AddWidgetModal';
import { getDefaultLayoutForRole } from '@/lib/dashboardWidgets/defaultLayouts';
import { getWidgetsForRole, WIDGET_REGISTRY } from '@/lib/dashboardWidgets/registry';
import { mergeLayoutWithRegistry } from '@/lib/dashboardWidgets/layoutMerge';
import { fetchDashboardLayout, saveDashboardLayout, resetDashboardLayout } from '@/services/dashboardLayoutService';
import { dashStyle } from './shared/styles';
import type { WidgetLayoutItem } from '@/lib/dashboardWidgets/types';

const SAVE_DEBOUNCE_MS = 800;

export function NewDashboardView() {
  const { role } = useShop();
  const dispatch = useAppDispatch();
  const widgetSystem = useFeatureFlag('widget_system');
  const { flags } = useFeatureFlags();

  function nav(module: string) {
    dispatch({ type: 'SET_MODULE', module });
  }

  const effectiveRole = role || 'technician';
  const enabledFlags = new Set(Object.entries(flags).filter(([, v]) => v).map(([k]) => k));
  const availableWidgets = getWidgetsForRole(effectiveRole, enabledFlags);

  const [layout, setLayout] = useState<WidgetLayoutItem[]>(() => getDefaultLayoutForRole(effectiveRole));
  const [showAddWidget, setShowAddWidget] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the user's saved layout (only meaningful once widget_system is on —
  // read-only mode below always just shows the role default).
  useEffect(() => {
    if (!widgetSystem) { setLayout(getDefaultLayoutForRole(effectiveRole)); return; }
    let cancelled = false;
    fetchDashboardLayout().then(saved => {
      if (cancelled) return;
      const base = saved ?? getDefaultLayoutForRole(effectiveRole);
      setLayout(mergeLayoutWithRegistry(base, availableWidgets));
    }).catch(() => {
      if (!cancelled) setLayout(getDefaultLayoutForRole(effectiveRole));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetSystem, effectiveRole]);

  const persist = useCallback((next: WidgetLayoutItem[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDashboardLayout(next).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
  }, []);

  function handleLayoutChange(next: WidgetLayoutItem[]) {
    setLayout(next);
    if (widgetSystem) persist(next);
  }

  function handleAddWidget(widgetId: string) {
    const def = WIDGET_REGISTRY[widgetId];
    if (!def || layout.some(item => item.i === widgetId)) return;
    const y = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    const next = [...layout, { i: widgetId, x: 0, y, w: def.defaultSize.w, h: def.defaultSize.h }];
    handleLayoutChange(next);
    setShowAddWidget(false);
  }

  function handleRemoveWidget(widgetId: string) {
    handleLayoutChange(layout.filter(item => item.i !== widgetId));
  }

  function handleReset() {
    setLayout(getDefaultLayoutForRole(effectiveRole));
    if (widgetSystem) resetDashboardLayout().catch(() => {});
  }

  const addableWidgets = availableWidgets.filter(w => !layout.some(item => item.i === w.id));

  return (
    <OperationalStatsProvider>
      <style>{dashStyle}</style>
      {widgetSystem && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
          <button className="btn" onClick={() => setShowAddWidget(true)}>+ Add Widget</button>
          <button className="btn" onClick={handleReset}>Reset Layout</button>
        </div>
      )}
      <div style={{ minHeight: 400 }}>
        <WidgetGrid
          layout={layout}
          onNav={nav}
          editable={widgetSystem}
          onLayoutChange={handleLayoutChange}
          renderChrome={widgetId => widgetSystem ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--line)', background: 'var(--surface-soft)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{WIDGET_REGISTRY[widgetId]?.title}</span>
              <button
                onClick={() => handleRemoveWidget(widgetId)}
                aria-label={`Remove ${WIDGET_REGISTRY[widgetId]?.title}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, padding: 0 }}
              >
                ✕
              </button>
            </div>
          ) : null}
        />
      </div>
      {showAddWidget && (
        <AddWidgetModal
          widgets={addableWidgets}
          onSelect={handleAddWidget}
          onClose={() => setShowAddWidget(false)}
        />
      )}
    </OperationalStatsProvider>
  );
}
