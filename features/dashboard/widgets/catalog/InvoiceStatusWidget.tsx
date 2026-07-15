'use client';

import { InvoiceStatusPanel } from '../../shared/InvoiceStatusPanel';
import { useOperationalStatsContext } from '../OperationalStatsContext';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

export function InvoiceStatusWidget({ onNav }: WidgetProps) {
  const { stats, loading } = useOperationalStatsContext();
  if (loading || !stats) return null;
  return <InvoiceStatusPanel stats={stats} onNav={onNav} />;
}
