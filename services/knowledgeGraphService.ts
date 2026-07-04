// ============================================================
// RedlineD1 — Automotive Knowledge Graph
// Service Layer
// Sprint 4 — Foundation Layer
// ============================================================
// Current implementation: SQL-based similarity only.
// No AI, no embeddings, no vector search.
//
// TODO (Sprint 5+): Replace findSimilarRepairCases() with
//   vector similarity once nodes are embedded.
// TODO (Sprint 6+): Feed getGraphContextForSecondOpinion()
//   into a Claude prompt with structured graph context.
// ============================================================

import { supabase } from '@/lib/supabase';
import type {
  AutomotiveGraphNode,
  AutomotiveGraphEdge,
  AutomotiveGraphLesson,
  AutomotiveGraphObservation,
  AutomotiveGraphMetric,
  GraphNodeType,
  GraphEdgeType,
  GraphStatus,
  RepairCaseToGraphInput,
  SimilarRepairMatch,
  SimilarityMatchReason,
  SecondOpinionGraphContext,
  TechnicianLearningSignal,
  UpsertGraphNodeInput,
  CreateGraphEdgeInput,
  RecordObservationInput,
  CreateLessonInput,
} from '@/lib/knowledge-graph/types';
import {
  normalizeMake,
  normalizeModel,
  normalizeEngine,
  normalizeDtcCode,
  normalizeSymptom,
  normalizeTestName,
  normalizePartNumber,
  createNormalizedKey,
} from '@/lib/knowledge-graph/normalize';

// ── Row mappers ───────────────────────────────────────────────

