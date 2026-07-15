'use client';

import { OperationalKpiRow } from '../../shared/OperationalKpiRow';
import { useOperationalStatsContext } from '../OperationalStatsContext';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

export function OperationalKpiWidget({ onNav }: WidgetProps) {
  const { stats, loading } = useOperationalStatsContext();
  if (loading || !stats) return null;
  return <OperationalKpiRow stats={stats} onNav={onNav} />;
}
