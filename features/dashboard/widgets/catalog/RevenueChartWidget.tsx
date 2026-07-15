'use client';

import { RevenueChart } from '../../shared/RevenueChart';
import { useOperationalStatsContext } from '../OperationalStatsContext';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

export function RevenueChartWidget({ onNav }: WidgetProps) {
  const { revenue7, loading } = useOperationalStatsContext();
  if (loading) return null;
  return <RevenueChart revenue7={revenue7} onNav={onNav} />;
}
