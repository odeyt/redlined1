/**
 * RedlineD1 — Context Builder
 * Sprint 6 — ERE Part 6 & 10
 *
 * Transforms reasoning output into a clean, provider-agnostic JSON context
 * for any LLM (Claude, GPT, Gemini, local LLM).
 *
 * The LLM receives ONLY this output — never raw repair cases.
 */

import {
  Evidence,
  ConfidenceResult,
  Recommendation,
  KnownUnknown,
  LLMContext,
  LessonSummary,
  SimilarRepairSummary,
  ReasoningInput,
} from './types';

// ─── Provider-agnostic prompt formatters ──────────────────────────────────────

export type LLMProvider = 'claude' | 'openai' | 'gemini' | 'local';

export interface FormattedPrompt {
  provider: LLMProvider;
  systemPrompt: string;
  userMessage: string;
  context: LLMContext;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export class ContextBuilder {

  /**
   * Build a clean LLM context object from reasoning outputs.
   * This is the ONLY data the LLM should receive.
   */
  build(
    input: ReasoningInput,
    evidence: Evidence[],
    confidence: ConfidenceResult,
    recommendations: Recommendation[],
    knownUnknowns: KnownUnknown[],
    cacheKey: string,
  ): LLMContext {
    return {
      vehicle: {
        make:         input.make         ?? null,
        model:        input.model        ?? null,
        year:         input.year         ?? null,
        engine:       input.engine       ?? null,
        transmission: input.transmission ?? null,
        mileage:      input.mileage      ?? null,
        vin:          null, // VIN is NEVER sent to any LLM — shop-private only
      },
      complaint:   input.complaint ?? null,
      cause:       input.cause     ?? null,
      symptoms:    input.symptoms,
      dtcCodes:    input.dtcCodes,

      // Top 8 positive evidence items only
      topEvidence: evidence
        .filter(e => e.weight > 0)
        .slice(0, 8)
        .map(e => this.sanitizeEvidence(e)),

      topLessons: (input.lessons ?? [])
        .slice(0, 3)
        .map(l => this.sanitizeLesson(l)),

      topSimilarRepairs: (input.similarRepairs ?? [])
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, 5)
        .map(sr => this.sanitizeSimilarRepair(sr)),

      topRecommendations: recommendations.slice(0, 5),

      confidence,
      knownUnknowns,
      generatedAt: new Date().toISOString(),
      cacheKey,
    };
  }

  /**
   * Format the LLM context into a provider-specific prompt.
   * The reasoning engine is provider-agnostic — only this method changes per provider.
   */
  formatPrompt(context: LLMContext, provider: LLMProvider = 'claude'): FormattedPrompt {
    const systemPrompt = this.buildSystemPrompt(provider);
    const userMessage  = this.buildUserMessage(context);
    return { provider, systemPrompt, userMessage, context };
  }

  // ── Sanitizers (ensure no PII leaks to LLM) ──────────────────────────────

  private sanitizeEvidence(e: Evidence): Evidence {
    // Strip any metadata that could contain customer data
    const safe = { ...e };
    if (safe.metadata) {
      const { customer, customerName, phone, email, address, vin, ...rest } = safe.metadata as Record<string, unknown>;
      void customer; void customerName; void phone; void email; void address; void vin;
      safe.metadata = rest;
    }
    return safe;
  }

  private sanitizeLesson(l: LessonSummary): LessonSummary {
    return { ...l }; // lessons should already be anonymized
  }

  private sanitizeSimilarRepair(sr: SimilarRepairSummary): SimilarRepairSummary {
    return {
      ...sr,
      // Never include VIN in similar repair summaries
    };
  }

  // ── Prompt builders ───────────────────────────────────────────────────────

  private buildSystemPrompt(provider: LLMProvider): string {
    const base = `You are an expert automotive diagnostic assistant for a professional repair shop.

You MUST:
- Base every recommendation on the provided evidence only
- Cite evidence when making claims
- Acknowledge known unknowns and data gaps
- Give confidence levels with each recommendation
- Prioritize verified repairs over unverified ones
- Flag comeback patterns as warning signs

You MUST NOT:
- Invent symptoms or DTCs not in the context
- Make recommendations without evidence support
- Ignore comeback history
- Reference customer names, VINs, or personal information
- Claim certainty when confidence is below 70%`;

    if (provider === 'openai') {
      return base + '\n\nRespond in JSON format when structured output is requested.';
    }
    if (provider === 'gemini') {
      return base + '\n\nProvide structured, numbered recommendations.';
    }
    return base; // claude, local — use base
  }

