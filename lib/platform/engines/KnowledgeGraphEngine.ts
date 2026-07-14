/**
 * lib/platform/engines/KnowledgeGraphEngine.ts
 *
 * Manages the Automotive Knowledge Graph — the shared intelligence layer
 * that all other engines read from. Every completed repair strengthens
 * relationships between vehicle, DTC, symptom, component, repair, technician,
 * and outcome nodes.
 *
 * This is the core of the platform's network effect:
 * More verified repairs → stronger graph → better AI reasoning → higher first-time fix rates.
 *
 * Builds on the existing lib/knowledge-graph/types.ts and normalize.ts.
 * Extends node/edge types with new diagnostic orchestrator relationships.
 */

import type {
  IntelligenceEngine,
  IntelligenceEngineConfig,
  IntelligencePlatformEvent,
  IntelligenceInsight,
} from '../IntelligenceEngine';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface KnowledgeGraphQueryResult {
  dtcCode: string;
  relatedComponents: string[];
  confirmedRootCauses: Array<{ description: string; evidenceCount: number; successRate: number }>;
  relatedDtcCodes: string[];
  commonSymptoms: string[];
  suggestedTests: Array<{ test: string; discriminatingPower: number }>;
  historicalFixes: Array<{ fix: string; successRate: number; evidenceCount: number }>;
  relatedLessons: Array<{ title: string; checkFirst: string }>;
  totalCasesInGraph: number;
  graphConfidence: number;         // 0–100, grows with evidence count
}

export interface GraphStrengtheningEvent {
  repairCaseId: string;
  shopId: string;
  make?: string;
  model?: string;
  year?: number;
  engineCode?: string;
  dtcCodes: string[];
  symptoms: string[];
  testsPerformed: string[];
  rootCause: string;
  partsReplaced: string[];
  technicianId?: string;
  outcome: 'resolved' | 'partial' | 'comeback';
  laborMinutes: number;
  isAnonymizedForGlobal: boolean;
}

const ENGINE_CONFIG: IntelligenceEngineConfig = {
  engineId: 'knowledge_graph',
  displayName: 'Knowledge Graph Engine',
  category: 'knowledge_graph',
  featureFlag: 'knowledge_graph_engine_enabled',
  version: '1.0',
  subscribedEvents: [
    'repair.verified',
    'repair.completed',
    'diagnosis.session.completed',
    'dtc.scanned',
  ],
};

export class KnowledgeGraphEngine implements IntelligenceEngine {
  readonly config = ENGINE_CONFIG;
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async process(event: IntelligencePlatformEvent, shopId: string): Promise<IntelligenceInsight[]> {
    if (event.eventType === 'repair.verified') {
      await this.strengthenGraph(event, shopId);
    } else if (event.eventType === 'dtc.scanned') {
      // Enrich graph with scan data even before repair is verified
      await this.recordScanObservation(event, shopId);
    }
    return [];  // Graph engine generates no insights directly — it feeds other engines
  }

  private async strengthenGraph(event: IntelligencePlatformEvent, shopId: string): Promise<void> {
    const payload = event.payload as Partial<GraphStrengtheningEvent>;
    if (!payload.dtcCodes?.length || !payload.rootCause) return;

    const { createNormalizedKey } = await import('../../knowledge-graph/normalize');

    // Upsert vehicle node
    if (payload.make && payload.model) {
      const makeKey = createNormalizedKey('manufacturer', [payload.make]);
      const modelKey = createNormalizedKey('model', [payload.make, payload.model]);

      await this.upsertNode(shopId, 'manufacturer', payload.make, makeKey, true);
      const modelNodeId = await this.upsertNode(shopId, 'model', `${payload.make} ${payload.model}`, modelKey, true);

      // Upsert DTC nodes and link to model
      for (const dtc of payload.dtcCodes) {
        const dtcNodeId = await this.upsertNode(shopId, 'dtc', dtc, createNormalizedKey('dtc', [dtc]), true);
        await this.upsertEdge(shopId, modelNodeId, dtcNodeId, 'HAS_DTC');
      }

      // Upsert root cause as repair_procedure node
      const rootCauseKey = createNormalizedKey('repair_procedure', [payload.rootCause]);
      const rcNodeId = await this.upsertNode(shopId, 'repair_procedure', payload.rootCause, rootCauseKey, payload.isAnonymizedForGlobal ?? false);

      // Link DTCs → root cause
      for (const dtc of payload.dtcCodes) {
        const dtcKey = createNormalizedKey('dtc', [dtc]);
        const { data: dtcNode } = await this.supabase
          .from('automotive_graph_nodes')
          .select('id')
          .eq('normalized_key', dtcKey)
          .limit(1)
          .maybeSingle();
        if (dtcNode) {
          await this.upsertEdge(shopId, dtcNode.id, rcNodeId, 'FIXED_BY');
        }
      }

      // Link parts to root cause
      for (const part of payload.partsReplaced ?? []) {
        const partKey = createNormalizedKey('part', [part]);
        const partNodeId = await this.upsertNode(shopId, 'part', part, partKey, false);
        await this.upsertEdge(shopId, rcNodeId, partNodeId, 'USES_PART');
      }

      // Record repair outcome
      const outcomeKey = createNormalizedKey('outcome', [payload.outcome, rootCauseKey]);
      await this.upsertNode(shopId, 'outcome', payload.outcome ?? 'unknown', outcomeKey, false);
    }

    // Record graph observation — permanent audit record
    await this.supabase.from('automotive_graph_observations').insert({
      shop_id: shopId,
      repair_case_id: payload.repairCaseId ?? null,
      vehicle_id: event.vehicleId ?? null,
      observation_type: 'repair_procedure_applied',
      observation_value: payload.rootCause,
      confidence_score: payload.outcome === 'resolved' ? 0.9 : 0.5,
      technician_id: payload.technicianId ?? null,
    });
  }

