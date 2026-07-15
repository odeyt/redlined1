'use client';

import { RevenueByMonthTable } from '../../shared/RevenueByMonthTable';
import { useOperationalStatsContext } from '../OperationalStatsContext';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

export function RevenueByMonthWidget(_props: WidgetProps) {
  const { monthlyRevenue, loading } = useOperationalStatsContext();
  if (loading) return null;
  return <RevenueByMonthTable monthlyRevenue={monthlyRevenue} />;
}
