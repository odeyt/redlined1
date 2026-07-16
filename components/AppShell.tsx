'use client';

import { AppProvider, useAppState } from '@/lib/store';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Toast } from './Toast';
import { ErrorBoundary } from './ErrorBoundary';
import { useShop, getBlockedModules } from '@/lib/useShop';
import { DashboardView } from '@/features/dashboard/DashboardView';
import { AccessView } from '@/features/access/AccessView';
import { SubscriptionsView } from '@/features/subscriptions/SubscriptionsView';
import { AiView } from '@/features/ai/AiView';
import { CustomersView } from '@/features/customers/CustomersView';
import { VehiclesView } from '@/features/vehicles/VehiclesView';
import { JobCardsView } from '@/features/job-cards/JobCardsView';
import { JobArchiveView } from '@/features/job-cards/JobArchiveView';
import { SchedulingView } from '@/features/scheduling/SchedulingView';
import { InspectionsView } from '@/features/inspections/InspectionsView';
import { CommunicationView } from '@/features/communication/CommunicationView';
import { EstimatesView } from '@/features/estimates/EstimatesView';
import { RepairOrdersView } from '@/features/repair-orders/RepairOrdersView';
import { InvoicesView } from '@/features/invoices/InvoicesView';
import { PaymentsView } from '@/features/payments/PaymentsView';
import { PartsView } from '@/features/parts/PartsView';
import { PartsOrdersView } from '@/features/parts/PartsOrdersView';
import { PartsReceivedView } from '@/features/parts/PartsReceivedView';
import { PartsEstimatesView } from '@/features/parts/PartsEstimatesView';
import { TechniciansView } from '@/features/technicians/TechniciansView';
import { VinView } from '@/features/vin/VinView';
import { DtcView } from '@/features/dtc/DtcView';
import { DiagnosticsView } from '@/features/diagnostics/DiagnosticsView';
import { AppointmentsView } from '@/features/scheduling/AppointmentsView';
import { ReportsView } from '@/features/reports/ReportsView';
import { SettingsView } from '@/features/settings/SettingsView';
import { LaborGuideView } from '@/features/labor-guide/LaborGuideView';
import { TimeTrackingView } from '@/features/time-tracking/TimeTrackingView';
import { RepairIntelligenceView } from '@/features/repair-intelligence/RepairIntelligenceView';
import { TriageView } from '@/features/triage/TriageView';
import { SystemHealthView } from '@/features/system-health/SystemHealthView';
import { DisasterRecoveryView } from '@/features/disaster-recovery/DisasterRecoveryView';
import { TestingDashboardView } from '@/features/testing-dashboard/TestingDashboardView';
import { FeatureFlagProvider } from '@/components/featureFlags/FeatureFlagProvider';
import { EnvBanner } from '@/components/EnvBanner';
import { BillingDashboard } from '@/features/billing/BillingDashboard';
import { CommandCenterView } from '@/features/command-center/CommandCenterView';
import { useEffect } from 'react';

const views: Record<string, React.ComponentType> = {
  dashboard: DashboardView,
  'command-center': CommandCenterView,
  access: AccessView,
  subscriptions: SubscriptionsView,
  ai: AiView,
  customers: CustomersView,
  vehicles: VehiclesView,
  'job-cards': JobCardsView,
  'job-archive': JobArchiveView,
  scheduling: SchedulingView,
  inspections: InspectionsView,
  communication: CommunicationView,
  estimates: EstimatesView,
  'repair-orders': RepairOrdersView,
  invoices: InvoicesView,
  payments: PaymentsView,
  parts: PartsView,
  'parts-orders':    PartsOrdersView,
  'parts-received':  PartsReceivedView,
  'parts-estimates': PartsEstimatesView,
  technicians: TechniciansView,
  vin: VinView,
  dtc: DtcView,
  diagnostics: DiagnosticsView,
  appointments: AppointmentsView,
  reports: ReportsView,
  'labor-guide': LaborGuideView,
  'time-tracking': TimeTrackingView,
  'repair-intelligence': RepairIntelligenceView,
  triage: TriageView,
  settings: SettingsView,
  'system-health':     SystemHealthView,
  'disaster-recovery': DisasterRecoveryView,
  'testing-dashboard': TestingDashboardView,
  billing: BillingDashboard,
};

function Shell() {
  const { activeModule, toast } = useAppState();
  const { role, loading: roleLoading } = useShop();

  // After email confirmation + login, fire any pending checkout stored at signup
  useEffect(() => {
    if (roleLoading) return;
    const raw = localStorage.getItem('rd1_pending_checkout');
    if (!raw) return;
    localStorage.removeItem('rd1_pending_checkout');
    try {
      const { planId, billingInterval } = JSON.parse(raw);
      if (!planId || planId === 'trial') return;
      fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, billingInterval: billingInterval || 'monthly' }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          if (json?.url) { window.location.href = json.url; return; }
          // Checkout URL not returned — redirect to billing page so user can complete manually
          window.location.href = '/billing';
        })
        .catch(() => { window.location.href = '/billing'; });
    } catch { /* malformed entry */ }
  }, [roleLoading]);

  // Block direct module access if the role doesn't permit it.
  // Sidebar already hides the nav items; this is the safety net.
  const blocked = !roleLoading && role ? getBlockedModules(role) : [];
  const safeModule = blocked.includes(activeModule) ? 'dashboard' : activeModule;
  const ActiveView = views[safeModule] || DashboardView;

  return (
    <>
      <EnvBanner />
      <div className="shell">
      <Sidebar />
      <main className="main">
        <Header />
        <div className="content">
          <Toast message={toast} />
          <ErrorBoundary>
            <ActiveView />
          </ErrorBoundary>
        </div>
      </main>
    </div>
    </>
  );
}

export function AppShell() {
  return (
    <AppProvider>
      <FeatureFlagProvider>
        <ErrorBoundary>
          <Shell />
        </ErrorBoundary>
      </FeatureFlagProvider>
    </AppProvider>
  );
}