  private async recordScanObservation(event: IntelligencePlatformEvent, shopId: string): Promise<void> {
    const payload = event.payload as { dtcCodes?: string[] };
    for (const dtc of payload.dtcCodes ?? []) {
      const { createNormalizedKey } = await import('../../knowledge-graph/normalize');
      await this.upsertNode(shopId, 'dtc', dtc, createNormalizedKey('dtc', [dtc]), true);
    }
  }

  private async upsertNode(
    shopId: string,
    nodeType: string,
    canonicalName: string,
    normalizedKey: string,
    isGlobal: boolean,
  ): Promise<string> {
    const { data } = await this.supabase
      .from('automotive_graph_nodes')
      .upsert({
        shop_id: isGlobal ? null : shopId,
        node_type: nodeType,
        canonical_name: canonicalName,
        display_name: canonicalName,
        normalized_key: normalizedKey,
        is_global: isGlobal,
        is_anonymized: isGlobal,
        confidence_score: 0.5,
      }, { onConflict: 'normalized_key', ignoreDuplicates: false })
      .select('id')
      .single();
    return data?.id ?? '';
  }

  private async upsertEdge(
    shopId: string,
    fromNodeId: string,
    toNodeId: string,
    edgeType: string,
  ): Promise<void> {
    if (!fromNodeId || !toNodeId) return;
    const { data: existing } = await this.supabase
      .from('automotive_graph_edges')
      .select('id, evidence_count, weight')
      .eq('from_node_id', fromNodeId)
      .eq('to_node_id', toNodeId)
      .eq('edge_type', edgeType)
      .maybeSingle();

    if (existing) {
      await this.supabase
        .from('automotive_graph_edges')
        .update({ evidence_count: existing.evidence_count + 1, weight: Math.min(1, existing.weight + 0.05) })
        .eq('id', existing.id);
    } else {
      await this.supabase.from('automotive_graph_edges').insert({
        shop_id: shopId,
        from_node_id: fromNodeId,
        to_node_id: toNodeId,
        edge_type: edgeType,
        weight: 0.3,
        evidence_count: 1,
        is_global: false,
        is_anonymized: false,
      });
    }
  }

  /** Query graph for diagnostic evidence about specific DTC codes */
  async queryForDiagnostic(dtcCodes: string[], shopId: string): Promise<KnowledgeGraphQueryResult[]> {
    const { createNormalizedKey } = await import('../../knowledge-graph/normalize');
    const results: KnowledgeGraphQueryResult[] = [];

    for (const dtc of dtcCodes) {
      const dtcKey = createNormalizedKey('dtc', [dtc]);
      const { data: dtcNode } = await this.supabase
        .from('automotive_graph_nodes')
        .select('id')
        .eq('normalized_key', dtcKey)
        .maybeSingle();

      if (!dtcNode) {
        results.push({ dtcCode: dtc, relatedComponents: [], confirmedRootCauses: [], relatedDtcCodes: [], commonSymptoms: [], suggestedTests: [], historicalFixes: [], relatedLessons: [], totalCasesInGraph: 0, graphConfidence: 0 });
        continue;
      }

      // Load outbound FIXED_BY edges
      const { data: fixEdges } = await this.supabase
        .from('automotive_graph_edges')
        .select('to_node_id, weight, evidence_count, automotive_graph_nodes!to_node_id(canonical_name)')
        .eq('from_node_id', dtcNode.id)
        .eq('edge_type', 'FIXED_BY')
        .order('evidence_count', { ascending: false })
        .limit(5);

      const fixes = (fixEdges ?? []).map((e) => ({
        fix: (e.automotive_graph_nodes as { canonical_name?: string } | null)?.canonical_name ?? '',
        successRate: e.weight as number,
        evidenceCount: e.evidence_count as number,
      })).filter((f) => f.fix);

      const totalCases = fixes.reduce((s, f) => s + f.evidenceCount, 0);
      const graphConfidence = Math.min(100, 20 + totalCases * 5);

      results.push({ dtcCode: dtc, relatedComponents: [], confirmedRootCauses: fixes.map((f) => ({ description: f.fix, evidenceCount: f.evidenceCount, successRate: f.successRate })), relatedDtcCodes: [], commonSymptoms: [], suggestedTests: [], historicalFixes: fixes, relatedLessons: [], totalCasesInGraph: totalCases, graphConfidence });
    }

    return results;
  }

  async isHealthy(): Promise<boolean> { return true; }
}
