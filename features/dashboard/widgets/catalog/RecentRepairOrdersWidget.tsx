'use client';

import { RecentRepairOrdersTable } from '../../shared/RecentRepairOrdersTable';
import { useOperationalStatsContext } from '../OperationalStatsContext';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

export function RecentRepairOrdersWidget({ onNav }: WidgetProps) {
  const { recentROs, loading } = useOperationalStatsContext();
  if (loading) return null;
  return <RecentRepairOrdersTable ros={recentROs} onNav={onNav} />;
}
