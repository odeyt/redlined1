// SI-10: Vehicle Intelligence Observability
// Logs build outcomes to vehicle_intelligence_events for monitoring.
// Fire-and-forget. Never throws.

import type { VehicleIntelligenceBuildResult } from './types';

export async function logBuildTelemetry(
  shopId: string,
  vehicleId: string,
  result: VehicleIntelligenceBuildResult,
): Promise<void> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    await db.from('vehicle_intelligence_events').insert({
      shop_id:     shopId,
      vehicle_id:  vehicleId,
      event_type:  'intelligence_build',
      source_type: null,
      source_id:   null,
      event_date:  new Date().toISOString(),
      summary:     `Build ${result.isNew ? 'created' : 'updated'}: score=${result.profile.healthScore ?? 'n/a'}, status=${result.profile.intelligenceStatus}, ${result.signals.length} signals, ${result.durationMs}ms`,
      metadata: {
        health_score:          result.profile.healthScore,
        intelligence_status:   result.profile.intelligenceStatus,
        signal_count:          result.signals.length,
        warning_count:         result.warnings.length,
        duration_ms:           result.durationMs,
        is_new:                result.isNew,
      },
    });
  } catch { /* never propagate */ }
}
