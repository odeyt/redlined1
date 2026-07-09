// SI-7: Morning Brief Engine
// Generates the daily executive briefing. Deterministic. No AI. No external calls.
// Never crashes Command Center. All failures return null or empty brief.

import type {
  MorningBrief,
  MorningBriefGenerationResult,
  MorningBriefPriority,
  MorningBriefStatus,
} from './types';
import { buildMorningBrief } from './BriefContentBuilder';

async function getDb() {
  const { getAdminDb } = await import('@/lib/supabaseServer');
  return getAdminDb();
}

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

// ── DB row → MorningBrief ─────────────────────────────────────
function mapRow(r: Record<string, unknown>): MorningBrief {
  return {
    id:                   r.id as string,
    shopId:               r.shop_id as string,
    briefDate:            r.brief_date as string,
    status:               r.status as MorningBriefStatus,
    shopHealthScore:      Number(r.shop_health_score ?? 100),
    executiveScore:       Number(r.executive_score   ?? 100),
    title:                (r.title as string)          ?? '',
    summary:              (r.summary as string)        ?? '',
    yesterdaySummary:     (r.yesterday_summary as MorningBrief['yesterdaySummary'])  ?? emptySummary(),
    todayPriorities:      (r.today_priorities  as MorningBrief['todayPriorities'])   ?? [],
    revenueOpportunities: (r.revenue_opportunities as MorningBrief['revenueOpportunities']) ?? [],
    cashCollection:       (r.cash_collection as MorningBrief['cashCollection'])      ?? emptyCash(),
    operationalRisks:     (r.operational_risks as MorningBrief['operationalRisks'])  ?? [],
    technicianSummary:    (r.technician_summary as MorningBrief['technicianSummary']) ?? emptyTech(),
    inventorySummary:     (r.inventory_summary as MorningBrief['inventorySummary'])  ?? emptyInventory(),
    recommendedFocus:     (r.recommended_focus as string) ?? '',
    metadata:             (r.metadata as Record<string, unknown>) ?? {},
    generatedAt:          (r.generated_at as string) ?? new Date().toISOString(),
    createdAt:            (r.created_at as string)  ?? new Date().toISOString(),
    updatedAt:            (r.updated_at as string)  ?? new Date().toISOString(),
  };
}

function emptySummary(): MorningBrief['yesterdaySummary'] {
  return { revenueYesterday: 0, paymentsYesterday: 0, jobsCompleted: 0, repairCasesCreated: 0, invoicesCreated: 0 };
}
function emptyCash(): MorningBrief['cashCollection'] {
  return { unpaidCount: 0, unpaidTotal: 0, overdueCount: 0, overdueTotal: 0, collectionUrgency: 'low' };
}
function emptyTech(): MorningBrief['technicianSummary'] {
  return { activeCount: 0, idleCount: 0, totalAssigned: 0, bottlenecks: [] };
}
function emptyInventory(): MorningBrief['inventorySummary'] {
  return { lowCount: 0, criticalParts: [], reorderUrgency: 'low' };
}

// ── Core: Generate ────────────────────────────────────────────

/**
 * Generate a morning brief for a shop on a given date.
 * Uses SI-4 metrics and SI-6 decision rankings as inputs.
 * Upserts to DB (one row per shop per date).
 */
