import { NextResponse } from 'next/server';
import { getHealth } from '@/intelligence/IntelligenceService';
import { getBusHealth } from '@/intelligence/bus/IntelligenceBus';
import { getHealth as getSapeleeHealth } from '@/intelligence/provider/sapelee/SapeleeClient';

async function getFlagStates(): Promise<Record<string, boolean>> {
  const KEYS = ['intelligence_foundation', 'intelligence_bus', 'recommendation_engine', 'command_center', 'daily_summary', 'morning_briefing', 'daily_recommendations'];
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const { data } = await db.from('feature_flags').select('flag_key,enabled').in('flag_key', KEYS);
    const map: Record<string, boolean> = {};
    for (const k of KEYS) map[k] = false;
    for (const row of (data ?? []) as Array<{ flag_key: string; enabled: boolean }>) {
      map[row.flag_key] = row.enabled;
    }
    return map;
  } catch {
    return Object.fromEntries(KEYS.map(k => [k, false]));
  }
}

async function getTableReachable(table: string): Promise<boolean> {
  try {
    const { getAdminDb } = await import('@/lib/supabaseServer');
    const db = getAdminDb();
    const { error } = await db.from(table).select('id', { count: 'exact', head: true }).limit(1);
    return !error;
  } catch { return false; }
}

export async function GET() {
  try {
    const [providerHealth, busHealth, eventsReachable, recsReachable, flags, sapeleeHealth] = await Promise.all([
      getHealth(),
      getBusHealth('').catch(() => ({ reachable: false, pendingEvents: 0, processedToday: 0, failedEvents: 0, lastEventAt: null })),
      getTableReachable('intelligence_events'),
      getTableReachable('recommendations'),
      getFlagStates(),
      getSapeleeHealth().catch(() => ({ status: 'offline' as const, configured: false, checkedAt: new Date().toISOString() })),
    ]);

    // Open recommendations count
    let openRecommendations = 0;
    try {
      const { getAdminDb } = await import('@/lib/supabaseServer');
      const db = getAdminDb();
      const { count } = await db.from('recommendations').select('id', { count: 'exact', head: true }).eq('status', 'open');
      openRecommendations = count ?? 0;
    } catch { /* ignore */ }

    const status = {
      provider:             providerHealth,
      bus: {
        reachable:          busHealth.reachable,
        pendingEvents:      busHealth.pendingEvents,
        processedToday:     busHealth.processedToday,
        failedEvents:       busHealth.failedEvents,
        lastEventAt:        busHealth.lastEventAt,
      },
      tables: {
        intelligence_events: eventsReachable,
        recommendations:     recsReachable,
      },
      openRecommendations,
      featureFlags:         flags,
      sapelee: {
        configured:  sapeleeHealth.configured,
        status:      sapeleeHealth.status,
        checkedAt:   sapeleeHealth.checkedAt,
      },
      checkedAt:            new Date().toISOString(),
    };

    const httpStatus = !providerHealth || busHealth.reachable === false ? 503 : 200;
    return NextResponse.json(status, { status: httpStatus });
  } catch {
    return NextResponse.json({
      provider:    { status: 'offline' },
      bus:         { reachable: false },
      tables:      { intelligence_events: false, recommendations: false },
      openRecommendations: 0,
      featureFlags: {},
      sapelee: { configured: false, status: 'offline', checkedAt: new Date().toISOString() },
      checkedAt:   new Date().toISOString(),
    }, { status: 503 });
  }
}
