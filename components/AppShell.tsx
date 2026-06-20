'use client';

import { AppProvider, useAppState } from '@/lib/store';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Toast } from './Toast';
import { DashboardView } from '@/features/dashboard/DashboardView';
import { AccessView } from '@/features/access/AccessView';
import { SubscriptionsView } from '@/features/subscriptions/SubscriptionsView';
import { AiView } from '@/features/ai/AiView';
import { CustomersView } from '@/features/customers/CustomersView';
import { VehiclesView } from '@/features/vehicles/VehiclesView';
import { JobCardsView } from '@/features/job-cards/JobCardsView';
import { SchedulingView } from '@/features/scheduling/SchedulingView';
import { InspectionsView } from '@/features/inspections/InspectionsView';
import { CommunicationView } from '@/features/communication/CommunicationView';
import { EstimatesView } from '@/features/estimates/EstimatesView';
import { RepairOrdersView } from '@/features/repair-orders/RepairOrdersView';
import { InvoicesView } from '@/features/invoices/InvoicesView';
import { PaymentsView } from '@/features/payments/PaymentsView';
import { PartsView } from '@/features/parts/PartsView';
import { PartsOrdersView } from '@/features/parts/PartsOrdersView';
import { TechniciansView } from '@/features/technicians/TechniciansView';
import { VinView } from '@/features/vin/VinView';
import { DtcView } from '@/features/dtc/DtcView';
import { DiagnosticsView } from '@/features/diagnostics/DiagnosticsView';
import { AppointmentsView } from '@/features/scheduling/AppointmentsView';
import { ReportsView } from '@/features/reports/ReportsView';
import { SettingsView } from '@/features/settings/SettingsView';
import { LaborGuideView } from '@/features/labor-guide/LaborGuideView';
import { TimeTrackingView } from '@/features/time-tracking/TimeTrackingView';

const views: Record<string, React.ComponentType> = {
  dashboard: DashboardView,
  access: AccessView,
  subscriptions: SubscriptionsView,
  ai: AiView,
  customers: CustomersView,
  vehicles: VehiclesView,
  'job-cards': JobCardsView,
  scheduling: SchedulingView,
  inspections: InspectionsView,
  communication: CommunicationView,
  estimates: EstimatesView,
  'repair-orders': RepairOrdersView,
  invoices: InvoicesView,
  payments: PaymentsView,
  parts: PartsView,
  'parts-orders': PartsOrdersView,
  technicians: TechniciansView,
  vin: VinView,
  dtc: DtcView,
  diagnostics: DiagnosticsView,
  appointments: AppointmentsView,
  reports: ReportsView,
  'labor-guide': LaborGuideView,
  'time-tracking': TimeTrackingView,
  settings: SettingsView,
};

function Shell() {
  const { activeModule, toast } = useAppState();
  const ActiveView = views[activeModule] || DashboardView;

  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <Header />
        <div className="content">
          <Toast message={toast} />
          <ActiveView />
        </div>
      </main>
    </div>
  );
}

export function AppShell() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
