/**
 * lib/diagnostics/orchestrator/DiagnosticOrchestrator.ts
 *
 * Core orchestrator: advances a diagnostic session through state transitions,
 * calls providers, validates all AI output with Zod schemas, and persists to
 * Supabase. All execution is behind feature flags.
 *
 * SAFETY RULES enforced here:
 * - Never write to an ECU (programming, coding, adaptations, security access)
 * - Never clear DTCs automatically
 * - Never treat AI confidence as ground truth
 * - All AI output is validated server-side before persistence
 * - isSimulated=true unless diagnostic_live_hardware_enabled is explicitly true
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DiagnosticSession, DiagnosticSessionStatus } from '../types';
import type { DiagnosticReasoningProvider, DiagnosticReviewProvider } from '../providers/DiagnosticReasoningProvider';
import type { VehicleDiagnosticProvider } from '../providers/VehicleDiagnosticProvider';
import { assertTransition } from './DiagnosticStateMachine';
import { DiagnosticReasoningResultSchema, DiagnosticReviewResultSchema } from '../schemas';
import { calculateConfidence } from '../confidence/ConfidenceEngine';

export interface OrchestratorDependencies {
  supabase: SupabaseClient;
  reasoningProvider: DiagnosticReasoningProvider;
  reviewProvider: DiagnosticReviewProvider;
  vehicleProvider: VehicleDiagnosticProvider;
  flags: {
    diagnosticOrchestratorEnabled: boolean;
    diagnosticAiReasoningEnabled: boolean;
    diagnosticClaudeReviewEnabled: boolean;
    diagnosticLiveHardwareEnabled: boolean;
  };
  promptVersion: string;
  engineVersion: string;
  rulesVersion: string;
}

export class DiagnosticOrchestrator {
  private readonly deps: OrchestratorDependencies;

  constructor(deps: OrchestratorDependencies) {
    if (!deps.flags.diagnosticOrchestratorEnabled) {
      throw new Error('DiagnosticOrchestrator: diagnostic_orchestrator_enabled flag is OFF');
    }
    this.deps = deps;
  }

  /** Advance session to the next state, persist, and return the updated session */
  async advance(
    session: DiagnosticSession,
    targetState: DiagnosticSessionStatus,
  ): Promise<DiagnosticSession> {
    assertTransition(session.status, targetState);

    switch (targetState) {
      case 'VEHICLE_IDENTIFIED':
        return this.identifyVehicle(session);
      case 'BASELINE_SCAN_COMPLETE':
        return this.baselineScan(session);
      case 'HYPOTHESES_GENERATED':
        return this.generateHypotheses(session);
      case 'SAFETY_REVIEWED':
        return this.safetyReview(session);
      default:
        return this.transitionStatus(session, targetState);
    }
  }

  // ── Step: vehicle identification ────────────────────────────────────────────

  private async identifyVehicle(session: DiagnosticSession): Promise<DiagnosticSession> {
    // Vehicle data comes from scan or job card; no ECU writes
    return this.transitionStatus(session, 'VEHICLE_IDENTIFIED');
  }

  // ── Step: baseline scan ─────────────────────────────────────────────────────

  private async baselineScan(session: DiagnosticSession): Promise<DiagnosticSession> {
    assertTransition(session.status, 'BASELINE_SCAN_COMPLETE');

    if (!this.deps.flags.diagnosticLiveHardwareEnabled) {
      // Simulated scan — safe path, no real hardware
      const result = await this.deps.vehicleProvider.scan(session.id, session.shopId);

      const { error: modError } = await this.deps.supabase
        .from('diagnostic_modules')
        .insert(result.modules.map((m) => ({ ...m, session_id: m.sessionId, shop_id: m.shopId })));
      if (modError) throw new Error(`Failed to persist modules: ${modError.message}`);

      const { error: dtcError } = await this.deps.supabase
        .from('diagnostic_dtcs')
        .insert(result.dtcs.map((d) => ({ ...d, session_id: d.sessionId, shop_id: d.shopId, dtc_type: d.type, dtc_system: d.system })));
      if (dtcError) throw new Error(`Failed to persist DTCs: ${dtcError.message}`);

      const updated: DiagnosticSession = {
        ...session,
        vehicle: result.vehicle,
        modules: result.modules,
        dtcs: result.dtcs,
        freezeFrames: result.freezeFrames,
        status: 'BASELINE_SCAN_COMPLETE',
        updatedAt: new Date().toISOString(),
      };
      return this.persistSessionStatus(updated);
    }

    // Live hardware path is blocked in Version 1 regardless of flag
    // (flag exists but V1 bridge is not implemented yet)
    throw new Error(
      'Live hardware scan is not available in Version 1. Set diagnostic_live_hardware_enabled=false.',
    );
  }

  // ── Step: AI reasoning ──────────────────────────────────────────────────────

  private async generateHypotheses(session: DiagnosticSession): Promise<DiagnosticSession> {
    assertTransition(session.status, 'HYPOTHESES_GENERATED');

    if (!this.deps.flags.diagnosticAiReasoningEnabled) {
      throw new Error('generateHypotheses: diagnostic_ai_reasoning_enabled flag is OFF');
    }

    const reasoning = await this.deps.reasoningProvider.reason({
      session,
      promptVersion: this.deps.promptVersion,
      engineVersion: this.deps.engineVersion,
      rulesVersion: this.deps.rulesVersion,
      shopId: session.shopId,
      deterministicConfidenceOnly: true,
    });

    // Server-side validation before any persistence
    DiagnosticReasoningResultSchema.parse({
      caseSummary: reasoning.caseSummary,
      identifiedSystem: reasoning.identifiedSystem,
      dtcRelationships: reasoning.dtcRelationships,
      hypotheses: reasoning.hypotheses,
      contradictions: reasoning.contradictions,
      missingData: reasoning.missingData,
      nextRecommendedTest: reasoning.nextRecommendedTest,
      safetyWarnings: reasoning.safetyWarnings,
      componentsNotToReplaceYet: reasoning.componentsNotToReplaceYet,
      evidenceQuality: reasoning.evidenceQuality,
      provisionalConfidence: reasoning.provisionalConfidence,
      assumptions: reasoning.assumptions,
    });

    const { error } = await this.deps.supabase.from('diagnostic_reasoning_runs').insert({
      id: reasoning.id,
      session_id: reasoning.sessionId,
      shop_id: reasoning.shopId,
      model_provider: reasoning.modelProvider,
      model_name: reasoning.modelName,
      prompt_version: reasoning.promptVersion,
      engine_version: reasoning.engineVersion,
      rules_version: this.deps.rulesVersion,
      normalized_payload: reasoning,
      schema_version: '1.0',
      safety_status: reasoning.safetyStatus,
      validated_at: reasoning.validatedAt,
    });
    if (error) throw new Error(`Failed to persist reasoning: ${error.message}`);

    if (this.deps.flags.diagnosticClaudeReviewEnabled) {
      await this.runClaudeReview(session, reasoning);
    }

    const updated: DiagnosticSession = {
      ...session,
      reasoningRuns: [...session.reasoningRuns, reasoning],
      status: 'HYPOTHESES_GENERATED',
      updatedAt: new Date().toISOString(),
    };
    return this.persistSessionStatus(updated);
  }

  // ── Step: Claude independent review ────────────────────────────────────────

  private async runClaudeReview(
    session: DiagnosticSession,
    primaryReasoning: import('../types').DiagnosticReasoningResult,
  ): Promise<void> {
    const review = await this.deps.reviewProvider.review({
      session,
      primaryReasoning,
      promptVersion: this.deps.promptVersion,
      shopId: session.shopId,
    });

    DiagnosticReviewResultSchema.parse({
      agreesWithPrimary: review.agreesWithPrimary,
      disagreementPoints: review.disagreementPoints,
      unsupportedAssumptions: review.unsupportedAssumptions,
      missingPrerequisiteTests: review.missingPrerequisiteTests,
      unsafeRecommendations: review.unsafeRecommendations,
      evidenceQualityConcerns: review.evidenceQualityConcerns,
      suggestedCorrections: review.suggestedCorrections,
      severity: review.severity,
      approvalState: review.approvalState,
    });

    const { error } = await this.deps.supabase.from('diagnostic_reviews').insert({
      id: review.id,
      session_id: review.sessionId,
      shop_id: review.shopId,
      primary_reasoning_id: review.primaryReasoningId,
      model_provider: review.modelProvider,
      model_name: review.modelName,
      prompt_version: review.promptVersion,
      normalized_payload: review,
      schema_version: '1.0',
      agrees_with_primary: review.agreesWithPrimary,
      severity: review.severity,
      approval_state: review.approvalState,
      safety_status: 'CLEAR',
      validated_at: review.validatedAt,
    });
    if (error) throw new Error(`Failed to persist review: ${error.message}`);
  }

  // ── Step: safety review ─────────────────────────────────────────────────────

  private async safetyReview(session: DiagnosticSession): Promise<DiagnosticSession> {
    assertTransition(session.status, 'SAFETY_REVIEWED');
    // Rules engine will be wired here in Phase 6
    return this.transitionStatus(session, 'SAFETY_REVIEWED');
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async transitionStatus(
    session: DiagnosticSession,
    newStatus: DiagnosticSessionStatus,
  ): Promise<DiagnosticSession> {
    const updated: DiagnosticSession = {
      ...session,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };
    return this.persistSessionStatus(updated);
  }

  private async persistSessionStatus(session: DiagnosticSession): Promise<DiagnosticSession> {
    const confidence = calculateConfidence(session);
    const { error } = await this.deps.supabase
      .from('diagnostic_sessions')
      .update({
        status: session.status,
        confidence_payload: confidence,
        updated_at: session.updatedAt,
      })
      .eq('id', session.id)
      .eq('shop_id', session.shopId);

    if (error) throw new Error(`Failed to update session status: ${error.message}`);
    return { ...session, confidence };
  }
}
