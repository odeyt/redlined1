'use client';
import type { VehicleRecommendedCheck } from '@/intelligence/vehicle/types';

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'border-red-400 bg-red-50',
  high:     'border-orange-400 bg-orange-50',
  medium:   'border-yellow-400 bg-yellow-50',
  low:      'border-gray-300 bg-gray-50',
};

interface Props { checks: VehicleRecommendedCheck[] }

export function VehicleRecommendedChecks({ checks }: Props) {
  if (checks.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recommended Checks</h4>
      {checks.map(c => (
        <div key={c.key} className={`rounded border-l-4 px-3 py-2 text-sm ${PRIORITY_COLOR[c.priority] ?? PRIORITY_COLOR.low}`}>
          <div className="font-medium text-gray-800">{c.title}</div>
          <div className="mt-0.5 text-xs text-gray-600">{c.rationale}</div>
          <div className="mt-0.5 text-xs text-gray-400">Based on: {c.basedOn}</div>
        </div>
      ))}
    </div>
  );
}
