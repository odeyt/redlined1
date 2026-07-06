/**
 * RedlineD1 — Recommendation Engine
 * Sprint 6 — ERE Part 5
 *
 * Generates ranked, evidence-backed repair recommendations.
 * Every recommendation MUST cite evidence. No hallucinations allowed.
 */

import {
  Evidence,
  Recommendation,
  EvidenceSupportItem,
  SimilarRepairSummary,
  LessonSummary,
  ReasoningInput,
} from './types';

// ─── Candidate ────────────────────────────────────────────────────────────────

interface RecommendationCandidate {
  action: string;
  reason: string;
  evidenceIds: string[];
  score: number;
  verifiedRepairs: number;
  comebackCount: number;
  totalCases: number; // total similar repair cases this recommendation is drawn from
  sources: string[];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export class RecommendationEngine {

  /**
   * Generate ranked recommendations from evidence + similar repairs + lessons.
   * Returns top N recommendations, each with full evidence support.
   */
  generate(
    input: ReasoningInput,
    evidence: Evidence[],
    similarRepairs: SimilarRepairSummary[] = [],
    lessons: LessonSummary[] = [],
    limit = 5,
  ): Recommendation[] {
    const candidates: RecommendationCandidate[] = [];

    // ── 1. From similar repairs (highest confidence source) ───────────────────
    this.fromSimilarRepairs(candidates, similarRepairs);

    // ── 2. From lessons ───────────────────────────────────────────────────────
    this.fromLessons(candidates, lessons);

    // ── 3. From current case's parts/procedures ───────────────────────────────
    this.fromCurrentCase(candidates, input, evidence);

    // ── 4. From DTC patterns ──────────────────────────────────────────────────
    this.fromDtcPatterns(candidates, input, evidence);

    // Deduplicate by action (case-insensitive), keeping highest score
    const deduped = this.deduplicate(candidates);

    // Sort by score descending
    deduped.sort((a, b) => b.score - a.score);

    // Build final Recommendation objects with evidence support
    return deduped.slice(0, limit).map((c, i) => {
      const support = this.buildSupport(c, evidence);
      const conf = Math.min(98, Math.round(c.score));
      const avgComebackRate = c.totalCases > 0
        ? c.comebackCount / c.totalCases
        : null;

      return {
        rank: i + 1,
        action: c.action,
        reason: c.reason,
        confidence: conf,
        evidenceSupport: support,
        evidenceCount: support.length,
        verifiedRepairs: c.verifiedRepairs,
        avgComebackRate,
        technicianAgreement: c.verifiedRepairs > 1
          ? Math.max(0, Math.min(1, (c.verifiedRepairs - c.comebackCount) / c.verifiedRepairs))
          : null,
        sources: [...new Set(c.sources)],
      };
    });
  }

  // ── From similar repairs ───────────────────────────────────────────────────

  private fromSimilarRepairs(
    candidates: RecommendationCandidate[],
    similar: SimilarRepairSummary[],
  ) {
    // Group by finalFix text
    const byFix = new Map<string, SimilarRepairSummary[]>();
    for (const sr of similar) {
      if (!sr.finalFix) continue;
      const key = sr.finalFix.trim().toLowerCase().slice(0, 80);
      const group = byFix.get(key) ?? [];
      group.push(sr);
      byFix.set(key, group);
    }

    for (const [, group] of byFix) {
      const rep = group[0];
      if (!rep.finalFix) continue;

      const verifiedCount = group.filter(sr =>
        ['tech_verified', 'thirty_day_verified', 'gold_verified'].includes(sr.verificationStatus)
      ).length;
      const goldCount = group.filter(sr => sr.verificationStatus === 'gold_verified').length;
      const comebackCount = group.filter(sr => sr.outcome === 'comeback').length;
      const avgSimilarity = group.reduce((s, sr) => s + sr.similarityScore, 0) / group.length;

      let score = avgSimilarity * 0.5; // 0-50 from similarity
      score += verifiedCount * 15;
      score += goldCount * 10;
      score -= comebackCount * 20;

      const reasons: string[] = [];
      if (verifiedCount > 0) reasons.push(`${verifiedCount} verified repair${verifiedCount > 1 ? 's' : ''}`);
      if (avgSimilarity >= 70) reasons.push('high similarity match');
      if (group.length > 1) reasons.push(`${group.length} cases`);

      candidates.push({
        action: rep.finalFix,
        reason: reasons.length > 0
          ? `Supported by ${reasons.join(', ')}.`
          : `Found in ${group.length} similar repair${group.length > 1 ? 's' : ''}.`,
        evidenceIds: [],
        score: Math.max(0, score),
        verifiedRepairs: verifiedCount,
        comebackCount,
        totalCases: group.length,
        sources: ['knowledge_graph'],
      });
    }
  }

  // ── From lessons ───────────────────────────────────────────────────────────

  private fromLessons(
    candidates: RecommendationCandidate[],
    lessons: LessonSummary[],
  ) {
    for (const lesson of lessons) {
      const action = lesson.checkFirstNextTime ?? lesson.finalFix;
      if (!action) continue;

      const isVerified = ['tech_verified', 'senior_verified', 'published'].includes(lesson.verifiedStatus);
      const score = 40 + (isVerified ? 20 : 0) + (lesson.confidence * 0.2);

      candidates.push({
        action,
        reason: lesson.whatWasWrong
          ? `Lesson: ${lesson.whatWasWrong}`
          : `Documented technician lesson${isVerified ? ' (verified)' : ''}.`,
        evidenceIds: [],
        score,
        verifiedRepairs: isVerified ? 1 : 0,
        comebackCount: 0,
        totalCases: 1,
        sources: ['technician_lesson'],
      });

      // Common mistake as a negative recommendation (what NOT to do first)
      if (lesson.commonMistake) {
        candidates.push({
          action: `Avoid: ${lesson.commonMistake}`,
          reason: `Common mistake documented by technician.`,
          evidenceIds: [],
          score: 30,
          verifiedRepairs: isVerified ? 1 : 0,
          comebackCount: 0,
          totalCases: 1,
          sources: ['technician_lesson'],
        });
      }
    }
  }

  // ── From current case ─────────────────────────────────────────────────────

  private fromCurrentCase(
    candidates: RecommendationCandidate[],
    input: ReasoningInput,
    evidence: Evidence[],
  ) {
    const procedureEvidence = evidence.find(e => e.type === 'repair_procedure');
    if (input.finalFix && procedureEvidence) {
      const isVerified = ['tech_verified', 'thirty_day_verified', 'gold_verified']
        .includes(input.verificationStatus);
      candidates.push({
        action: input.finalFix,
        reason: `Documented repair procedure${isVerified ? ' — verified' : ''}.`,
        evidenceIds: [procedureEvidence.id],
        score: isVerified ? 70 : 50,
        verifiedRepairs: isVerified ? 1 : 0,
        comebackCount: 0,
        totalCases: 1,
        sources: ['repair_case'],
      });
    }

    // Parts replaced → inspect/replace recommendation
    for (const part of input.partsReplaced) {
      const partEv = evidence.find(e => e.type === 'part' && e.value === part);
      if (partEv && partEv.weight > 0) {
        candidates.push({
          action: `Inspect / replace ${part}`,
          reason: `Part was replaced in this repair case.`,
          evidenceIds: [partEv.id],
          score: 35,
          verifiedRepairs: 0,
          comebackCount: 0,
          totalCases: 1,
          sources: ['repair_case'],
        });
      }
    }
  }

  // ── From DTC patterns ──────────────────────────────────────────────────────

  private fromDtcPatterns(
    candidates: RecommendationCandidate[],
    input: ReasoningInput,
    evidence: Evidence[],
  ) {
    for (const code of input.dtcCodes) {
      const dtcEv = evidence.find(e => e.type === 'dtc' && e.value === code.toUpperCase());
      const action = this.dtcAction(code);
      if (!action) continue;
      candidates.push({
        action,
        reason: `Standard diagnostic path for ${code.toUpperCase()}.`,
        evidenceIds: dtcEv ? [dtcEv.id] : [],
        score: 38,
        verifiedRepairs: 0,
        comebackCount: 0,
        totalCases: 0,
        sources: ['dtc_pattern'],
      });
    }
  }

  /** Returns a standard first-step action for well-known DTC ranges. */
  private dtcAction(code: string): string | null {
    const upper = code.toUpperCase();
    if (upper.startsWith('P0') && /P0[13][0-9]{2}/.test(upper)) return 'Perform fuel system pressure test';
    if (upper.startsWith('P02')) return 'Inspect injectors and fuel rail';
    if (upper.startsWith('P04')) return 'Inspect exhaust and EVAP system';
    if (/^P0[5-6]/.test(upper)) return 'Inspect idle control and throttle body';
    if (/^P07/.test(upper)) return 'Perform transmission hydraulic test';
    if (/^B0/.test(upper)) return 'Scan body control module for sub-codes';
    if (/^C0/.test(upper)) return 'Inspect wheel speed sensors and ABS module';
    if (/^U0/.test(upper)) return 'Check CAN bus wiring and module communication';
    return null;
  }

  // ── Deduplication ─────────────────────────────────────────────────────────

  private deduplicate(candidates: RecommendationCandidate[]): RecommendationCandidate[] {
    const map = new Map<string, RecommendationCandidate>();
    for (const c of candidates) {
      const key = c.action.trim().toLowerCase().slice(0, 60);
      const existing = map.get(key);
      if (!existing || c.score > existing.score) {
        map.set(key, {
          ...c,
          verifiedRepairs: (c.verifiedRepairs) + (existing?.verifiedRepairs ?? 0),
          comebackCount: (c.comebackCount) + (existing?.comebackCount ?? 0),
          totalCases: (c.totalCases) + (existing?.totalCases ?? 0),
          sources: [...(existing?.sources ?? []), ...c.sources],
        });
      }
    }
    return Array.from(map.values());
  }

  // ── Build evidence support items ──────────────────────────────────────────

  private buildSupport(
    candidate: RecommendationCandidate,
    evidence: Evidence[],
  ): EvidenceSupportItem[] {
    const items: EvidenceSupportItem[] = [];
    for (const id of candidate.evidenceIds) {
      const ev = evidence.find(e => e.id === id);
      if (ev) {
        items.push({
          evidenceId: ev.id,
          type: ev.type,
          value: ev.value,
          weight: ev.weight,
          verified: ev.verified,
        });
      }
    }
    // Also attach high-weight verified evidence that isn't explicitly cited
    for (const ev of evidence) {
      if (ev.weight >= 80 && ev.verified && !items.find(i => i.evidenceId === ev.id)) {
        items.push({
          evidenceId: ev.id,
          type: ev.type,
          value: ev.value,
          weight: ev.weight,
          verified: ev.verified,
        });
      }
    }
    return items.slice(0, 5); // max 5 support items per recommendation
  }
}
