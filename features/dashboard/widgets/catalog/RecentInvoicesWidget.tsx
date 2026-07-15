'use client';

import { RecentInvoicesTable } from '../../shared/RecentInvoicesTable';
import { useOperationalStatsContext } from '../OperationalStatsContext';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

export function RecentInvoicesWidget({ onNav }: WidgetProps) {
  const { recentInvoices, loading } = useOperationalStatsContext();
  if (loading) return null;
  return <RecentInvoicesTable invoices={recentInvoices} onNav={onNav} />;
}
