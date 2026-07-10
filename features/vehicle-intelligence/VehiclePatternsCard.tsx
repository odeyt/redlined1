'use client';
import type { VehicleIntelligenceProfile } from '@/intelligence/vehicle/types';

interface Props { profile: VehicleIntelligenceProfile }

export function VehiclePatternsCard({ profile }: Props) {
  const hasConcerns = profile.commonConcerns.length > 0;
  const hasDtcs     = profile.commonDtcs.length > 0;
  const hasParts    = profile.commonParts.length > 0;

  if (!hasConcerns && !hasDtcs && !hasParts) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Patterns</h4>

      {hasConcerns && (
        <div>
          <div className="text-xs font-medium text-gray-600 mb-1">Concerns</div>
          <div className="flex flex-wrap gap-1.5">
            {profile.commonConcerns.slice(0, 5).map(c => (
              <span key={c.category} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5 text-xs">
                {c.category}
                {c.count > 1 && <span className="font-semibold">×{c.count}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasDtcs && (
        <div>
          <div className="text-xs font-medium text-gray-600 mb-1">DTCs</div>
          <div className="flex flex-wrap gap-1.5">
            {profile.commonDtcs.slice(0, 6).map(d => (
              <span key={d.code} className={`rounded px-2 py-0.5 text-xs font-mono ${d.resolved ? 'bg-gray-100 text-gray-500 line-through' : 'bg-red-50 text-red-700'}`}>
                {d.code}{d.count > 1 && ` ×${d.count}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasParts && (
        <div>
          <div className="text-xs font-medium text-gray-600 mb-1">Repeated Parts</div>
          <div className="flex flex-wrap gap-1.5">
            {profile.commonParts.filter(p => p.count >= 2).slice(0, 5).map(p => (
              <span key={p.partName} className="rounded bg-amber-50 text-amber-700 px-2 py-0.5 text-xs">
                {p.partName} ×{p.count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