function mapNode(row: Record<string, unknown>): AutomotiveGraphNode {
  return {
    id: row.id as string,
    shopId: (row.shop_id as string) ?? null,
    nodeType: row.node_type as GraphNodeType,
    canonicalName: row.canonical_name as string,
    displayName: row.display_name as string,
    normalizedKey: row.normalized_key as string,
    sourceType: (row.source_type as string) ?? null,
    sourceId: (row.source_id as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    confidenceScore: Number(row.confidence_score ?? 1),
    isGlobal: Boolean(row.is_global),
    isAnonymized: Boolean(row.is_anonymized),
    createdBy: (row.created_by as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapEdge(row: Record<string, unknown>): AutomotiveGraphEdge {
  return {
    id: row.id as string,
    shopId: (row.shop_id as string) ?? null,
    fromNodeId: row.from_node_id as string,
    toNodeId: row.to_node_id as string,
    edgeType: row.edge_type as GraphEdgeType,
    weight: Number(row.weight ?? 1),
    evidenceCount: Number(row.evidence_count ?? 1),
    sourceType: (row.source_type as string) ?? null,
    sourceId: (row.source_id as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    isGlobal: Boolean(row.is_global),
    isAnonymized: Boolean(row.is_anonymized),
    createdBy: (row.created_by as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapLesson(row: Record<string, unknown>): AutomotiveGraphLesson {
  return {
    id: row.id as string,
    shopId: row.shop_id as string,
    repairCaseId: (row.repair_case_id as string) ?? null,
    title: row.title as string,
    problem: (row.problem as string) ?? null,
    whatWasWrong: (row.what_was_wrong as string) ?? null,
    whatFooledUs: (row.what_fooled_us as string) ?? null,
    finalFix: (row.final_fix as string) ?? null,
    checkFirstNextTime: (row.check_first_next_time as string) ?? null,
    commonMistake: (row.common_mistake as string) ?? null,
    recommendation: (row.recommendation as string) ?? null,
    tags: (row.tags as string[]) ?? [],
    confidenceScore: Number(row.confidence_score ?? 1),
    verifiedStatus: (row.verified_status as AutomotiveGraphLesson['verifiedStatus']) ?? 'pending',
    createdBy: (row.created_by as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ── 1. upsertGraphNode ────────────────────────────────────────

/**
 * Create a graph node or update it if the normalized_key already exists.
 * Uses normalized_key + shop_id (or null for global) as the upsert key.
 *
 * TODO: When graph has many nodes, consider batching upserts.
 */
export async function upsertGraphNode(
  input: UpsertGraphNodeInput
): Promise<AutomotiveGraphNode> {
  const payload = {
    shop_id: input.shopId ?? null,
    node_type: input.nodeType,
    canonical_name: input.canonicalName,
    display_name: input.displayName,
    normalized_key: input.normalizedKey,
    source_type: input.sourceType ?? null,
    source_id: input.sourceId ?? null,
    metadata: input.metadata ?? {},
    confidence_score: input.confidenceScore ?? 1.0,
    is_global: input.isGlobal ?? false,
    is_anonymized: input.isAnonymized ?? true,
  };

  const { data, error } = await supabase
    .from('automotive_graph_nodes')
    .upsert(payload, { onConflict: 'normalized_key,shop_id' })
    .select()
    .single();

  if (error) throw new Error(`upsertGraphNode failed: ${error.message}`);
  return mapNode(data as Record<string, unknown>);
}

// ── 2. createGraphEdge ────────────────────────────────────────

/**
 * Create an edge between two nodes, or increment evidence_count if it exists.
 * Also increments weight by a small amount to strengthen confirmed relationships.
 *
 * TODO: Implement sophisticated weight calculation based on outcome and comeback rate.
 */
export async function createGraphEdge(
  input: CreateGraphEdgeInput
): Promise<AutomotiveGraphEdge> {
  // Check if edge already exists
  const { data: existing } = await supabase
    .from('automotive_graph_edges')
    .select('id, evidence_count, weight')
    .eq('from_node_id', input.fromNodeId)
    .eq('to_node_id', input.toNodeId)
    .eq('edge_type', input.edgeType)
    .eq('shop_id', input.shopId ?? null)
    .maybeSingle();

  if (existing) {
    // Strengthen existing edge
    const newCount = (existing.evidence_count as number) + 1;
    const newWeight = Math.min(10, (existing.weight as number) + 0.1);
    const { data, error } = await supabase
      .from('automotive_graph_edges')
      .update({ evidence_count: newCount, weight: newWeight, updated_at: new Date().toISOString() })
      .eq('id', existing.id as string)
      .select()
      .single();
    if (error) throw new Error(`createGraphEdge (update) failed: ${error.message}`);
    return mapEdge(data as Record<string, unknown>);
  }

  // Create new edge
  const { data, error } = await supabase
    .from('automotive_graph_edges')
    .insert({
      shop_id: input.shopId ?? null,
      from_node_id: input.fromNodeId,
      to_node_id: input.toNodeId,
      edge_type: input.edgeType,
      weight: input.weight ?? 1.0,
      source_type: input.sourceType ?? null,
      source_id: input.sourceId ?? null,
      metadata: input.metadata ?? {},
      is_global: input.isGlobal ?? false,
      is_anonymized: input.isAnonymized ?? true,
    })
    .select()
    .single();

  if (error) throw new Error(`createGraphEdge (insert) failed: ${error.message}`);
  return mapEdge(data as Record<string, unknown>);
}

// ── 3. recordObservation ─────────────────────────────────────

/**
 * Record a raw observation from a repair case.
 * Observations are the evidence base for graph edges.
 */
export async function recordObservation(
  input: RecordObservationInput
): Promise<AutomotiveGraphObservation> {
  const { data, error } = await supabase
    .from('automotive_graph_observations')
    .insert({
      shop_id: input.shopId,
      repair_case_id: input.repairCaseId ?? null,
      repair_order_id: input.repairOrderId ?? null,
      vehicle_id: input.vehicleId ?? null,
      observation_type: input.observationType,
      observation_value: input.observationValue,
      normalized_value: input.normalizedValue ?? null,
      measurement_unit: input.measurementUnit ?? null,
      measurement_numeric: input.measurementNumeric ?? null,
      confidence_score: input.confidenceScore ?? 1.0,
      technician_id: input.technicianId ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`recordObservation failed: ${error.message}`);
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    shopId: row.shop_id as string,
    repairCaseId: (row.repair_case_id as string) ?? null,
    repairOrderId: (row.repair_order_id as string) ?? null,
    vehicleId: (row.vehicle_id as string) ?? null,
    observationType: row.observation_type as AutomotiveGraphObservation['observationType'],
    observationValue: row.observation_value as string,
    normalizedValue: (row.normalized_value as string) ?? null,
    measurementUnit: (row.measurement_unit as string) ?? null,
    measurementNumeric: row.measurement_numeric != null ? Number(row.measurement_numeric) : null,
    confidenceScore: Number(row.confidence_score ?? 1),
    technicianId: (row.technician_id as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    createdAt: row.created_at as string,
  };
}

// ── 4. createStructuredLesson ─────────────────────────────────

/**
 * Store a structured lesson learned from a repair case.
 */
export async function createStructuredLesson(
  input: CreateLessonInput
): Promise<AutomotiveGraphLesson> {
  const { data, error } = await supabase
    .from('automotive_graph_lessons')
    .insert({
      shop_id: input.shopId,
      repair_case_id: input.repairCaseId ?? null,
      title: input.title,
      problem: input.problem ?? null,
      what_was_wrong: input.whatWasWrong ?? null,
      what_fooled_us: input.whatFooledUs ?? null,
      final_fix: input.finalFix ?? null,
      check_first_next_time: input.checkFirstNextTime ?? null,
      common_mistake: input.commonMistake ?? null,
      recommendation: input.recommendation ?? null,
      tags: input.tags ?? [],
    })
    .select()
    .single();

  if (error) throw new Error(`createStructuredLesson failed: ${error.message}`);
  return mapLesson(data as Record<string, unknown>);
}

// ── 5. mapRepairCaseToGraph ───────────────────────────────────

/**
 * Extract structured graph data from a repair case and populate nodes + edges.
 *
 * Call this after a repair case is created or verified.
 * It is safe to call multiple times — upsertGraphNode is idempotent.
 *
 * Mapping:
 *   make       → manufacturer node
 *   model      → model node          + manufacturer HAS_MODEL model
 *   engine     → engine node         + model HAS_ENGINE engine
 *   DTC codes  → dtc nodes           + engine HAS_DTC dtc
 *   symptoms   → symptom nodes       + dtc HAS_SYMPTOM symptom
 *   tests      → test nodes          + symptom REQUIRES_TEST test
 *   parts      → part nodes          + repair_procedure USES_PART part
 *   final fix  → repair_procedure    + test TEST_CONFIRMS repair_procedure
 *   technician → technician node     + technician PERFORMED_BY repair_procedure
 *   outcome    → outcome node        + repair_procedure HAS_OUTCOME outcome
 *   lesson     → lesson node         + lesson LEARNED_FROM repair_case
 *
 * TODO (Sprint 5): Add comeback detection — if outcome = 'comeback',
 *   add HAS_COMEBACK edge and reduce edge weight on the original procedure.
 */
export async function mapRepairCaseToGraph(
  input: RepairCaseToGraphInput
): Promise<{ nodeCount: number; edgeCount: number; observationCount: number }> {
  let nodeCount = 0;
  let edgeCount = 0;
  let observationCount = 0;

  const { shopId, repairCaseId } = input;
  const sourceRef = { sourceType: 'repair_case', sourceId: repairCaseId };

  // ── Normalize inputs ─────────────────────────────────────

  const normMake = normalizeMake(input.make);
  const normModel = normalizeModel(input.model);
  const normEngine = normalizeEngine(input.engine);
  const dtcCodes = input.dtcCodes.map(d => normalizeDtcCode(d)).filter((d): d is string => d !== null);
  const symptoms = input.symptoms.map(s => normalizeSymptom(s)).filter((s): s is string => s !== null);
  const tests = input.testsPerformed.map(t => normalizeTestName(t)).filter((t): t is string => t !== null);
  const parts = input.partsReplaced.map(p => normalizePartNumber(p)).filter((p): p is string => p !== null);
  const normFinalFix = input.finalFix?.trim() ?? null;

  // ── Manufacturer node ─────────────────────────────────────

  let manufacturerNode: AutomotiveGraphNode | null = null;
  if (normMake) {
    manufacturerNode = await upsertGraphNode({
      shopId,
      nodeType: 'manufacturer',
      canonicalName: normMake,
      displayName: normMake,
      normalizedKey: createNormalizedKey('manufacturer', [normMake]),
      ...sourceRef,
    });
    nodeCount++;
  }

  // ── Model node + HAS_MODEL edge ───────────────────────────

  let modelNode: AutomotiveGraphNode | null = null;
  if (normModel) {
    modelNode = await upsertGraphNode({
      shopId,
      nodeType: 'model',
      canonicalName: normModel,
      displayName: normModel,
      normalizedKey: createNormalizedKey('model', [normMake, normModel]),
      metadata: { make: normMake },
      ...sourceRef,
    });
    nodeCount++;

    if (manufacturerNode) {
      await createGraphEdge({ shopId, fromNodeId: manufacturerNode.id, toNodeId: modelNode.id, edgeType: 'HAS_MODEL', ...sourceRef });
      edgeCount++;
    }
  }

  // ── Engine node + HAS_ENGINE edge ─────────────────────────

  let engineNode: AutomotiveGraphNode | null = null;
  if (normEngine) {
    engineNode = await upsertGraphNode({
      shopId,
      nodeType: 'engine',
      canonicalName: normEngine,
      displayName: normEngine,
      normalizedKey: createNormalizedKey('engine', [normMake, normModel, normEngine]),
      metadata: { make: normMake, model: normModel },
      ...sourceRef,
    });
    nodeCount++;

    if (modelNode) {
      await createGraphEdge({ shopId, fromNodeId: modelNode.id, toNodeId: engineNode.id, edgeType: 'HAS_ENGINE', ...sourceRef });
      edgeCount++;
    }
  }

  // ── DTC nodes + HAS_DTC edges ─────────────────────────────

  const dtcNodes: AutomotiveGraphNode[] = [];
  for (const dtc of dtcCodes) {
    const dtcNode = await upsertGraphNode({
      shopId,
      nodeType: 'dtc',
      canonicalName: dtc,
      displayName: dtc,
      normalizedKey: createNormalizedKey('dtc', [dtc]),
      ...sourceRef,
    });
    dtcNodes.push(dtcNode);
    nodeCount++;

    if (engineNode) {
      await createGraphEdge({ shopId, fromNodeId: engineNode.id, toNodeId: dtcNode.id, edgeType: 'HAS_DTC', ...sourceRef });
      edgeCount++;
    }

    await recordObservation({ shopId, repairCaseId, observationType: 'dtc_present', observationValue: dtc, normalizedValue: dtc });
    observationCount++;
  }

  // ── Symptom nodes + HAS_SYMPTOM edges ────────────────────

  const symptomNodes: AutomotiveGraphNode[] = [];
  for (const symptom of symptoms) {
    const symptomNode = await upsertGraphNode({
      shopId,
      nodeType: 'symptom',
      canonicalName: symptom,
      displayName: symptom,
      normalizedKey: createNormalizedKey('symptom', [symptom]),
      ...sourceRef,
    });
    symptomNodes.push(symptomNode);
    nodeCount++;

    for (const dtcNode of dtcNodes) {
      await createGraphEdge({ shopId, fromNodeId: dtcNode.id, toNodeId: symptomNode.id, edgeType: 'HAS_SYMPTOM', ...sourceRef });
      edgeCount++;
    }

    await recordObservation({ shopId, repairCaseId, observationType: 'symptom_observed', observationValue: symptom, normalizedValue: symptom });
    observationCount++;
  }

  // ── Test nodes + REQUIRES_TEST edges ─────────────────────

  const testNodes: AutomotiveGraphNode[] = [];
  for (const testName of tests) {
    const testNode = await upsertGraphNode({
      shopId,
      nodeType: 'test',
      canonicalName: testName,
      displayName: testName,
      normalizedKey: createNormalizedKey('test', [testName]),
      ...sourceRef,
    });
    testNodes.push(testNode);
    nodeCount++;

    for (const symptomNode of symptomNodes) {
      await createGraphEdge({ shopId, fromNodeId: symptomNode.id, toNodeId: testNode.id, edgeType: 'REQUIRES_TEST', ...sourceRef });
      edgeCount++;
    }

    await recordObservation({ shopId, repairCaseId, observationType: 'test_performed', observationValue: testName, normalizedValue: testName });
    observationCount++;
  }

  // ── Repair procedure node ─────────────────────────────────

  let procedureNode: AutomotiveGraphNode | null = null;
  if (normFinalFix) {
    procedureNode = await upsertGraphNode({
      shopId,
      nodeType: 'repair_procedure',
      canonicalName: normFinalFix,
      displayName: normFinalFix,
      normalizedKey: createNormalizedKey('repair_procedure', [normMake, normModel, normFinalFix]),
      metadata: { make: normMake, model: normModel, engine: normEngine },
      ...sourceRef,
    });
    nodeCount++;

    // Tests confirm procedure
    for (const testNode of testNodes) {
      await createGraphEdge({ shopId, fromNodeId: testNode.id, toNodeId: procedureNode.id, edgeType: 'TEST_CONFIRMS', ...sourceRef });
      edgeCount++;
    }

    await recordObservation({ shopId, repairCaseId, observationType: 'repair_procedure_applied', observationValue: normFinalFix, normalizedValue: normFinalFix });
    observationCount++;
  }

  // ── Part nodes + USES_PART edges ──────────────────────────

  for (const partNum of parts) {
    const partNode = await upsertGraphNode({
      shopId,
      nodeType: 'part',
      canonicalName: partNum,
      displayName: partNum,
      normalizedKey: createNormalizedKey('part', [partNum]),
      ...sourceRef,
    });
    nodeCount++;

    if (procedureNode) {
      await createGraphEdge({ shopId, fromNodeId: procedureNode.id, toNodeId: partNode.id, edgeType: 'USES_PART', ...sourceRef });
      edgeCount++;
    }

    await recordObservation({ shopId, repairCaseId, observationType: 'part_replaced', observationValue: partNum, normalizedValue: partNum });
    observationCount++;
  }

  // ── Technician nodes + PERFORMED_BY edges ─────────────────
  // NOTE: Technician nodes are shop-private and must never be marked is_global

  for (const techName of input.technicianNames) {
    const techNode = await upsertGraphNode({
      shopId,
      nodeType: 'technician',
      canonicalName: techName,
      displayName: techName,
      normalizedKey: createNormalizedKey('technician', [shopId, techName]),
      isGlobal: false,
      isAnonymized: false,
      ...sourceRef,
    });
    nodeCount++;

    if (procedureNode) {
      await createGraphEdge({ shopId, fromNodeId: techNode.id, toNodeId: procedureNode.id, edgeType: 'PERFORMED_BY', isGlobal: false, ...sourceRef });
      edgeCount++;
    }
  }

  // ── Outcome node + HAS_OUTCOME edge ──────────────────────

  if (procedureNode && input.outcome !== 'unknown') {
    const outcomeNode = await upsertGraphNode({
      shopId,
      nodeType: 'outcome',
      canonicalName: input.outcome,
      displayName: input.outcome,
      normalizedKey: createNormalizedKey('outcome', [input.outcome]),
      ...sourceRef,
    });
    nodeCount++;

    await createGraphEdge({ shopId, fromNodeId: procedureNode.id, toNodeId: outcomeNode.id, edgeType: 'HAS_OUTCOME', ...sourceRef });
    edgeCount++;

    const obsType = input.outcome === 'comeback' ? 'outcome_comeback'
      : input.outcome === 'partial' ? 'outcome_partial'
      : 'outcome_resolved';
    await recordObservation({ shopId, repairCaseId, observationType: obsType, observationValue: input.outcome });
    observationCount++;
  }

  // ── Lesson node + LEARNED_FROM edge ──────────────────────

  if (input.lessonLearned?.trim()) {
    await upsertGraphNode({
      shopId,
      nodeType: 'lesson',
      canonicalName: input.lessonLearned.trim(),
      displayName: input.lessonLearned.trim().slice(0, 80),
      normalizedKey: createNormalizedKey('lesson', [repairCaseId]),
      isGlobal: false,
      ...sourceRef,
    });
    nodeCount++;

    // Store as a structured lesson — repair_case_id on the lesson row IS the LEARNED_FROM link
    await createStructuredLesson({
      shopId,
      repairCaseId,
      title: `Lesson from ${normMake ?? 'vehicle'} ${normModel ?? ''} repair`,
      finalFix: normFinalFix ?? undefined,
      whatWasWrong: input.cause ?? undefined,
      recommendation: input.lessonLearned.trim(),
      tags: [normMake, normModel, ...(dtcCodes)].filter((t): t is string => Boolean(t)),
    });
  }

  return { nodeCount, edgeCount, observationCount };
}

// ── 6. findSimilarRepairCases ─────────────────────────────────

/**
 * Find repair cases similar to the given inputs using SQL-based matching.
 * Scores based on DTC match, make/model match, symptom overlap.
 *
 * TODO (Sprint 5): Replace with vector similarity on embedded nodes.
 * TODO: Consider adding engine match and part match to scoring.
 */
export async function findSimilarRepairCases(params: {
  shopId: string;
  make?: string | null;
  model?: string | null;
  engine?: string | null;
  dtcCodes?: string[];
  symptoms?: string[];
  limit?: number;
}): Promise<SimilarRepairMatch[]> {
  const { shopId, limit = 10 } = params;
  const normMake = normalizeMake(params.make);
  const normModel = normalizeModel(params.model);
  const normEngine = normalizeEngine(params.engine);
  const dtcCodes = (params.dtcCodes ?? []).map(d => normalizeDtcCode(d)).filter((d): d is string => d !== null);
  const symptoms = (params.symptoms ?? []).map(s => normalizeSymptom(s)).filter((s): s is string => s !== null);

  // Find observations for matching DTCs and symptoms in this shop
  const matchValues = [...dtcCodes, ...symptoms];
  if (matchValues.length === 0 && !normMake && !normModel) return [];

  const { data: obsData } = await supabase
    .from('automotive_graph_observations')
    .select('repair_case_id, observation_type, normalized_value')
    .eq('shop_id', shopId)
    .in('observation_type', ['dtc_present', 'symptom_observed'])
    .in('normalized_value', matchValues)
    .not('repair_case_id', 'is', null);

  const caseScores: Record<string, { score: number; reasons: SimilarityMatchReason[] }> = {};

  for (const obs of (obsData ?? []) as Record<string, unknown>[]) {
    const caseId = obs.repair_case_id as string;
    if (!caseScores[caseId]) caseScores[caseId] = { score: 0, reasons: [] };

    const value = obs.normalized_value as string;
    const isDtc = dtcCodes.includes(value);
    const weight = isDtc ? 0.4 : 0.2;

    caseScores[caseId].score += weight;
    caseScores[caseId].reasons.push({
      type: isDtc ? 'dtc_match' : 'symptom_match',
      value,
      weight,
    });
  }

  // Fetch repair cases and enrich with make/model match
  const caseIds = Object.keys(caseScores);
  if (caseIds.length === 0) return [];

  const { data: casesData } = await supabase
    .from('repair_cases')
    .select('id, make, model, engine, dtc_codes, symptoms, final_fix, verification_status, shop_id')
    .in('id', caseIds)
    .eq('shop_id', shopId)
    .limit(limit * 3);

  const results: SimilarRepairMatch[] = [];

  for (const rc of (casesData ?? []) as Record<string, unknown>[]) {
    const caseId = rc.id as string;
    const scoreData = caseScores[caseId] ?? { score: 0, reasons: [] };

    // Boost score for make/model/engine match
    const caseMake = normalizeMake(rc.make as string);
    const caseModel = normalizeModel(rc.model as string);
    const caseEngine = normalizeEngine(rc.engine as string);

    if (normMake && caseMake === normMake) {
      scoreData.score += 0.2;
      scoreData.reasons.push({ type: 'make_model_match', value: normMake, weight: 0.2 });
    }
    if (normModel && caseModel === normModel) {
      scoreData.score += 0.3;
      scoreData.reasons.push({ type: 'make_model_match', value: normModel, weight: 0.3 });
    }
    if (normEngine && caseEngine === normEngine) {
      scoreData.score += 0.2;
      scoreData.reasons.push({ type: 'engine_match', value: normEngine, weight: 0.2 });
    }

    results.push({
      repairCaseId: caseId,
      shopId: rc.shop_id as string,
      similarityScore: Math.min(1, scoreData.score),
      matchReasons: scoreData.reasons,
      make: caseMake,
      model: caseModel,
      year: null,
      engine: caseEngine,
      dtcCodes: [],
      symptoms: [],
      finalFix: (rc.final_fix as string) ?? null,
      outcome: 'unknown',
      verificationStatus: (rc.verification_status as string) ?? 'pending',
      sharedNodes: [],
      sharedEdges: [],
      confidence: Math.min(1, scoreData.score),
    });
  }

  return results
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);
}

// ── 7. getGraphContextForSecondOpinion ────────────────────────

/**
 * Build structured graph context for an AI second opinion prompt.
 * Returns nodes, suggested tests, historical fixes, and related lessons.
 *
 * TODO (Sprint 6): Pass this context to a Claude prompt instead of
 *   returning raw data. The AI should reason over graph context, not
 *   free-text case notes.
 */
export async function getGraphContextForSecondOpinion(params: {
  shopId: string;
  make?: string | null;
  model?: string | null;
  engine?: string | null;
  dtcCodes?: string[];
  symptoms?: string[];
}): Promise<SecondOpinionGraphContext> {
  const { shopId } = params;
  const dtcCodes = (params.dtcCodes ?? []).map(d => normalizeDtcCode(d)).filter((d): d is string => d !== null);
  const symptoms = (params.symptoms ?? []).map(s => normalizeSymptom(s)).filter((s): s is string => s !== null);

  // Fetch DTC nodes
  const dtcNodes: AutomotiveGraphNode[] = [];
  if (dtcCodes.length > 0) {
    const { data } = await supabase
      .from('automotive_graph_nodes')
      .select('*')
      .eq('shop_id', shopId)
      .eq('node_type', 'dtc')
      .in('canonical_name', dtcCodes);
    dtcNodes.push(...((data ?? []) as Record<string, unknown>[]).map(mapNode));
  }

  // Fetch symptom nodes
  const symptomNodes: AutomotiveGraphNode[] = [];
  if (symptoms.length > 0) {
    const { data } = await supabase
      .from('automotive_graph_nodes')
      .select('*')
      .eq('shop_id', shopId)
      .eq('node_type', 'symptom')
      .in('canonical_name', symptoms);
    symptomNodes.push(...((data ?? []) as Record<string, unknown>[]).map(mapNode));
  }

  const dtcNodeIds = dtcNodes.map(n => n.id);
  const symptomNodeIds = symptomNodes.map(n => n.id);

  // Suggested tests: test nodes connected to these DTCs/symptoms via REQUIRES_TEST
  const suggestedTests: SecondOpinionGraphContext['suggestedTests'] = [];
  if (dtcNodeIds.length > 0 || symptomNodeIds.length > 0) {
    const { data: testEdges } = await supabase
      .from('automotive_graph_edges')
      .select('to_node_id, weight, evidence_count')
      .eq('shop_id', shopId)
      .eq('edge_type', 'REQUIRES_TEST')
      .in('from_node_id', [...dtcNodeIds, ...symptomNodeIds]);

    if (testEdges && testEdges.length > 0) {
      const testNodeIds = (testEdges as Record<string, unknown>[]).map(e => e.to_node_id as string);
      const { data: testNodes } = await supabase
        .from('automotive_graph_nodes')
        .select('*')
        .in('id', testNodeIds);

      const testNodeMap = new Map<string, AutomotiveGraphNode>();
      for (const n of (testNodes ?? []) as Record<string, unknown>[]) {
        const node = mapNode(n);
        testNodeMap.set(node.id, node);
      }

      for (const edge of testEdges as Record<string, unknown>[]) {
        const node = testNodeMap.get(edge.to_node_id as string);
        if (node) {
          suggestedTests.push({ node, confidence: Number(edge.weight ?? 1), evidenceCount: Number(edge.evidence_count ?? 1) });
        }
      }
    }
  }

  // Historical fixes: repair_procedure nodes connected to these DTCs via HAS_DTC → TEST_CONFIRMS
  const historicalFixes: SecondOpinionGraphContext['historicalFixes'] = [];
  if (dtcNodeIds.length > 0) {
    const { data: fixEdges } = await supabase
      .from('automotive_graph_edges')
      .select('to_node_id, weight, evidence_count')
      .eq('shop_id', shopId)
      .eq('edge_type', 'TEST_CONFIRMS')
      .order('weight', { ascending: false })
      .limit(10);

    if (fixEdges && fixEdges.length > 0) {
      const fixNodeIds = (fixEdges as Record<string, unknown>[]).map(e => e.to_node_id as string);
      const { data: fixNodes } = await supabase
        .from('automotive_graph_nodes')
        .select('*')
        .in('id', fixNodeIds);

      const fixNodeMap = new Map<string, AutomotiveGraphNode>();
      for (const n of (fixNodes ?? []) as Record<string, unknown>[]) {
        const node = mapNode(n);
        fixNodeMap.set(node.id, node);
      }

      for (const edge of fixEdges as Record<string, unknown>[]) {
        const node = fixNodeMap.get(edge.to_node_id as string);
        if (node) {
          const w = Number(edge.weight ?? 1);
          historicalFixes.push({ node, successRate: Math.min(1, w / 5), evidenceCount: Number(edge.evidence_count ?? 1) });
        }
      }
    }
  }

  // Related lessons
  const { data: lessonData } = await supabase
    .from('automotive_graph_lessons')
    .select('*')
    .eq('shop_id', shopId)
    .order('confidence_score', { ascending: false })
    .limit(5);
  const relatedLessons = ((lessonData ?? []) as Record<string, unknown>[]).map(mapLesson);

  const similarCount = await findSimilarRepairCases({ shopId, make: params.make, model: params.model, engine: params.engine, dtcCodes: params.dtcCodes, symptoms: params.symptoms });

  return {
    repairCaseId: null,
    vehicleContext: {
      make: normalizeMake(params.make),
      model: normalizeModel(params.model),
      year: null,
      engine: normalizeEngine(params.engine),
      transmission: null,
    },
    dtcNodes,
    symptomNodes,
    suggestedTests,
    historicalFixes,
    commonPitfalls: relatedLessons.map(l => l.commonMistake).filter((m): m is string => Boolean(m)),
    relatedLessons,
    similarCaseCount: similarCount.length,
  };
}

// ── 8. getTechnicianLearningSignals ───────────────────────────

/**
 * Analyze a technician's repair history via graph observations
 * to surface coaching signals.
 *
 * TODO (Sprint 5): Add time-to-resolution metric from time_entries.
 * TODO (Sprint 6): Compare against shop average to identify outliers.
 */
export async function getTechnicianLearningSignals(params: {
  shopId: string;
  technicianName: string;
}): Promise<TechnicianLearningSignal> {
  const { shopId, technicianName } = params;

  // Find the technician node
  const normKey = createNormalizedKey('technician', [shopId, technicianName]);
  const { data: techNodeData } = await supabase
    .from('automotive_graph_nodes')
    .select('id')
    .eq('shop_id', shopId)
    .eq('normalized_key', normKey)
    .maybeSingle();

  const techNodeId = (techNodeData as Record<string, unknown> | null)?.id as string | null;

  // Find repair procedures this technician performed
  let totalRepairs = 0;
  const strongPlatforms: string[] = [];

  if (techNodeId) {
    const { data: perfEdges } = await supabase
      .from('automotive_graph_edges')
      .select('to_node_id, evidence_count')
      .eq('shop_id', shopId)
      .eq('from_node_id', techNodeId)
      .eq('edge_type', 'PERFORMED_BY');

    totalRepairs = (perfEdges ?? []).length;
  }

  // Find comeback observations linked to this technician
  const { data: comebackObs } = await supabase
    .from('automotive_graph_observations')
    .select('repair_case_id')
    .eq('shop_id', shopId)
    .eq('observation_type', 'outcome_comeback')
    .eq('technician_id', techNodeId ?? '');

  const comebackCount = (comebackObs ?? []).length;
  const comebackRate = totalRepairs > 0 ? comebackCount / totalRepairs : 0;
  const firstTimeFixRate = 1 - comebackRate;

  // Related lessons for this technician
  const { data: lessonData } = await supabase
    .from('automotive_graph_lessons')
    .select('*')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(3);
  const suggestedLessons = ((lessonData ?? []) as Record<string, unknown>[]).map(mapLesson);

  return {
    technicianName,
    shopId,
    strengths: totalRepairs > 5 ? [{
      area: 'Experience',
      description: `${technicianName} has completed ${totalRepairs} documented repairs in the knowledge graph.`,
      evidenceCount: totalRepairs,
      confidence: 0.8,
    }] : [],
    areasForGrowth: comebackRate > 0.1 ? [{
      area: 'First-time fix rate',
      description: `${(comebackRate * 100).toFixed(0)}% comeback rate — review diagnostic process on recurring complaints.`,
      relatedComebacks: comebackCount,
      suggestedAction: 'Review lessons from similar DTC cases with successful first-time fixes.',
    }] : [],
    suggestedLessons,
    stats: {
      totalRepairs,
      firstTimeFixRate,
      comebackRate,
      avgDiagnosisTime: null, // TODO: derive from time_entries
      strongPlatforms,
      challengingDtcCodes: [], // TODO: derive from comeback observations with DTC context
    },
  };
}

// ── 9. getGraphStatus ─────────────────────────────────────────

/**
 * Get aggregate counts for the knowledge graph admin dashboard.
 */
export async function getGraphStatus(shopId: string): Promise<GraphStatus> {
  const [
    { count: nodeCount },
    { count: edgeCount },
    { count: observationCount },
    { count: lessonCount },
    { data: lastNode },
  ] = await Promise.all([
    supabase.from('automotive_graph_nodes').select('*', { count: 'exact', head: true }).eq('shop_id', shopId),
    supabase.from('automotive_graph_edges').select('*', { count: 'exact', head: true }).eq('shop_id', shopId),
    supabase.from('automotive_graph_observations').select('*', { count: 'exact', head: true }).eq('shop_id', shopId),
    supabase.from('automotive_graph_lessons').select('*', { count: 'exact', head: true }).eq('shop_id', shopId),
    supabase.from('automotive_graph_nodes').select('updated_at').eq('shop_id', shopId).order('updated_at', { ascending: false }).limit(1),
  ]);

  const lastUpdated = (lastNode as Record<string, unknown>[] | null)?.[0]?.updated_at as string | null ?? null;

  return {
    nodeCount: nodeCount ?? 0,
    edgeCount: edgeCount ?? 0,
    observationCount: observationCount ?? 0,
    lessonCount: lessonCount ?? 0,
    lastUpdated,
    nodeBreakdown: {},
    edgeBreakdown: {},
  };
}

// ── Re-exports for convenience ────────────────────────────────

export type {
  AutomotiveGraphNode,
  AutomotiveGraphEdge,
  AutomotiveGraphObservation,
  AutomotiveGraphLesson,
  AutomotiveGraphMetric,
  GraphStatus,
  RepairCaseToGraphInput,
  SimilarRepairMatch,
  SecondOpinionGraphContext,
  TechnicianLearningSignal,
} from '@/lib/knowledge-graph/types';
