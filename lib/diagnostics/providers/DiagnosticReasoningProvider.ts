/**
 * lib/diagnostics/providers/DiagnosticReasoningProvider.ts
 *
 * Abstract interface for the diagnostic AI reasoning layer.
 * OpenAI is the primary provider. Anthropic Claude is the independent reviewer.
 * Both are swappable; the orchestrator never calls a provider directly.
 */

import type { DiagnosticSession, DiagnosticReasoningResult, DiagnosticReviewResult } from '../types';

// ── Primary reasoning provider (OpenAI) ───────────────────────────────────────

export interface DiagnosticReasoningContext {
  session: DiagnosticSession;
  promptVersion: string;
  engineVersion: string;
  rulesVersion: string;
  shopId: string;
  /** Prevents callers from passing raw AI probability as confidence */
  deterministicConfidenceOnly: true;
}

export interface DiagnosticReasoningProvider {
  readonly providerName: string;
  readonly modelName: string;
  readonly isSimulated: boolean;

  /**
   * Generate structured diagnostic reasoning for a session.
   * Output MUST be validated with DiagnosticReasoningResultSchema before use.
   */
  reason(ctx: DiagnosticReasoningContext): Promise<DiagnosticReasoningResult>;
}

// ── Independent review provider (Anthropic Claude) ────────────────────────────

export interface DiagnosticReviewContext {
  session: DiagnosticSession;
  primaryReasoning: DiagnosticReasoningResult;
  promptVersion: string;
  shopId: string;
}

export interface DiagnosticReviewProvider {
  readonly providerName: string;
  readonly modelName: string;
  readonly isSimulated: boolean;

  /**
   * Independently review the primary reasoning result.
   * Output MUST be validated with DiagnosticReviewResultSchema before use.
   */
  review(ctx: DiagnosticReviewContext): Promise<DiagnosticReviewResult>;
}