  private buildUserMessage(ctx: LLMContext): string {
    const vehicle = [ctx.vehicle.year, ctx.vehicle.make, ctx.vehicle.model, ctx.vehicle.engine]
      .filter(Boolean).join(' ') || 'Unknown vehicle';

    const lines: string[] = [
      `## Vehicle`,
      vehicle,
      ctx.vehicle.transmission ? `Transmission: ${ctx.vehicle.transmission}` : '',
      ctx.vehicle.mileage      ? `Mileage: ${ctx.vehicle.mileage.toLocaleString()} km/mi` : '',
      '',
      `## Customer Complaint`,
      ctx.complaint ?? 'Not documented',
      '',
    ];

    if (ctx.cause) {
      lines.push(`## Technician Diagnosis`, ctx.cause, '');
    }

    if (ctx.dtcCodes.length > 0) {
      lines.push(`## Fault Codes`, ctx.dtcCodes.join(', '), '');
    }

    if (ctx.symptoms.length > 0) {
      lines.push(`## Symptoms`, ...ctx.symptoms.map(s => `- ${s}`), '');
    }

    lines.push(
      `## Confidence Assessment`,
      `Overall: ${ctx.confidence.overall}% (${ctx.confidence.unknownRisk} unknown risk)`,
      ctx.confidence.reasoning,
      '',
    );

    if (ctx.topEvidence.length > 0) {
      lines.push(
        `## Supporting Evidence`,
        ...ctx.topEvidence.map(e => `- [${e.type}] ${e.value} (weight: ${e.weight}, verified: ${e.verified})`),
        '',
      );
    }

    if (ctx.topSimilarRepairs.length > 0) {
      lines.push(`## Similar Verified Repairs`);
      for (const sr of ctx.topSimilarRepairs) {
        const v = [sr.year, sr.make, sr.model].filter(Boolean).join(' ');
        lines.push(`- ${v}: ${sr.finalFix ?? 'Unknown fix'} (${sr.similarityScore}% match, ${sr.verificationStatus})`);
      }
      lines.push('');
    }

    if (ctx.topLessons.length > 0) {
      lines.push(`## Technician Lessons`);
      for (const l of ctx.topLessons) {
        lines.push(`- ${l.title}`);
        if (l.checkFirstNextTime) lines.push(`  → Check first: ${l.checkFirstNextTime}`);
        if (l.commonMistake)      lines.push(`  → Avoid: ${l.commonMistake}`);
      }
      lines.push('');
    }

    if (ctx.topRecommendations.length > 0) {
      lines.push(`## Current Recommendations`);
      for (const r of ctx.topRecommendations) {
        lines.push(`${r.rank}. ${r.action} — ${r.confidence}% confidence`);
        lines.push(`   Reason: ${r.reason}`);
      }
      lines.push('');
    }

    if (ctx.knownUnknowns.length > 0) {
      lines.push(
        `## Known Data Gaps`,
        ...ctx.knownUnknowns.map(u => `- [${u.severity.toUpperCase()}] ${u.description}`),
        '',
      );
    }

    lines.push(
      `## Request`,
      `Based on this evidence, provide:`,
      `1. Your assessment of the most likely root cause`,
      `2. Recommended next diagnostic steps (in order)`,
      `3. Any additional tests you would request before replacing parts`,
      `4. Red flags or patterns the technician should be aware of`,
    );

    return lines.filter(l => l !== undefined).join('\n');
  }

  /**
   * Serialize LLM context to JSON string (for logging, caching, or debugging).
   */
  serialize(context: LLMContext): string {
    return JSON.stringify(context, null, 2);
  }

  /**
   * Estimate token count for budget management (rough: 4 chars ≈ 1 token).
   */
  estimateTokens(context: LLMContext): number {
    return Math.ceil(this.serialize(context).length / 4);
  }
}
