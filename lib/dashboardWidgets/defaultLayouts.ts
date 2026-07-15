import type { WidgetLayoutItem } from './types';

/**
 * Default widget arrangement per role. Widget `i` values must resolve to a
 * real WIDGET_REGISTRY key (enforced by defaultLayouts.test.ts). This is
 * intentionally a flat Record<string, ...> keyed by role STRING, not a
 * closed union — future roles (receptionist, inventory, parts, accountant,
 * administrator) are added here later with zero framework changes.
 */
export const DEFAULT_LAYOUTS: Record<string, WidgetLayoutItem[]> = {
  owner: [
    { i: 'revenue-kpi-row', x: 0, y: 0, w: 12, h: 2 },
    { i: 'operational-kpi-row', x: 0, y: 2, w: 12, h: 2 },
    { i: 'revenue-chart', x: 0, y: 4, w: 8, h: 4 },
    { i: 'invoice-status', x: 8, y: 4, w: 4, h: 4 },
    { i: 'revenue-by-month', x: 0, y: 8, w: 6, h: 4 },
    { i: 'recent-invoices', x: 6, y: 8, w: 6, h: 4 },
    { i: 'recent-repair-orders', x: 0, y: 12, w: 6, h: 4 },
    { i: 'todays-appointments', x: 6, y: 12, w: 3, h: 4 },
    { i: 'quick-actions', x: 9, y: 12, w: 3, h: 4 },
    { i: 'ai-copilot-placeholder', x: 0, y: 16, w: 4, h: 3 },
    { i: 'fleet-health-placeholder', x: 4, y: 16, w: 4, h: 3 },
    { i: 'predictive-alerts-placeholder', x: 8, y: 16, w: 4, h: 3 },
  ],
  manager: [
    { i: 'revenue-kpi-row', x: 0, y: 0, w: 12, h: 2 },
    { i: 'operational-kpi-row', x: 0, y: 2, w: 12, h: 2 },
    { i: 'revenue-chart', x: 0, y: 4, w: 8, h: 4 },
    { i: 'invoice-status', x: 8, y: 4, w: 4, h: 4 },
    { i: 'recent-invoices', x: 0, y: 8, w: 6, h: 4 },
    { i: 'recent-repair-orders', x: 6, y: 8, w: 6, h: 4 },
    { i: 'recent-job-cards', x: 0, y: 12, w: 6, h: 4 },
    { i: 'todays-appointments', x: 6, y: 12, w: 3, h: 4 },
    { i: 'quick-actions', x: 9, y: 12, w: 3, h: 4 },
  ],
  advisor: [
    { i: 'operational-kpi-row', x: 0, y: 0, w: 12, h: 2 },
    { i: 'todays-appointments', x: 0, y: 2, w: 4, h: 4 },
    { i: 'recent-customers', x: 4, y: 2, w: 4, h: 4 },
    { i: 'recent-vehicles', x: 8, y: 2, w: 4, h: 4 },
    { i: 'recent-job-cards', x: 0, y: 6, w: 6, h: 4 },
    { i: 'open-diagnostic-cases', x: 6, y: 6, w: 6, h: 4 },
    { i: 'quick-actions', x: 0, y: 10, w: 6, h: 3 },
  ],
  technician: [
    { i: 'recent-job-cards', x: 0, y: 0, w: 8, h: 5 },
    { i: 'clock', x: 8, y: 0, w: 4, h: 2 },
    { i: 'todays-appointments', x: 8, y: 2, w: 4, h: 3 },
    { i: 'open-diagnostic-cases', x: 0, y: 5, w: 8, h: 4 },
    { i: 'quick-actions', x: 8, y: 5, w: 4, h: 4 },
  ],
};

export function getDefaultLayoutForRole(role: string): WidgetLayoutItem[] {
  return DEFAULT_LAYOUTS[role] ?? DEFAULT_LAYOUTS.technician;
}