export async function generateMorningBrief(
  shopId: string,
  date?: string,
): Promise<MorningBriefGenerationResult> {
  const start = Date.now();
  const briefDate = date ?? todayString();
  const warnings: string[] = [];

  try {
    const db = await getDb();

    // Load latest metrics
    const { data: metricsRow } = await db
      .from('shop_intelligence_metrics')
      .select('*')
      .eq('shop_id', shopId)
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    let signals: Record<string, number | null> = {};
    let shopHealthScore = 100;
    let executiveScore  = 100;

    if (metricsRow) {
      const { mapMetricsRow }           = await import('@/intelligence/metrics/MetricsBuilder');
      const { extractSignalsFromMetrics } = await import('@/intelligence/signals/SignalExtractor');
      const metrics = mapMetricsRow(metricsRow as Record<string, unknown>);
      const raw     = extractSignalsFromMetrics(metrics);
      // coerce to number|null (SignalMap allows string values)
      signals         = Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [k, v === null ? null : Number(v)]),
      );
      shopHealthScore = metrics.shopHealthScore;
    } else {
      warnings.push('No metrics available — brief generated with limited data');
    }

    // Load today's exec score from decision rankings if available
    try {
      const { data: ranking } = await db
        .from('decision_rankings')
        .select('executive_score')
        .eq('shop_id', shopId)
        .eq('ranking_date', briefDate)
        .maybeSingle();
      if (ranking) executiveScore = Number((ranking as Record<string, unknown>).executive_score ?? 100);
    } catch { /* non-fatal */ }

    // Load top 5 ranked actions from SI-6 (today's queue)
    let rankedActions: MorningBriefPriority[] = [];
    try {
      const { data: rankingRow } = await db
        .from('decision_rankings')
        .select('ranked_actions')
        .eq('shop_id', shopId)
        .eq('ranking_date', briefDate)
        .maybeSingle();

      if (rankingRow) {
        const raw = (rankingRow as Record<string, unknown>).ranked_actions as Array<Record<string, unknown>> | null;
        if (raw && Array.isArray(raw)) {
          rankedActions = raw.slice(0, 5).map((a, i) => {
            const rec   = (a.recommendation ?? {}) as Record<string, unknown>;
            const score = (a.score ?? {}) as Record<string, unknown>;
            const qa    = (a.quickActions ?? []) as Array<{ module?: string }>;
            const navMod = qa.find(q => q.module)?.module ?? null;
            return {
              rank:                  Number(a.rank ?? i + 1),
              title:                 String(rec.title ?? ''),
              category:              String(rec.category ?? ''),
              recommendationKey:     String(rec.recommendationKey ?? ''),
              recommendationId:      String(rec.id ?? ''),
              decisionScore:         Number(score.decisionScore ?? 0),
              estimatedRevenue:      rec.estimatedRevenue != null ? Number(rec.estimatedRevenue) : null,
              estimatedTimeMinutes:  Number(score.estimatedTimeMinutes ?? 5),
              whyItMatters:          String(a.whyItMatters ?? ''),
              module:                navMod,
            } satisfies MorningBriefPriority;
          });
        }
      }
    } catch { warnings.push('Decision rankings unavailable — priorities sourced from signals only'); }

    // Build brief content
    const content = buildMorningBrief(
      shopId, briefDate, signals, rankedActions, shopHealthScore, executiveScore,
    );

    // Upsert to DB (unique on shop_id + brief_date)
    const { data: existing } = await db
      .from('morning_briefs')
      .select('id, created_at')
      .eq('shop_id', shopId)
      .eq('brief_date', briefDate)
      .maybeSingle();

    const isNew = !existing;

    const upsertData = {
      shop_id:               shopId,
      brief_date:            briefDate,
      status:                'generated',
      shop_health_score:     content.shopHealthScore,
      executive_score:       content.executiveScore,
      title:                 content.title,
      summary:               content.summary,
      yesterday_summary:     content.yesterdaySummary,
      today_priorities:      content.todayPriorities,
      revenue_opportunities: content.revenueOpportunities,
      cash_collection:       content.cashCollection,
      operational_risks:     content.operationalRisks,
      technician_summary:    content.technicianSummary,
      inventory_summary:     content.inventorySummary,
      recommended_focus:     content.recommendedFocus,
      metadata:              content.metadata,
      generated_at:          content.generatedAt,
      updated_at:            new Date().toISOString(),
    };

    let savedId: string;
    if (isNew) {
      const { data: inserted } = await db
        .from('morning_briefs')
        .insert(upsertData)
        .select('id, created_at, updated_at')
        .maybeSingle();
      savedId = (inserted as Record<string, string> | null)?.id ?? 'unsaved';
      const brief = buildBriefObject(content, savedId, inserted as Record<string, string> | null);
      void trySapeleeEnhancement(savedId, brief);
      return { brief, isNew: true, durationMs: Date.now() - start, warnings };
    } else {
      await db
        .from('morning_briefs')
        .update(upsertData)
        .eq('id', (existing as Record<string, string>).id);
      savedId = (existing as Record<string, string>).id;
      const full = await getBriefById(savedId);
      if (!full) throw new Error('Brief save failed');
      void trySapeleeEnhancement(savedId, full);
      return { brief: full, isNew: false, durationMs: Date.now() - start, warnings };
    }
  } catch (e) {
    warnings.push(`Generation error: ${e instanceof Error ? e.message : 'unknown'}`);
    // Return a safe empty brief rather than throwing
    const safe = buildSafeFallbackBrief(shopId, briefDate);
    return { brief: safe, isNew: false, durationMs: Date.now() - start, warnings };
  }
}

