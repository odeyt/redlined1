'use client';

import type { CustomerRevenueOpportunity } from '@/intelligence/customer/types';

interface Props {
  opportunities: CustomerRevenueOpportunity[];
}

export function CustomerOpportunitiesCard({ opportunities }: Props) {
  if (opportunities.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-xs text-muted-foreground">No opportunities identified.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <span className="text-sm font-medium">Opportunities</span>
      <ul className="space-y-3">
        {opportunities.map((opp, i) => (
          <li key={i} className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium">{opp.title}</span>
              {opp.expectedRevenue != null && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  ~${Math.round(opp.expectedRevenue)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{opp.reason}</p>
            <p className="text-xs font-medium">→ {opp.recommendedAction}</p>
            <p className="text-xs text-muted-foreground italic">{opp.disclaimer}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
