'use client';

import { createContext, useContext } from 'react';
import { useOperationalStats } from '../shared/useOperationalStats';

type OperationalStats = ReturnType<typeof useOperationalStats>;

/**
 * Several catalog widgets (Revenue KPI, Operational KPI, Revenue Chart,
 * Invoice Status, Revenue by Month, Recent Invoices, Recent Repair Orders)
 * all derive from the SAME useOperationalStats() fetch. Widgets still need
 * to load/fail independently (each renders inside its own error boundary in
 * WidgetRenderer), but the underlying data fetch should not be duplicated
 * once per widget — this context hoists that one fetch to the page level.
 */
const OperationalStatsCtx = createContext<OperationalStats | null>(null);

export function OperationalStatsProvider({ children }: { children: React.ReactNode }) {
  const stats = useOperationalStats();
  return <OperationalStatsCtx.Provider value={stats}>{children}</OperationalStatsCtx.Provider>;
}

export function useOperationalStatsContext(): OperationalStats {
  const ctx = useContext(OperationalStatsCtx);
  if (!ctx) throw new Error('useOperationalStatsContext must be used within OperationalStatsProvider');
  return ctx;
}