// ── SI-8: Sapelee Enhancement (fire-and-forget) ───────────────
/**
 * After saving the local brief, optionally enhance it with Sapelee.
 * Checks the sapelee_morning_brief_enhancement feature flag.
 * Stores the result in metadata.sapelee_enhancement — NEVER replaces the local brief.
 * Returns immediately if Sapelee is unavailable or the flag is OFF.
 */
async function trySapeleeEnhancement(briefId: string, brief: MorningBrief): Promise<void> {
  try {
    // Check feature flag
    const db = await getDb();
    const { data: flagRow } = await db
      .from('feature_flags')
      .select('enabled')
      .eq('flag_key', 'sapelee_morning_brief_enhancement')
      .maybeSingle();
    if (!(flagRow as Record<string, unknown> | null)?.enabled) return;

    // Build PII-safe payload
    const { buildMorningBriefPayload } = await import(
      '@/intelligence/provider/sapelee/SapeleePayloadBuilder'
    );
    const { enhanceMorningBriefWithSapelee } = await import(
      '@/intelligence/provider/sapelee/SapeleeIntelligenceProvider'
    );

    const payload = buildMorningBriefPayload(brief);
    const enhancement = await enhanceMorningBriefWithSapelee(payload);
    if (!enhancement) return; // Sapelee unavailable — keep local brief as-is

    // Merge into existing metadata, never replace other fields
    const { data: current } = await db
      .from('morning_briefs')
      .select('metadata')
      .eq('id', briefId)
      .maybeSingle();
    const existingMeta = ((current as Record<string, unknown> | null)?.metadata ?? {}) as Record<string, unknown>;

    await db
      .from('morning_briefs')
      .update({
        metadata:   { ...existingMeta, sapelee_enhancement: enhancement },
        updated_at: new Date().toISOString(),
      })
      .eq('id', briefId);
  } catch {
    // Never propagate — intelligence enhancement is non-critical
  }
}

function buildBriefObject(
  content: ReturnType<typeof buildMorningBrief>,
  id: string,
  row: Record<string, string> | null,
): MorningBrief {
  return {
    id,
    shopId:               content.shopId,
    briefDate:            content.briefDate,
    status:               content.status as MorningBrief['status'],
    shopHealthScore:      content.shopHealthScore,
    executiveScore:       content.executiveScore,
    title:                content.title,
    summary:              content.summary,
    yesterdaySummary:     content.yesterdaySummary,
    todayPriorities:      content.todayPriorities,
    revenueOpportunities: content.revenueOpportunities,
    cashCollection:       content.cashCollection,
    operationalRisks:     content.operationalRisks,
    technicianSummary:    content.technicianSummary,
    inventorySummary:     content.inventorySummary,
    recommendedFocus:     content.recommendedFocus,
    metadata:             content.metadata,
    generatedAt:          content.generatedAt,
    createdAt:            row?.created_at ?? content.generatedAt,
    updatedAt:            row?.updated_at ?? content.generatedAt,
  };
}

