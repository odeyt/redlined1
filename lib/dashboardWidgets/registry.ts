import type { WidgetDefinition } from './types';
import { RevenueKpiWidget } from '@/features/dashboard/widgets/catalog/RevenueKpiWidget';
import { OperationalKpiWidget } from '@/features/dashboard/widgets/catalog/OperationalKpiWidget';
import { RevenueChartWidget } from '@/features/dashboard/widgets/catalog/RevenueChartWidget';
import { InvoiceStatusWidget } from '@/features/dashboard/widgets/catalog/InvoiceStatusWidget';
import { RevenueByMonthWidget } from '@/features/dashboard/widgets/catalog/RevenueByMonthWidget';
import { RecentInvoicesWidget } from '@/features/dashboard/widgets/catalog/RecentInvoicesWidget';
import { RecentRepairOrdersWidget } from '@/features/dashboard/widgets/catalog/RecentRepairOrdersWidget';
import { RecentCustomersWidget } from '@/features/dashboard/widgets/catalog/RecentCustomersWidget';
import { RecentVehiclesWidget } from '@/features/dashboard/widgets/catalog/RecentVehiclesWidget';
import { TodaysAppointmentsWidget } from '@/features/dashboard/widgets/catalog/TodaysAppointmentsWidget';
import { RecentJobCardsWidget } from '@/features/dashboard/widgets/catalog/RecentJobCardsWidget';
import { OpenDiagnosticCasesWidget } from '@/features/dashboard/widgets/catalog/OpenDiagnosticCasesWidget';
import { QuickActionsWidget } from '@/features/dashboard/widgets/catalog/QuickActionsWidget';
import { ReportsShortcutWidget } from '@/features/dashboard/widgets/catalog/ReportsShortcutWidget';
import { ClockWidget } from '@/features/dashboard/widgets/catalog/ClockWidget';
import { makeComingSoonWidget } from '@/features/dashboard/widgets/catalog/ComingSoonWidget';

const OWNER_MANAGER = ['owner', 'manager'];

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  'revenue-kpi-row': {
    id: 'revenue-kpi-row',
    title: 'Revenue KPIs',
    category: 'financial',
    component: RevenueKpiWidget,
    defaultSize: { w: 12, h: 2 },
    minSize: { w: 6, h: 2 },
    allowedRoles: OWNER_MANAGER,
  },
  'operational-kpi-row': {
    id: 'operational-kpi-row',
    title: 'Operational KPIs',
    category: 'operational',
    component: OperationalKpiWidget,
    defaultSize: { w: 12, h: 2 },
    minSize: { w: 6, h: 2 },
    allowedRoles: null,
  },
  'revenue-chart': {
    id: 'revenue-chart',
    title: 'Revenue — Last 7 Days',
    category: 'financial',
    component: RevenueChartWidget,
    defaultSize: { w: 8, h: 4 },
    minSize: { w: 4, h: 3 },
    allowedRoles: OWNER_MANAGER,
  },
  'invoice-status': {
    id: 'invoice-status',
    title: 'Invoice Status',
    category: 'financial',
    component: InvoiceStatusWidget,
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    allowedRoles: OWNER_MANAGER,
  },
  'revenue-by-month': {
    id: 'revenue-by-month',
    title: 'Revenue by Month',
    category: 'financial',
    component: RevenueByMonthWidget,
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    allowedRoles: OWNER_MANAGER,
  },
  'recent-invoices': {
    id: 'recent-invoices',
    title: 'Recent Invoices',
    category: 'financial',
    component: RecentInvoicesWidget,
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    allowedRoles: OWNER_MANAGER,
  },
  'recent-repair-orders': {
    id: 'recent-repair-orders',
    title: 'Active Repair Orders',
    category: 'operational',
    component: RecentRepairOrdersWidget,
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    allowedRoles: null,
  },
  'recent-customers': {
    id: 'recent-customers',
    title: 'Recent Customers',
    category: 'customer',
    component: RecentCustomersWidget,
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    allowedRoles: null,
  },
  'recent-vehicles': {
    id: 'recent-vehicles',
    title: 'Recent Vehicles',
    category: 'customer',
    component: RecentVehiclesWidget,
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    allowedRoles: null,
  },
  'todays-appointments': {
    id: 'todays-appointments',
    title: "Today's Appointments",
    category: 'operational',
    component: TodaysAppointmentsWidget,
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    allowedRoles: null,
  },
  'recent-job-cards': {
    id: 'recent-job-cards',
    title: 'Recent Job Cards',
    category: 'operational',
    component: RecentJobCardsWidget,
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    allowedRoles: null,
  },
  'open-diagnostic-cases': {
    id: 'open-diagnostic-cases',
    title: 'Open Diagnostic Cases',
    category: 'operational',
    component: OpenDiagnosticCasesWidget,
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    allowedRoles: null,
  },
  'quick-actions': {
    id: 'quick-actions',
    title: 'Quick Actions',
    category: 'operational',
    component: QuickActionsWidget,
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 4, h: 2 },
    allowedRoles: null,
  },
  'reports-shortcut': {
    id: 'reports-shortcut',
    title: 'Reports',
    category: 'operational',
    component: ReportsShortcutWidget,
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    allowedRoles: OWNER_MANAGER,
  },
  'clock': {
    id: 'clock',
    title: 'Clock',
    category: 'operational',
    component: ClockWidget,
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
    allowedRoles: null,
  },
  'ai-copilot-placeholder': {
    id: 'ai-copilot-placeholder',
    title: 'AI Copilot',
    category: 'placeholder',
    component: makeComingSoonWidget('AI Copilot', '🤖', 'Ask questions about jobs, parts, and repair history.'),
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 3 },
    allowedRoles: null,
    requiredFlag: 'dashboard_widget_placeholders',
  },
  'fleet-health-placeholder': {
    id: 'fleet-health-placeholder',
    title: 'Fleet Health',
    category: 'placeholder',
    component: makeComingSoonWidget('Fleet Health', '🚚', 'Fleet-wide vehicle health scoring.'),
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 3 },
    allowedRoles: OWNER_MANAGER,
    requiredFlag: 'dashboard_widget_placeholders',
  },
  'predictive-alerts-placeholder': {
    id: 'predictive-alerts-placeholder',
    title: 'Predictive Alerts',
    category: 'placeholder',
    component: makeComingSoonWidget('Predictive Alerts', '⚠️', 'Early warnings on likely upcoming failures.'),
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 3 },
    allowedRoles: OWNER_MANAGER,
    requiredFlag: 'dashboard_widget_placeholders',
  },
};

export function getWidgetsForRole(role: string, enabledFlags: Set<string>): WidgetDefinition[] {
  return Object.values(WIDGET_REGISTRY).filter(w => {
    const roleOk = w.allowedRoles === null || w.allowedRoles.includes(role);
    const flagOk = !w.requiredFlag || enabledFlags.has(w.requiredFlag);
    return roleOk && flagOk;
  });
}
