'use client';

import type { CustomerRelationshipScore } from '@/intelligence/customer/types';

interface Props {
  score: CustomerRelationshipScore;
}

const STATUS_LABELS: Record<string, string> = {
  excellent: 'Excellent',
  strong: 'Strong',
  stable: 'Stable',
  weak: 'Weak',
  at_risk: 'At Risk',
  unknown: 'Unknown',
};

const STATUS_COLORS: Record<string, string> = {
  excellent: 'text-green-600',
  strong: 'text-emerald-600',
  stable: 'text-blue-600',
  weak: 'text-yellow-600',
  at_risk: 'text-orange-600',
  unknown: 'text-muted-foreground',
};

export function CustomerRelationshipCard({ score }: Props) {
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Relationship</span>
        <span className={`text-sm font-semibold ${STATUS_COLORS[score.status] ?? 'text-muted-foreground'}`}>
          {STATUS_LABELS[score.status] ?? score.status} ({score.score}/100)
        </span>
      </div>
      {score.positiveFactors.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-0.5">
          {score.positiveFactors.map(f => (
            <li key={f.key} className="flex gap-1">
              <span className="text-green-500">+</span>
              {f.label}
            </li>
          ))}
        </ul>
      )}
      {score.negativeFactors.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-0.5">
          {score.negativeFactors.map(f => (
            <li key={f.key} className="flex gap-1">
              <span className="text-red-400">−</span>
              {f.label}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground italic">
        Data quality: {score.dataQuality}
      </p>
    </div>
  );
}