function buildSafeFallbackBrief(shopId: string, briefDate: string): MorningBrief {
  const now = new Date().toISOString();
  return {
    id: 'error',
    shopId, briefDate,
    status: 'draft',
    shopHealthScore: 0,
    executiveScore: 0,
    title: 'Good morning — brief data is temporarily unavailable.',
    summary: 'Unable to load shop data. Please refresh intelligence and try again.',
    yesterdaySummary: { revenueYesterday: 0, paymentsYesterday: 0, jobsCompleted: 0, repairCasesCreated: 0, invoicesCreated: 0 },
    todayPriorities: [],
    revenueOpportunities: [],
    cashCollection: { unpaidCount: 0, unpaidTotal: 0, overdueCount: 0, overdueTotal: 0, collectionUrgency: 'low' },
    operationalRisks: [],
    technicianSummary: { activeCount: 0, idleCount: 0, totalAssigned: 0, bottlenecks: [] },
    inventorySummary: { lowCount: 0, criticalParts: [], reorderUrgency: 'low' },
    recommendedFocus: 'Refresh Intelligence to generate today\'s brief.',
    metadata: {},
    generatedAt: now, createdAt: now, updatedAt: now,
  };
}

// ── Queries ───────────────────────────────────────────────────

export async function getTodayBrief(shopId: string): Promise<MorningBrief | null> {
  return getBriefByDate(shopId, todayString());
}

export async function getBriefByDate(shopId: string, date: string): Promise<MorningBrief | null> {
  try {
    const db = await getDb();
    const { data } = await db
      .from('morning_briefs')
      .select('*')
      .eq('shop_id', shopId)
      .eq('brief_date', date)
      .maybeSingle();
    if (!data) return null;
    return mapRow(data as Record<string, unknown>);
  } catch { return null; }
}

export async function getBriefById(id: string): Promise<MorningBrief | null> {
  try {
    const db = await getDb();
    const { data } = await db.from('morning_briefs').select('*').eq('id', id).maybeSingle();
    if (!data) return null;
    return mapRow(data as Record<string, unknown>);
  } catch { return null; }
}

export async function saveMorningBrief(brief: MorningBrief): Promise<void> {
  try {
    const db = await getDb();
    await db.from('morning_briefs').upsert({
      id:                    brief.id,
      shop_id:               brief.shopId,
      brief_date:            brief.briefDate,
      status:                brief.status,
      shop_health_score:     brief.shopHealthScore,
      executive_score:       brief.executiveScore,
      title:                 brief.title,
      summary:               brief.summary,
      yesterday_summary:     brief.yesterdaySummary,
      today_priorities:      brief.todayPriorities,
      revenue_opportunities: brief.revenueOpportunities,
      cash_collection:       brief.cashCollection,
      operational_risks:     brief.operationalRisks,
      technician_summary:    brief.technicianSummary,
      inventory_summary:     brief.inventorySummary,
      recommended_focus:     brief.recommendedFocus,
      metadata:              brief.metadata,
      generated_at:          brief.generatedAt,
      updated_at:            new Date().toISOString(),
    }, { onConflict: 'shop_id,brief_date' });
  } catch { /* fail silently */ }
}

export async function dismissBrief(briefId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.from('morning_briefs').update({
      status:     'dismissed',
      updated_at: new Date().toISOString(),
    }).eq('id', briefId);
  } catch { /* fail silently */ }
}

export async function markBriefDelivered(briefId: string, channel: string): Promise<void> {
  try {
    const db = await getDb();
    await db.from('morning_briefs').update({
      status:     'delivered',
      updated_at: new Date().toISOString(),
    }).eq('id', briefId);
    await db.from('brief_delivery_logs').insert({
      shop_id:          (await db.from('morning_briefs').select('shop_id').eq('id', briefId).maybeSingle())?.data?.shop_id,
      morning_brief_id: briefId,
      delivery_channel: channel,
      status:           'sent',
      sent_at:          new Date().toISOString(),
    });
  } catch { /* fail silently */ }
}

export async function archiveOldBriefs(shopId: string, keepDays = 7): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);
    const db = await getDb();
    await db.from('morning_briefs').update({
      status:     'archived',
      updated_at: new Date().toISOString(),
    })
      .eq('shop_id', shopId)
      .lt('brief_date', cutoff.toISOString().split('T')[0])
      .in('status', ['generated', 'delivered', 'dismissed']);
  } catch { /* fail silently */ }
}
