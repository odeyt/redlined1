'use client';

import type { CustomerRetentionRiskResult } from '@/intelligence/customer/types';

interface Props {
  risk: CustomerRetentionRiskResult;
}

const RISK_LABELS: Record<string, string> = {
  low: 'Low Risk',
  moderate: 'Moderate Risk',
  high: 'High Risk',
  critical: 'Critical Risk',
  unknown: 'Unknown',
};

const RISK_COLORS: Record<string, string> = {
  low: 'text-green-600',
  moderate: 'text-yellow-600',
  high: 'text-orange-600',
  critical: 'text-red-600',
  unknown: 'text-muted-foreground',
};

export function CustomerRetentionCard({ risk }: Props) {
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Retention</span>
        <span className={`text-sm font-semibold ${RISK_COLORS[risk.risk] ?? 'text-muted-foreground'}`}>
          {RISK_LABELS[risk.risk] ?? risk.risk}
        </span>
      </div>
      {risk.suggestedActions.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1">
          {risk.suggestedActions.map((a, i) => (
            <li key={i} className="flex gap-1 items-start">
              <span>→</span>
              <span>{a.label}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground italic">
        Score: {risk.finalScore}/100 · Data: {risk.dataQuality}
      </p>
    </div>
  );
}
