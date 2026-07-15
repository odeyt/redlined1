export interface DashStats {
  totalCustomers: number;
  totalVehicles: number;
  openJobCards: number;
  openROs: number;
  pendingROs: number;
  draftInvoices: number;
  sentInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  totalRevenue: number;
  revenueByCurrency: Record<string, number>;
  outstanding: number;
  outstandingByCurrency: Record<string, number>;
  totalEstimates: number;
  approvedEstimates: number;
  paymentsToday: number;
  revenueToday: number;
  revenueTodayByCurrency: Record<string, number>;
  totalParts: number;
  lowStockParts: number;
}

export interface RecentInvoice {
  number: string;
  customer: string;
  total: number;
  status: string;
  currency: string;
}

export interface RecentRO {
  roNumber: string;
  customerName: string;
  vehicle: string;
  status: string;
  laborHours: number;
  laborRate: number;
  partsTotal: number;
  technician: string;
  openedDate: string;
  currency: string;
}

export interface RevenueDay {
  date: string;
  amount: number;
  byCurrency: Record<string, number>;
}

export interface MonthRevenue {
  key: string;
  label: string;
  byCurrency: Record<string, number>;
}

export const STATUS_COLOR: Record<string, string> = {
  'Draft': '#888',
  'Sent': '#2196f3',
  'Paid': '#4caf50',
  'Void': '#f44336',
  'Open': '#2196f3',
  'In Progress': '#ff9800',
  'Complete': '#4caf50',
  'Closed': '#9e9e9e',
  'Pending Parts': '#9c27b0',
  'Pending Approval': '#f59e0b',
};
